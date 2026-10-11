import {
  BadRequestException,
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_CLIENT,
  SUPABASE_CLIENT_FACTORY,
  type SupabaseClientFactory,
} from '../supabase/supabase.module.js';
import type { AuthenticatedCustomer } from '../common/guards/supabase-auth.guard.js';

export interface OrderCustomerInput {
  fullName: string;
  phone: string;
  email?: string;
}

export interface OrderAddressInput {
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  /** Ignored: the zone is matched from `deliveryzones` by pincode. */
  zoneId?: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderDto {
  customer: OrderCustomerInput;
  address: OrderAddressInput;
  items: OrderItemInput[];
  paymentMethod:
    'debit_card' | 'credit_card' | 'upi' | 'net_banking' | 'sodexo';
  idempotencyKey: string;
  customerNotes?: string;
}

/** An entry in a `products` row's `products` array. */
interface CatalogProduct {
  product_id: string;
  name: string;
  price: number;
  unit?: string;
}

/** A `deliveryzones` row. Charge/hours columns are optional until added. */
interface DeliveryZone {
  id: number;
  location_name: string;
  pincodes: string[] | null;
  delivery_charge?: number | null;
  estimated_hours?: number | null;
  /** Subtotal above which delivery is free. */
  free_delivery?: number | null;
}

// Used when a zone has no value of its own for these columns
const DEFAULT_FREE_DELIVERY_ABOVE = 1000;
const DEFAULT_DELIVERY_CHARGE = 50;
const DEFAULT_ESTIMATED_HOURS = 2;

// Postgres error code for a unique constraint violation
const UNIQUE_VIOLATION = '23505';

// Order numbers carry the shop's local date
const ORDER_TIME_ZONE = 'Asia/Kolkata';

/**
 * Order rows are read and written with the logged-in customer's own client
 * (`account.accessToken`), so Supabase RLS applies as that customer.
 * Catalogue and zone lookups use the shared client.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    @Inject(SUPABASE_CLIENT_FACTORY)
    private readonly clients: SupabaseClientFactory,
  ) {}

  /** `account` is the logged-in customer placing the order. */
  async createOrder(dto: CreateOrderDto, account: AuthenticatedCustomer) {
    const {
      customer,
      address,
      items,
      paymentMethod,
      idempotencyKey,
      customerNotes,
    } = dto;

    if (
      !customer?.fullName ||
      !customer?.phone ||
      !address?.line1 ||
      !address?.pincode
    ) {
      throw new BadRequestException(
        'Missing required customer or delivery address information.',
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(
        'Cart is empty. Please add items before checking out.',
      );
    }

    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency key is required to prevent duplicate order creation.',
      );
    }

    if (items.some((item) => !item || item.quantity <= 0)) {
      throw new BadRequestException(
        'Item quantities must be positive integers.',
      );
    }

    const db = this.clients.createForUser(account.accessToken);

    // A retry or double-submit reuses the key: return the original order
    const existingOrder = await this.findOrderByIdempotencyKey(
      db,
      account.id,
      idempotencyKey,
    );
    if (existingOrder) {
      return { success: true, isDuplicate: true, order: existingOrder };
    }

    const [catalog, matchedZone] = await Promise.all([
      this.loadCatalog(),
      this.findZoneByPincode(address.pincode),
    ]);

    if (!matchedZone) {
      throw new BadRequestException(
        `Sorry, we don't deliver to pincode "${address.pincode}" yet.`,
      );
    }

