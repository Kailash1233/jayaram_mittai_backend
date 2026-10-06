import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module.js';

// ─── DTO classes ─────────────────────────────────────────────────────────────
// Must be classes (not interfaces) so TypeScript can emit decorator metadata
// when isolatedModules + emitDecoratorMetadata are both enabled.

export class CreateZoneDto {
  name!: string;
  pincodes!: string[];
  radiusKm?: number;
  isActive?: boolean;
}

export class UpdateZoneDto {
  name?: string;
  pincodes?: string[];
  radiusKm?: number;
  isActive?: boolean;
}

export class CreateRuleDto {
  /** UUID of the zone this rule applies to. Null = global fallback rule. */
  zoneId?: string | null;
  /** Minimum order subtotal (₹) required for this fee tier. */
  minOrder!: number;
  /** Delivery fee (₹) charged when subtotal >= minOrder. */
  fee!: number;
  isActive?: boolean;
}

export class UpdateRuleDto {
  zoneId?: string | null;
  minOrder?: number;
  fee?: number;
  isActive?: boolean;
}

/** day_of_week: 0=Sunday … 6=Saturday. Use null for date-specific overrides. */
export class CreateHoursDto {
  dayOfWeek?: number | null;        // 0–6 for weekly schedule
  overrideDate?: string | null;     // "YYYY-MM-DD" for a specific date override
  openTime!: string;                // "HH:MM" 24-h
  closeTime!: string;               // "HH:MM" 24-h
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

async function assertExists(
  supabase: SupabaseClient,
  table: string,
  id: string,
  label: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalServerErrorException(
      `Failed to look up ${label}: ${error.message}`,
    );
  }
  if (!data) {
    throw new NotFoundException(`${label} with id "${id}" not found.`);
  }
}

// ─── service ────────────────────────────────────────────────────────────────

