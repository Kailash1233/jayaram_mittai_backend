import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.module.js';

// ─── DTO classes ─────────────────────────────────────────────────────────────
// Must be classes (not interfaces) so TypeScript can emit decorator metadata
// when isolatedModules + emitDecoratorMetadata are both enabled.

/**
 * A `deliveryzones` row — the same table checkout prices orders from.
 * Omitted charge/threshold/hours fall back to checkout's defaults.
 */
export class CreateZoneDto {
  locationName!: string;
  pincodes!: string[];
  /** Delivery fee (₹). */
  deliveryCharge?: number;
  /** Subtotal (₹) above which delivery is free. */
  freeDeliveryAbove?: number;
  estimatedHours?: number;
}

export class UpdateZoneDto {
  locationName?: string;
  pincodes?: string[];
  deliveryCharge?: number;
  freeDeliveryAbove?: number;
  estimatedHours?: number;
}

/** day_of_week: 0=Sunday … 6=Saturday. Use null for date-specific overrides. */
export class CreateHoursDto {
  dayOfWeek?: number | null;        // 0–6 for weekly schedule
  overrideDate?: string | null;     // "YYYY-MM-DD" for a specific date override
  openTime?: string;                // "HH:MM" 24-h; required unless isClosed
  closeTime?: string;               // "HH:MM" 24-h; required unless isClosed
  isClosed?: boolean;               // true = holiday / closed that day
  note?: string;                    // e.g. "Diwali holiday"
}

export class UpdateHoursDto {
  openTime?: string;
  closeTime?: string;
  isClosed?: boolean;
  note?: string;
}


// ─── helpers ────────────────────────────────────────────────────────────────

// Postgres error codes
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

const PINCODE = /^\d{6}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ZoneRow {
  id: number;
  location_name: string;
  pincodes: string[] | null;
}

/** Ids are bigints; anything else can't match a row. */
function assertId(id: string, label: string): void {
  if (!/^\d+$/.test(id)) {
    throw new NotFoundException(`${label} with id "${id}" not found.`);
  }
}

function assertWholeNumber(value: unknown, field: string, min: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new BadRequestException(
      `${field} must be a whole number of at least ${min}.`,
    );
  }
}

/** Trimmed, de-duplicated 6-digit pincodes. */
function normalisePincodes(pincodes: unknown): string[] {
  if (!Array.isArray(pincodes) || pincodes.length === 0) {
    throw new BadRequestException('At least one pincode is required.');
  }
  const cleaned = pincodes.map((p) => String(p).trim());
  const invalid = cleaned.filter((p) => !PINCODE.test(p));
  if (invalid.length > 0) {
    throw new BadRequestException(
      `Pincodes must be 6 digits. Invalid: ${invalid.join(', ')}.`,
    );
  }
  return [...new Set(cleaned)];
}

function assertTime(value: unknown, field: string): void {
  if (typeof value !== 'string' || !TIME.test(value)) {
    throw new BadRequestException(`${field} must be "HH:MM" (24-hour).`);
  }
}

/** Maps constraint violations to 409/400; anything else is a 500. */
function throwWriteError(
  action: string,
  error: PostgrestError,
  conflictMessage: string,
): never {
  if (error.code === UNIQUE_VIOLATION) {
    throw new ConflictException(conflictMessage);
  }
  if (error.code === CHECK_VIOLATION) {
    throw new BadRequestException(`Invalid values: ${error.message}`);
  }
  throw new InternalServerErrorException(
    `Failed to ${action}: ${error.message}`,
  );
}

// ─── service ────────────────────────────────────────────────────────────────