    // Prices always come from the DB, never from the request
    const verifiedItems = items.map((item) => {
      const product = catalog.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Product ID "${item.productId}" was not found in active catalogue.`,
        );
      }

      return {
        product,
        quantity: item.quantity,
      };
    });

    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const freeDeliveryAbove =
      matchedZone.free_delivery ?? DEFAULT_FREE_DELIVERY_ABOVE;
    const deliveryCharge =
      subtotal > freeDeliveryAbove
        ? 0
        : (matchedZone.delivery_charge ?? DEFAULT_DELIVERY_CHARGE);
    const total = subtotal + deliveryCharge;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = await this.nextOrderNumber(db);
    const orderId = `ord_${Date.now()}_${randomSuffix}`;

    const orderRecord = {
      id: orderId,
      order_number: orderNumber,
      subtotal: subtotal,
      delivery_charge: deliveryCharge,
      total: total,
      status: 'confirmed',
      estimated_hours:
        matchedZone.estimated_hours ?? DEFAULT_ESTIMATED_HOURS,
      payment_status: 'paid',
      payment_method: paymentMethod,
      items: verifiedItems.map((entry) => ({
        name: entry.product.name,
        price: entry.product.price,
        unit: entry.product.unit,
        quantity: entry.quantity,
        line_total: entry.product.price * entry.quantity,
      })),
      customer: {
        fullName: customer.fullName,
        phone: customer.phone,
      },
      delivery_address: {
        line1: address.line1,
        city: address.city,
        pincode: address.pincode,
        zoneName: matchedZone.location_name,
      },
      customer_notes: customerNotes || undefined,
      idempotency_key: idempotencyKey,
      customer_id: account.id,
    };

    // Supabase reports failures via `error` rather than throwing
    const { error: insertError } = await db.from('orders').insert(orderRecord);

    if (insertError) {
      // Unique violation: a concurrent request with the same key won the race
      if (insertError.code === UNIQUE_VIOLATION) {
        const racedOrder = await this.findOrderByIdempotencyKey(
          db,
          account.id,
          idempotencyKey,
        );
        if (racedOrder) {
          return { success: true, isDuplicate: true, order: racedOrder };
        }
      }

      throw new InternalServerErrorException(
        `Failed to persist order: ${insertError.message}`,
      );
    }

    return {
      success: true,
      isDuplicate: false,
      order: orderRecord,
    };
  }

  /**
   * Returns e.g. `JM-2026/09/19-6`. The sequence comes from the
   * `next_order_seq` DB function, which increments a per-day counter
   * atomically, so concurrent checkouts never share a number.
   */
  private async nextOrderNumber(db: SupabaseClient) {
    // en-CA formats as YYYY-MM-DD; the day rolls over at midnight IST
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: ORDER_TIME_ZONE,
    }).format(new Date());

    const { data: seq, error } = await db.rpc('next_order_seq', {
      p_day: day,
    });

    if (error || typeof seq !== 'number') {
      throw new InternalServerErrorException(
        `Failed to generate order number: ${error?.message ?? 'no sequence returned'}`,
      );
    }

    return `JM-${day.replace(/-/g, '/')}-${seq}`;
  }

  /** All products across every category row, keyed by product_id. */
  private async loadCatalog() {
    const { data, error } = await this.supabase
      .from('products')
      .select('products');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to load product catalogue: ${error.message}`,
      );
    }

    const catalog = new Map<string, CatalogProduct>();
    for (const row of data ?? []) {
      for (const product of (row.products ?? []) as CatalogProduct[]) {
        catalog.set(product.product_id, product);
      }
    }
    return catalog;
  }

  private async findZoneByPincode(pincode: string) {
    const { data, error } = await this.supabase
      .from('deliveryzones')
      .select('*');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to load delivery zones: ${error.message}`,
      );
    }

    return ((data ?? []) as DeliveryZone[]).find((zone) =>
      zone.pincodes?.includes(pincode.trim()),
    );
  }

  private async findOrderByIdempotencyKey(
    db: SupabaseClient,
    customerId: string,
    idempotencyKey: string,
  ) {
    const { data, error } = await db
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to check for duplicate order: ${error.message}`,
      );
    }

    return data;
  }

  /** One of the customer's own orders; other customers' orders are 404. */
  async getOrderById(orderNumber: string, account: AuthenticatedCustomer) {
    // The customer_id filter is defence in depth on top of RLS
    const { data, error } = await this.clients
      .createForUser(account.accessToken)
      .from('orders')
      .select('*')
      .eq('customer_id', account.id)
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch order: ${error.message}`,
      );
    }

    if (!data) {
      throw new NotFoundException(`Order '${orderNumber}' not found`);
    }

    return data;
  }

  /** The customer's own orders, newest first. */
  async getOrders(account: AuthenticatedCustomer) {
    const { data, error } = await this.clients
      .createForUser(account.accessToken)
      .from('orders')
      .select('*')
      .eq('customer_id', account.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch orders: ${error.message}`,
      );
    }

    // No orders is an empty list, not an error
    return data ?? [];
  }
}