@Injectable()
export class AdminDeliveryService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  //  ZONES  (/admin/delivery/zones)
  // ══════════════════════════════════════════════════════════════════════════

  /** List all delivery zones, newest first. */
  async findAllZones() {
    const { data, error } = await this.supabase
      .from('delivery_zones')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch zones: ${error.message}`,
      );
    }
    return data ?? [];
  }

  /** Create a new delivery zone. */
  async createZone(dto: CreateZoneDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Zone name is required.');
    }
    if (!Array.isArray(dto.pincodes) || dto.pincodes.length === 0) {
      throw new BadRequestException('At least one pincode is required.');
    }

    const payload = {
      name: dto.name.trim(),
      pincodes: dto.pincodes.map((p) => p.trim()),
      radius_km: dto.radiusKm ?? null,
      is_active: dto.isActive ?? true,
    };

    const { data, error } = await this.supabase
      .from('delivery_zones')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create zone: ${error.message}`,
      );
    }
    return data;
  }

  /** Partially update a delivery zone. */
  async updateZone(id: string, dto: UpdateZoneDto) {
    await assertExists(this.supabase, 'delivery_zones', id, 'Zone');

    const payload: Record<string, unknown> = {};
    if (dto.name !== undefined) payload['name'] = dto.name.trim();
    if (dto.pincodes !== undefined)
      payload['pincodes'] = dto.pincodes.map((p) => p.trim());
    if (dto.radiusKm !== undefined) payload['radius_km'] = dto.radiusKm;
    if (dto.isActive !== undefined) payload['is_active'] = dto.isActive;

    const { data, error } = await this.supabase
      .from('delivery_zones')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update zone: ${error.message}`,
      );
    }
    return data;
  }

  /** Delete a delivery zone by id. */
  async deleteZone(id: string) {
    await assertExists(this.supabase, 'delivery_zones', id, 'Zone');

    const { error } = await this.supabase
      .from('delivery_zones')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete zone: ${error.message}`,
      );
    }
    return { deleted: true, id };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RULES  (/admin/delivery/rules)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * List all delivery rules.
   * Rules are ordered: per-zone rules first (zone_id not null),
   * then global fallbacks, each tier ordered by min_order ascending.
   */
  async findAllRules() {
    const { data, error } = await this.supabase
      .from('delivery_rules')
      .select('*, delivery_zones(name)')
      .order('min_order', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch rules: ${error.message}`,
      );
    }
    return data ?? [];
  }

  /** Create a delivery fee rule. */
  async createRule(dto: CreateRuleDto) {
    if (dto.minOrder === undefined || dto.minOrder < 0) {
      throw new BadRequestException('minOrder must be 0 or a positive number.');
    }
    if (dto.fee === undefined || dto.fee < 0) {
      throw new BadRequestException('fee must be 0 or a positive number.');
    }

    // Validate zoneId if provided
    if (dto.zoneId) {
      await assertExists(this.supabase, 'delivery_zones', dto.zoneId, 'Zone');
    }

    const payload = {
      zone_id: dto.zoneId ?? null,
      min_order: dto.minOrder,
      fee: dto.fee,
      is_active: dto.isActive ?? true,
    };

    const { data, error } = await this.supabase
      .from('delivery_rules')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create rule: ${error.message}`,
      );
    }
    return data;
  }

  /** Partially update a delivery fee rule. */
  async updateRule(id: string, dto: UpdateRuleDto) {
    await assertExists(this.supabase, 'delivery_rules', id, 'Rule');

    if (dto.zoneId) {
      await assertExists(this.supabase, 'delivery_zones', dto.zoneId, 'Zone');
    }

    const payload: Record<string, unknown> = {};
    if (dto.zoneId !== undefined) payload['zone_id'] = dto.zoneId;
    if (dto.minOrder !== undefined) payload['min_order'] = dto.minOrder;
    if (dto.fee !== undefined) payload['fee'] = dto.fee;
    if (dto.isActive !== undefined) payload['is_active'] = dto.isActive;

    const { data, error } = await this.supabase
      .from('delivery_rules')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update rule: ${error.message}`,
      );
    }
    return data;
  }

  /** Delete a delivery fee rule. */
  async deleteRule(id: string) {
    await assertExists(this.supabase, 'delivery_rules', id, 'Rule');

    const { error } = await this.supabase
      .from('delivery_rules')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete rule: ${error.message}`,
      );
    }
    return { deleted: true, id };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HOURS  (/admin/delivery/hours)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns all operating hours entries.
   * Response contains two groups:
   *   - weeklySchedule : the regular Mon–Sun hours (day_of_week 0–6)
   *   - overrides      : date-specific entries that override the weekly schedule
   */
  async findAllHours() {
    const { data, error } = await this.supabase
      .from('delivery_hours')
      .select('*')
      .order('day_of_week', { ascending: true, nullsFirst: false });

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
    if (dto.dayOfWeek === undefined && !dto.overrideDate) {
      throw new BadRequestException(
        'Either dayOfWeek (0–6) or overrideDate (YYYY-MM-DD) must be provided.',
      );
    }
    if (dto.dayOfWeek !== undefined && dto.overrideDate) {
      throw new BadRequestException(
        'Provide either dayOfWeek OR overrideDate, not both.',
      );
    }
    if (
      dto.dayOfWeek != null &&
      (dto.dayOfWeek < 0 || dto.dayOfWeek > 6)
    ) {
      throw new BadRequestException('dayOfWeek must be between 0 (Sun) and 6 (Sat).');
    }

    const isClosed = dto.isClosed ?? false;

    if (!isClosed) {
      if (!dto.openTime || !dto.closeTime) {
        throw new BadRequestException(
          'openTime and closeTime are required when isClosed is false.',
        );
      }
    }

    const payload = {
      day_of_week: dto.dayOfWeek ?? null,
      override_date: dto.overrideDate ?? null,
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
      throw new InternalServerErrorException(
        `Failed to create hours entry: ${error.message}`,
      );
    }
    return data;
  }

  /** Partially update an operating hours entry. */
  async updateHours(id: string, dto: UpdateHoursDto) {
    await assertExists(this.supabase, 'delivery_hours', id, 'Hours entry');

    const payload: Record<string, unknown> = {};
    if (dto.openTime !== undefined) payload['open_time'] = dto.openTime;
    if (dto.closeTime !== undefined) payload['close_time'] = dto.closeTime;
    if (dto.isClosed !== undefined) payload['is_closed'] = dto.isClosed;
    if (dto.note !== undefined) payload['note'] = dto.note;

    const { data, error } = await this.supabase
      .from('delivery_hours')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update hours entry: ${error.message}`,
      );
    }
    return data;
  }

  /** Delete an operating hours entry (e.g. remove a date override). */
  async deleteHours(id: string) {
    await assertExists(this.supabase, 'delivery_hours', id, 'Hours entry');

    const { error } = await this.supabase
      .from('delivery_hours')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete hours entry: ${error.message}`,
      );
    }
    return { deleted: true, id };
  }
}
