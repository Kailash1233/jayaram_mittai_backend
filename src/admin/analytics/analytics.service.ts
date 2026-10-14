import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.module.js';

/** Shape of a single order item stored in the orders.items JSONB array. */
interface OrderItem {
  name: string;
  price: number;
  unit: string;
  quantity: number;
  line_total: number;
}

/** Shape of delivery_address stored in orders. */
interface DeliveryAddress {
  line1: string;
  city: string;
  pincode: string;
  zoneName: string;
}

/** Raw order row returned from Supabase. */
interface OrderRow {
  id: string;
  order_number: string;
  subtotal: number;
  delivery_charge: number;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  items: OrderItem[];
  delivery_address: DeliveryAddress;
  created_at: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Fetches all orders within an optional [from, to] date range. */
async function fetchOrders(
  supabase: SupabaseClient,
  from?: string,
  to?: string,
): Promise<OrderRow[]> {
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, subtotal, delivery_charge, total, status, payment_method, payment_status, items, delivery_address, created_at',
    )
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;

  if (error) {
    throw new InternalServerErrorException(
      `Failed to fetch orders for analytics: ${error.message}`,
    );
  }

  return (data ?? []) as OrderRow[];
}

/** Groups an array of strings and counts occurrences. */
function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── service ────────────────────────────────────────────────────────────────

/** Uses the secret-key client so analytics covers every customer's orders. */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ── GET /admin/analytics/sales ───────────────────────────────────────────

  /**
   * Sales analytics computed from the orders table.
   *
   * Returns:
   *  - summary  : total orders, revenue, avg order value, total delivery fees
   *  - byStatus : order count grouped by status
   *  - byPayment: order count grouped by payment_method
   *  - byDate   : daily revenue & order count (YYYY-MM-DD buckets)
   *  - topProducts: top 10 products by quantity sold
   *
   * @param from - ISO date string lower bound (inclusive), e.g. "2026-01-01"
   * @param to   - ISO date string upper bound (inclusive), e.g. "2026-12-31"
   */
  async getSalesAnalytics(from?: string, to?: string) {
    const orders = await fetchOrders(this.supabase, from, to);

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalDeliveryFees = orders.reduce(
      (s, o) => s + Number(o.delivery_charge),
      0,
    );
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Orders by status
    const byStatus = countBy(orders.map((o) => o.status));

    // Orders by payment method
    const byPayment = countBy(orders.map((o) => o.payment_method));

    // Daily revenue buckets
    const dailyMap: Record<string, { date: string; orders: number; revenue: number }> = {};
    for (const o of orders) {
      const day = o.created_at.slice(0, 10); // "YYYY-MM-DD"
      if (!dailyMap[day]) dailyMap[day] = { date: day, orders: 0, revenue: 0 };
      dailyMap[day].orders += 1;
      dailyMap[day].revenue += Number(o.total);
    }
    const byDate = Object.values(dailyMap);

    // Top products by total quantity sold
    const productMap: Record<string, { name: string; unitsSold: number; revenue: number }> = {};
    for (const o of orders) {
      for (const item of o.items ?? []) {
        if (!productMap[item.name]) {
          productMap[item.name] = { name: item.name, unitsSold: 0, revenue: 0 };
        }
        productMap[item.name].unitsSold += item.quantity;
        productMap[item.name].revenue += Number(item.line_total);
      }
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);

    return {
      summary: {
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalDeliveryFees: Math.round(totalDeliveryFees * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      },
      byStatus,
      byPayment,
      byDate,
      topProducts,
    };
  }

  // ── GET /admin/analytics/stock-outs ─────────────────────────────────────

  /**
   * Returns products that are out of stock or below a low-stock threshold.
   *
   * Queries the Supabase `products` table (managed by TypeORM entity).
   *
   * @param threshold - stock quantity at or below which a product is "low stock"
   *                    defaults to 10
   */
  async getStockOuts(threshold = 10) {
    const { data, error } = await this.supabase
      .from('products')
      .select('id, name, category, stock, "isActive"')
      .lte('stock', threshold)
      .order('stock', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch stock data: ${error.message}`,
      );
    }

    const rows = (data ?? []) as {
      id: string;
      name: string;
      category: string;
      stock: number;
      isActive: boolean;
    }[];

    const outOfStock = rows.filter((p) => p.stock === 0);
    const lowStock = rows.filter((p) => p.stock > 0 && p.stock <= threshold);

    return {
      threshold,
      summary: {
        outOfStockCount: outOfStock.length,
        lowStockCount: lowStock.length,
        totalAtRisk: rows.length,
      },
      outOfStock,
      lowStock,
    };
  }

  // ── GET /admin/analytics/zones ───────────────────────────────────────────

  /**
   * Delivery zone analytics aggregated from orders.
   *
   * Returns per-zone breakdown of:
   *  - orderCount, totalRevenue, avgOrderValue
   *  - statusBreakdown (count per status within the zone)
   *
   * @param from - ISO date string lower bound (inclusive)
   * @param to   - ISO date string upper bound (inclusive)
   */
  async getZoneAnalytics(from?: string, to?: string) {
    const orders = await fetchOrders(this.supabase, from, to);

    const zoneMap: Record<
      string,
      {
        zoneName: string;
        orderCount: number;
        totalRevenue: number;
        totalDeliveryFees: number;
        statusBreakdown: Record<string, number>;
      }
    > = {};

    for (const o of orders) {
      const zoneName = o.delivery_address?.zoneName ?? 'Unknown';

      if (!zoneMap[zoneName]) {
        zoneMap[zoneName] = {
          zoneName,
          orderCount: 0,
          totalRevenue: 0,
          totalDeliveryFees: 0,
          statusBreakdown: {},
        };
      }

      const zone = zoneMap[zoneName];
      zone.orderCount += 1;
      zone.totalRevenue += Number(o.total);
      zone.totalDeliveryFees += Number(o.delivery_charge);
      zone.statusBreakdown[o.status] =
        (zone.statusBreakdown[o.status] ?? 0) + 1;
    }

    const zones = Object.values(zoneMap).map((z) => ({
      ...z,
      totalRevenue: Math.round(z.totalRevenue * 100) / 100,
      totalDeliveryFees: Math.round(z.totalDeliveryFees * 100) / 100,
      avgOrderValue:
        z.orderCount > 0
          ? Math.round((z.totalRevenue / z.orderCount) * 100) / 100
          : 0,
    }));

    // Sort by order count descending
    zones.sort((a, b) => b.orderCount - a.orderCount);

    return {
      totalZones: zones.length,
      zones,
    };
  }
}