/** Uses the secret-key client: these tables are read-only (or closed) to anon. */
@Injectable()
export class AdminDeliveryService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  //  ZONES  (/admin/delivery/zones)
  // ══════════════════════════════════════════════════════════════════════════

  /** List all delivery zones in id order. */
  async findAllZones() {
    const { data, error } = await this.supabase
      .from('deliveryzones')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch zones: ${error.message}`,
      );
    }
    return data ?? [];
  }

  /** Create a new delivery zone. */
  async createZone(dto: CreateZoneDto) {
    if (!dto.locationName?.trim()) {
      throw new BadRequestException('locationName is required.');
    }
    const pincodes = normalisePincodes(dto.pincodes);
    await this.assertPincodesUnclaimed(pincodes);

    const payload = {
      location_name: dto.locationName.trim(),
      pincodes,
      ...this.zoneSettings(dto),
    };

    const { data, error } = await this.supabase
      .from('deliveryzones')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throwWriteError('create zone', error, 'A zone with that id already exists.');
    }
    return data;
  }

  /** Partially update a delivery zone. */
  async updateZone(id: string, dto: UpdateZoneDto) {
    assertId(id, 'Zone');

    const payload: Record<string, unknown> = this.zoneSettings(dto);
    if (dto.locationName !== undefined) {
      if (!dto.locationName.trim()) {
        throw new BadRequestException('locationName cannot be empty.');
      }
      payload['location_name'] = dto.locationName.trim();
    }
    if (dto.pincodes !== undefined) {
      const pincodes = normalisePincodes(dto.pincodes);
      await this.assertPincodesUnclaimed(pincodes, Number(id));
      payload['pincodes'] = pincodes;
    }
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No fields to update.');
    }

    const { data, error } = await this.supabase
      .from('deliveryzones')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      throwWriteError('update zone', error, 'Zone update conflicts with an existing zone.');
    }
    if (!data) {
      throw new NotFoundException(`Zone with id "${id}" not found.`);
    }
    return data;
  }

  /** Delete a delivery zone by id. Its pincodes stop being deliverable. */
  async deleteZone(id: string) {
    assertId(id, 'Zone');

    const { data, error } = await this.supabase
      .from('deliveryzones')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete zone: ${error.message}`,
      );
    }
    if (!data?.length) {
      throw new NotFoundException(`Zone with id "${id}" not found.`);
    }
    return { deleted: true, id };
  }

  /** Validated charge/threshold/hours columns present in `dto`. */
  private zoneSettings(dto: UpdateZoneDto) {
    const settings: Record<string, number> = {};
    if (dto.deliveryCharge !== undefined) {
      assertWholeNumber(dto.deliveryCharge, 'deliveryCharge', 0);
      settings['delivery_charge'] = dto.deliveryCharge;
    }
    if (dto.freeDeliveryAbove !== undefined) {
      assertWholeNumber(dto.freeDeliveryAbove, 'freeDeliveryAbove', 0);
      settings['free_delivery'] = dto.freeDeliveryAbove;
    }
    if (dto.estimatedHours !== undefined) {
      assertWholeNumber(dto.estimatedHours, 'estimatedHours', 1);
      settings['estimated_hours'] = dto.estimatedHours;
    }
    return settings;
  }

  /**
   * Checkout uses the first zone listing a pincode, so a pincode in two
   * zones would be priced by whichever comes first. Reject that.
   */
  private async assertPincodesUnclaimed(pincodes: string[], exceptZoneId?: number) {
    const { data, error } = await this.supabase
      .from('deliveryzones')
      .select('id, location_name, pincodes')
      .overlaps('pincodes', pincodes);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to check pincodes: ${error.message}`,
      );
    }

    const clashes = ((data ?? []) as ZoneRow[])
      .filter((zone) => zone.id !== exceptZoneId)
      .map((zone) => {
        const shared = pincodes.filter((p) => zone.pincodes?.includes(p));
        return `${shared.join(', ')} (${zone.location_name})`;
      });

    if (clashes.length > 0) {
      throw new ConflictException(
        `Pincodes already belong to another zone: ${clashes.join('; ')}.`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HOURS  (/admin/delivery/hours)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns all operating hours entries.
   * Response contains two groups:
   *   - weeklySchedule : the regular Sun–Sat hours (day_of_week 0–6)
   *   - overrides      : date-specific entries that override the weekly schedule
   */
  async findAllHours() {
    const { data, error } = await this.supabase
      .from('delivery_hours')
      .select('*')
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('override_date', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch operating hours: ${error.message}`,
      );
    }

    const rows = data ?? [];
    const weeklySchedule = rows.filter((r: any) => r.day_of_week !== null);
    const overrides = rows.filter((r: any) => r.override_date !== null);

    return { weeklySchedule, overrides };
  }

  /**
   * Create an operating hours entry.
   * Either dayOfWeek (0–6) OR overrideDate ("YYYY-MM-DD") must be provided, not both.
   */
  async createHours(dto: CreateHoursDto) {
    const hasDay = dto.dayOfWeek != null;
    const hasDate = !!dto.overrideDate;

    if (hasDay === hasDate) {
      throw new BadRequestException(
        'Provide either dayOfWeek (0–6) or overrideDate (YYYY-MM-DD), not both.',
      );
    }
    if (hasDay) {
      assertWholeNumber(dto.dayOfWeek, 'dayOfWeek', 0);
      if (dto.dayOfWeek! > 6) {
        throw new BadRequestException('dayOfWeek must be between 0 (Sun) and 6 (Sat).');
      }
    }
    if (hasDate && !DATE.test(dto.overrideDate!)) {
      throw new BadRequestException('overrideDate must be "YYYY-MM-DD".');
    }

    const isClosed = dto.isClosed ?? false;
    if (!isClosed || dto.openTime !== undefined) assertTime(dto.openTime, 'openTime');
    if (!isClosed || dto.closeTime !== undefined) assertTime(dto.closeTime, 'closeTime');

    const payload = {
      day_of_week: hasDay ? dto.dayOfWeek : null,
      override_date: hasDate ? dto.overrideDate : null,
      open_time: dto.openTime ?? null,
      close_time: dto.closeTime ?? null,
      is_closed: isClosed,
      note: dto.note ?? null,
    };

    const { data, error } = await this.supabase
      .from('delivery_hours')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throwWriteError(
        'create hours entry',
        error,
        hasDay
          ? `Hours for day ${dto.dayOfWeek} already exist; update that entry instead.`
          : `An override for ${dto.overrideDate} already exists; update that entry instead.`,
      );
    }
    return data;
  }

  /** Partially update an operating hours entry. */
  async updateHours(id: string, dto: UpdateHoursDto) {
    assertId(id, 'Hours entry');

    const payload: Record<string, unknown> = {};
    if (dto.openTime !== undefined) {
      assertTime(dto.openTime, 'openTime');
      payload['open_time'] = dto.openTime;
    }
    if (dto.closeTime !== undefined) {
      assertTime(dto.closeTime, 'closeTime');
      payload['close_time'] = dto.closeTime;
    }
    if (dto.isClosed !== undefined) payload['is_closed'] = dto.isClosed;
    if (dto.note !== undefined) payload['note'] = dto.note;

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No fields to update.');
    }

    const { data, error } = await this.supabase
      .from('delivery_hours')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      throwWriteError('update hours entry', error, 'Hours entry conflicts with another.');
    }
    if (!data) {
      throw new NotFoundException(`Hours entry with id "${id}" not found.`);
    }
    return data;
  }

  /** Delete an operating hours entry (e.g. remove a date override). */
  async deleteHours(id: string) {
    assertId(id, 'Hours entry');

    const { data, error } = await this.supabase
      .from('delivery_hours')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete hours entry: ${error.message}`,
      );
    }
    if (!data?.length) {
      throw new NotFoundException(`Hours entry with id "${id}" not found.`);
    }
    return { deleted: true, id };
  }
}
