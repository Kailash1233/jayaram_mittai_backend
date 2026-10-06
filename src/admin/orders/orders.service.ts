import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module.js';

/** Recognised order status values that admins may set. */
export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

const VALID_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

@Injectable()
export class AdminOrdersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * GET /admin/orders
   *
   * Returns the live order queue — all orders sorted by creation date
   * (newest first).  Optionally filter by status via query param.
   *
   * @param status - Optional status filter (e.g. "confirmed", "preparing").
   * @returns Array of order records.
   */
  async findAll(status?: string): Promise<unknown[]> {
    let query = this.supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      if (!VALID_STATUSES.includes(status as OrderStatus)) {
        throw new BadRequestException(
          `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}.`,
        );
      }
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch orders: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * GET /admin/orders/:id
   *
   * Returns a single order by its internal ID.
   *
   * @param id - The order's `id` column value.
   * @throws NotFoundException when no order with the given id exists.
   */
  async findOne(id: string): Promise<unknown> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch order: ${error.message}`,
      );
    }

    if (!data) {
      throw new NotFoundException(`Order with id "${id}" not found.`);
    }

    return data;
  }

  /**
   * PATCH /admin/orders/:id/status
   *
   * Updates the status of an order.  Useful for the live admin queue
   * (e.g. mark an order as "preparing", "out_for_delivery", etc.).
   *
   * @param id     - The order's `id` column value.
   * @param status - The new status to set.
   * @returns The updated order record.
   */
  async updateStatus(id: string, status: string): Promise<unknown> {
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      throw new BadRequestException(
        `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}.`,
      );
    }

    // Confirm the order exists before updating
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update order status: ${error.message}`,
      );
    }

    return data;
  }
}
