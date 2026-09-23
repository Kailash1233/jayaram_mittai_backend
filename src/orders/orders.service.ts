import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';

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
  zoneId: string;
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

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
}

const CATALOG_PRODUCTS: CatalogProduct[] = [
  { id: 'milk_mysore_pak', name: 'Milk Mysore Pak', price: 180, unit: '250g' },
  { id: 'prod-rasamalai', name: 'Royal Rasamalai', price: 120, unit: '2 pcs' },
  { id: 'prod-basundi', name: 'Rich Badam Basundi', price: 140, unit: '250g' },
  {
    id: 'prod-badam-milk',
    name: 'Pure Kesari Badam Milk',
    price: 90,
    unit: '300ml',
  },
  {
    id: 'prod-paneer-tikka',
    name: 'Tandoori Paneer Tikka',
    price: 240,
    unit: '6 pcs',
  },
];

const DELIVERY_ZONES: Record<string, { name: string; radiusKm: number }> = {
  zone_chennai_central: { name: 'Chennai Central', radiusKm: 3.5 },
  zone_chennai_south: { name: 'Chennai South', radiusKm: 7.5 },
  zone_chennai_north: { name: 'Chennai North', radiusKm: 10 },
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    const {
      customer,
      address,
      items,
      paymentMethod,
      idempotencyKey,
      customerNotes,
    } = dto;


    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const getOrderCountFromDB = async () => {
      const { data, error } = await this.supabase
        .from('orders')
        .select('order_number')
        .like('order_number', `JM-${dateStr}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to get latest order: ${error.message}`);
      }

      if (!data) {
        return String(1);
      }

      const lastOrderNumber = data.order_number;

      // JM-2026/09/19-5 → 5
      const lastNumber = parseInt(lastOrderNumber.split('-').pop()!, 10);

      return String(lastNumber + 1);
    };

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

    const verifiedItems = items.map((item) => {
      if (!item || item.quantity <= 0) {
        throw new BadRequestException(
          'Item quantities must be positive integers.',
        );
      }

      const product = CATALOG_PRODUCTS.find(
        (entry) => entry.id === item.productId,
      );
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

    const matchedZone = DELIVERY_ZONES[address.zoneId] ?? {
      name: 'Chennai Central',
      radiusKm: 3.5,
    };

    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const deliveryCharge =
      subtotal > 1000 ? 0 : matchedZone.radiusKm < 5 ? 50 : 100;
    const total = subtotal + deliveryCharge;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCount = await getOrderCountFromDB();
    const orderNumber = `JM-${dateStr}-${orderCount}`;
    const orderId = `ord_${Date.now()}_${randomSuffix}`;

    const orderRecord = {
      id: orderId,
      order_number: orderNumber,
      subtotal: subtotal,
      delivery_charge: deliveryCharge,
      total: total,
      status: 'confirmed',
      estimated_hours:
        matchedZone.radiusKm < 5 ? 2 : matchedZone.radiusKm < 8 ? 3 : 4,
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
        zoneName: matchedZone.name,
      },
      customer_notes: customerNotes || undefined,
    };

    // Attempt to persist the order to Supabase (non-blocking on failure)
    try {
      const { data, error } = await this.supabase
        .from('orders')
        .insert(orderRecord);
      console.log('Supabase insert result:', { data, error });
    } catch (err: any) {
      // swallow errors for now — keep returning success to caller
      // In production you'd log or instrument this failure
      throw new Error(`Failed to persist order to Supabase: ${err.message}`);
    }

    return {
      success: true,
      order: orderRecord,
    };
  }


async getOrderById(orderNumber: string) {
  const { data, error } = await this.supabase
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new NotFoundException(
      `Order '${orderNumber}' not found`,
    );
  }

  return data;
}

  async getOrders() {
    const { data, error } = await this.supabase.from('orders').select('*');
    if (error) {
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    if (!data) {
    throw new NotFoundException(
      `No orders found`,
    );
  }
    return data;
  }
}
