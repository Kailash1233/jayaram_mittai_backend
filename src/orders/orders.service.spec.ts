import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  SUPABASE_CLIENT,
  SUPABASE_CLIENT_FACTORY,
} from '../supabase/supabase.module.js';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './orders.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
  type SupabaseResult,
} from '../../test/utils/supabase-mock.js';

// Shaped like the real `products` table: one row per category
const CATALOG_ROWS = [
  {
    products: [
      { product_id: 'royal-rasamalai', name: 'Royal Rasamalai', price: 120 },
      {
        product_id: 'rich-badam-basundi',
        name: 'Rich Badam Basundi',
        price: 140,
        unit: '250g',
      },
    ],
  },
  {
    products: [
      {
        product_id: 'tandoori-paneer-tikka',
        name: 'Tandoori Paneer Tikka',
        price: 240,
      },
    ],
  },
  { products: null },
];

// Shaped like the real `deliveryzones` table
const ZONES = [
  { id: 1, location_name: 'Pallavaram', pincodes: ['600043', '600075'] },
  {
    id: 2,
    location_name: 'Chromepet',
    pincodes: ['600044'],
    delivery_charge: 80,
    estimated_hours: 3,
    free_delivery: 500,
  },
  { id: 3, location_name: 'No Pincodes', pincodes: null },
];

describe('OrdersService', () => {
  let service: OrdersService;
  const supabase = createSupabaseMock();
  // By default the customer's client is the same mock, so table routing in
  // mockDb covers both; dedicated tests below check the split.
  const clients = {
    createAnonymous: vi.fn(),
    createForUser: vi.fn(() => supabase),
  };
  const account = {
    id: 'customer-1',
    phone: '+919840012345',
    accessToken: 'customer-token',
  };

  const buildDto = (overrides: Partial<CreateOrderDto> = {}): CreateOrderDto => ({
    customer: {
      fullName: 'Ramesh Kumar',
      phone: '9840012345',
      email: 'ramesh@example.com',
    },
    address: {
      line1: '12 Market Street',
      line2: 'Near Temple',
      city: 'Chennai',
      pincode: '600043',
    },
    items: [{ productId: 'royal-rasamalai', quantity: 2 }],
    paymentMethod: 'upi',
    idempotencyKey: 'test-key-1',
    customerNotes: 'Please ring bell',
    ...overrides,
  });

  const withPincode = (pincode: string) => ({
    address: { ...buildDto().address, pincode },
  });

  const create = (dto: CreateOrderDto) => service.createOrder(dto, account);

  /**
   * Answers `from(table)` by table name. `orders` is hit in sequence:
   * duplicate-key check, insert, then (only after a unique violation)
   * the raced-order lookup.
   */
  const mockDb = (
    opts: {
      duplicate?: SupabaseResult;
      products?: SupabaseResult;
      zones?: SupabaseResult;
      insert?: SupabaseResult;
      raced?: SupabaseResult;
      seq?: number;
    } = {},
  ) => {
    const duplicateQuery = createQueryBuilder(opts.duplicate ?? { data: null });
    const insertQuery = createQueryBuilder(opts.insert ?? { data: null });
    const racedQuery = createQueryBuilder(opts.raced ?? { data: null });
    const productsQuery = createQueryBuilder(
      opts.products ?? { data: CATALOG_ROWS },
    );
    const zonesQuery = createQueryBuilder(opts.zones ?? { data: ZONES });
    const orderQueries = [duplicateQuery, insertQuery, racedQuery];

    supabase.from.mockImplementation((table: string) => {
      if (table === 'products') return productsQuery;
      if (table === 'deliveryzones') return zonesQuery;
      if (table === 'orders') return orderQueries.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    if (opts.seq !== undefined) {
      supabase.rpc.mockResolvedValueOnce({ data: opts.seq, error: null });
    }
    return { duplicateQuery, insertQuery, productsQuery, zonesQuery };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    supabase.rpc.mockReset();
    supabase.rpc.mockResolvedValue({ data: 1, error: null });
    clients.createForUser.mockImplementation(() => supabase);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T10:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: SUPABASE_CLIENT, useValue: supabase },
        { provide: SUPABASE_CLIENT_FACTORY, useValue: clients },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    // Stubbed after compile: Nest uses Math.random for module ids.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createOrder', () => {
    describe('order number', () => {
      it('builds the order number from the DB sequence for today', async () => {
        const { insertQuery } = mockDb({ seq: 6 });

        const result = await create(buildDto());

        expect(result.success).toBe(true);
        expect(result.order.order_number).toBe('JM-2026/09/19-6');
        expect(result.order.id).toBe(`ord_${Date.now()}_1000`);
        expect(supabase.rpc).toHaveBeenCalledWith('next_order_seq', {
          p_day: '2026-09-19',
        });
        expect(insertQuery.insert).toHaveBeenCalledWith(result.order);
      });

      it('uses the IST date, which is a day ahead of UTC after 18:30 UTC', async () => {
        // 20:00 UTC on 19 Sep = 01:30 IST on 20 Sep
        vi.setSystemTime(new Date('2026-09-19T20:00:00Z'));
        mockDb({ seq: 1 });

        const result = await create(buildDto());

        expect(result.order.order_number).toBe('JM-2026/09/20-1');
        expect(supabase.rpc).toHaveBeenCalledWith('next_order_seq', {
          p_day: '2026-09-20',
        });
      });

      it('throws when the order sequence cannot be generated', async () => {
        mockDb();
        supabase.rpc.mockResolvedValueOnce({
          data: null,
          error: { message: 'function next_order_seq does not exist' },
        });

        const result = create(buildDto());
        await expect(result).rejects.toBeInstanceOf(
          InternalServerErrorException,
        );
        await expect(result).rejects.toThrow(
          'Failed to generate order number: function next_order_seq does not exist',
        );
      });

      it('throws when the sequence RPC returns no number', async () => {
        mockDb();
        supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

        await expect(create(buildDto())).rejects.toThrow(
          'Failed to generate order number: no sequence returned',
        );
      });
    });

    describe('products', () => {
      it('prices items from the products table and builds the order record', async () => {
        mockDb();

        const { order } = await create(
          buildDto({
            items: [
              { productId: 'royal-rasamalai', quantity: 2 },
              { productId: 'rich-badam-basundi', quantity: 1 },
            ],
          }),
        );

        expect(order).toMatchObject({
          subtotal: 380,
          delivery_charge: 50,
          total: 430,
          status: 'confirmed',
          payment_status: 'paid',
          payment_method: 'upi',
          estimated_hours: 2,
          customer_notes: 'Please ring bell',
          customer: { fullName: 'Ramesh Kumar', phone: '9840012345' },
          delivery_address: {
            line1: '12 Market Street',
            city: 'Chennai',
            pincode: '600043',
            zoneName: 'Pallavaram',
          },
        });
        expect(order.items).toEqual([
          { name: 'Royal Rasamalai', price: 120, quantity: 2, line_total: 240 },
          {
            name: 'Rich Badam Basundi',
            price: 140,
            unit: '250g',
            quantity: 1,
            line_total: 140,
          },
        ]);
      });

      it('finds products in any category row', async () => {
        mockDb();

        const { order } = await create(
          buildDto({ items: [{ productId: 'tandoori-paneer-tikka', quantity: 1 }] }),
        );

        expect(order.items[0]).toMatchObject({
          name: 'Tandoori Paneer Tikka',
          price: 240,
        });
      });

      it('ignores any price sent in the request', async () => {
        mockDb();
        const tamperedItem = { productId: 'royal-rasamalai', quantity: 1, price: 1 };

        const { order } = await create(
          buildDto({ items: [tamperedItem] }),
        );

        expect(order.items[0].price).toBe(120);
        expect(order.subtotal).toBe(120);
      });

      it('rejects a product that is not in the products table', async () => {
        const { insertQuery } = mockDb();

        await expect(
          create(
            buildDto({ items: [{ productId: 'prod-rasamalai', quantity: 1 }] }),
          ),
        ).rejects.toThrow('Product ID "prod-rasamalai" was not found');
        expect(supabase.rpc).not.toHaveBeenCalled();
        expect(insertQuery.insert).not.toHaveBeenCalled();
      });

      it('throws when the products table cannot be read', async () => {
        mockDb({ products: { error: { message: 'db down' } } });

        const result = create(buildDto());
        await expect(result).rejects.toBeInstanceOf(
          InternalServerErrorException,
        );
        await expect(result).rejects.toThrow(
          'Failed to load product catalogue: db down',
        );
      });
    });

    describe('delivery zone', () => {
      it("uses the zone's own delivery charge and hours when set", async () => {
        mockDb();

        const { order } = await create(buildDto(withPincode('600044')));

        expect(order.delivery_address.zoneName).toBe('Chromepet');
        expect(order.delivery_charge).toBe(80);
        expect(order.estimated_hours).toBe(3);
        expect(order.total).toBe(240 + 80);
      });

      it('falls back to the default charge and hours when the zone has none', async () => {
        mockDb();

        const { order } = await create(buildDto(withPincode('600075')));

        expect(order.delivery_address.zoneName).toBe('Pallavaram');
        expect(order.delivery_charge).toBe(50);
        expect(order.estimated_hours).toBe(2);
      });

      it('trims spaces around the pincode', async () => {
        mockDb();

        const { order } = await create(
          buildDto(withPincode(' 600044 ')),
        );

        expect(order.delivery_address.zoneName).toBe('Chromepet');
      });

      it('ignores zoneId and matches by pincode', async () => {
        mockDb();

        const { order } = await create(
          buildDto({
            address: { ...buildDto().address, zoneId: 'zone_chennai_north' },
          }),
        );

        expect(order.delivery_address.zoneName).toBe('Pallavaram');
      });

      it('rejects a pincode no zone covers', async () => {
        const { insertQuery } = mockDb();

        const result = create(buildDto(withPincode('600001')));
        await expect(result).rejects.toBeInstanceOf(BadRequestException);
        await expect(result).rejects.toThrow(
          `Sorry, we don't deliver to pincode "600001" yet.`,
        );
        expect(supabase.rpc).not.toHaveBeenCalled();
        expect(insertQuery.insert).not.toHaveBeenCalled();
      });

      it('throws when the delivery zones cannot be read', async () => {
        mockDb({ zones: { error: { message: 'db down' } } });

        await expect(create(buildDto())).rejects.toThrow(
          'Failed to load delivery zones: db down',
        );
      });

      it("waives delivery above the zone's own free_delivery amount", async () => {
        mockDb();

        // Chromepet: free_delivery 500
        const { order } = await create(
          buildDto({
            ...withPincode('600044'),
            items: [{ productId: 'royal-rasamalai', quantity: 5 }],
          }),
        );

        expect(order.subtotal).toBe(600);
        expect(order.delivery_charge).toBe(0);
        expect(order.total).toBe(600);
      });

      it("still charges delivery at exactly the zone's free_delivery amount", async () => {
        mockDb();

        const { order } = await create(
          buildDto({
            ...withPincode('600044'),
            items: [
              { productId: 'royal-rasamalai', quantity: 3 },
              { productId: 'rich-badam-basundi', quantity: 1 },
            ],
          }),
        );

        expect(order.subtotal).toBe(500);
        expect(order.delivery_charge).toBe(80);
      });

      it('waives delivery above 1000 when the zone has no free_delivery', async () => {
        mockDb();

        // Pallavaram: no free_delivery → default 1000
        const { order } = await create(
          buildDto({ items: [{ productId: 'tandoori-paneer-tikka', quantity: 5 }] }),
        );

        expect(order.subtotal).toBe(1200);
        expect(order.delivery_charge).toBe(0);
      });

      it('still charges delivery at exactly 1000 when the zone has no free_delivery', async () => {
        mockDb();

        const { order } = await create(
          buildDto({
            items: [
              { productId: 'tandoori-paneer-tikka', quantity: 1 },
              { productId: 'rich-badam-basundi', quantity: 2 },
              { productId: 'royal-rasamalai', quantity: 4 },
            ],
          }),
        );

        expect(order.subtotal).toBe(1000);
        expect(order.delivery_charge).toBe(50);
      });
    });

    describe('validation', () => {
      it('stores customer_notes as undefined when empty', async () => {
        mockDb();

        const { order } = await create(
          buildDto({ customerNotes: '' }),
        );

        expect(order.customer_notes).toBeUndefined();
      });

      it.each<[string, Partial<CreateOrderDto>]>([
        ['full name', { customer: { fullName: '', phone: '9840012345' } }],
        ['phone', { customer: { fullName: 'Ramesh', phone: '' } }],
        [
          'address line1',
          { address: { line1: '', city: 'Chennai', pincode: '600043' } },
        ],
        [
          'pincode',
          { address: { line1: '12 Market St', city: 'Chennai', pincode: '' } },
        ],
      ])('rejects a missing %s', async (_field, overrides) => {
        await expect(
          create(buildDto(overrides)),
        ).rejects.toThrow(
          'Missing required customer or delivery address information.',
        );
        expect(supabase.from).not.toHaveBeenCalled();
      });

      it('rejects an empty cart', async () => {
        await expect(
          create(buildDto({ items: [] })),
        ).rejects.toThrow('Cart is empty');
        expect(supabase.from).not.toHaveBeenCalled();
      });

      it('rejects a missing idempotency key', async () => {
        await expect(
          create(buildDto({ idempotencyKey: '' })),
        ).rejects.toThrow('Idempotency key is required');
      });

      it.each([0, -1])('rejects quantity %d without touching the DB', async (quantity) => {
        await expect(
          create(
            buildDto({ items: [{ productId: 'royal-rasamalai', quantity }] }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(supabase.from).not.toHaveBeenCalled();
      });

      it('throws instead of reporting success when the insert fails', async () => {
        mockDb({ insert: { error: { message: 'violates not-null' } } });

        const result = create(buildDto());
        await expect(result).rejects.toBeInstanceOf(
          InternalServerErrorException,
        );
        await expect(result).rejects.toThrow(
          'Failed to persist order: violates not-null',
        );
      });
    });

    describe('idempotency', () => {
      const existingOrder = {
        id: 'ord_1',
        order_number: 'JM-2026/09/19-3',
        idempotency_key: 'test-key-1',
      };

      it('stores the idempotency key with a new order', async () => {
        const { duplicateQuery, insertQuery } = mockDb();

        const result = await create(buildDto());

        expect(result.isDuplicate).toBe(false);
        expect(duplicateQuery.eq).toHaveBeenCalledWith(
          'idempotency_key',
          'test-key-1',
        );
        expect(insertQuery.insert).toHaveBeenCalledWith(
          expect.objectContaining({ idempotency_key: 'test-key-1' }),
        );
      });

      it('returns the original order when the key was already used', async () => {
        mockDb({ duplicate: { data: existingOrder } });

        await expect(create(buildDto())).resolves.toEqual({
          success: true,
          isDuplicate: true,
          order: existingOrder,
        });
        // No catalogue/zone lookups, no sequence consumed, no insert
        expect(supabase.rpc).not.toHaveBeenCalled();
        expect(supabase.from).toHaveBeenCalledTimes(1);
      });

      it('returns the winning order when a concurrent request inserts first', async () => {
        mockDb({
          insert: { error: { message: 'duplicate key', code: '23505' } },
          raced: { data: existingOrder },
        });

        await expect(create(buildDto())).resolves.toEqual({
          success: true,
          isDuplicate: true,
          order: existingOrder,
        });
      });

      it('throws on a unique violation not caused by the key', async () => {
        mockDb({
          insert: { error: { message: 'duplicate order_number', code: '23505' } },
          raced: { data: null },
        });

        await expect(create(buildDto())).rejects.toThrow(
          'Failed to persist order: duplicate order_number',
        );
      });

      it('throws when the duplicate check fails', async () => {
        mockDb({ duplicate: { error: { message: 'db down' } } });

        await expect(create(buildDto())).rejects.toThrow(
          'Failed to check for duplicate order: db down',
        );
      });
    });
  });

  describe('customer account', () => {
    const notExpected = (client: string) => (table: string) => {
      throw new Error(`${client} client should not query "${table}"`);
    };

    it("writes orders with the customer's own client and catalogue with the shared one", async () => {
      const customerDb = createSupabaseMock();
      const duplicateQuery = createQueryBuilder({ data: null });
      const insertQuery = createQueryBuilder({ data: null });
      const orderQueries = [duplicateQuery, insertQuery];
      customerDb.from.mockImplementation((table: string) =>
        table === 'orders' ? orderQueries.shift() : notExpected('customer')(table),
      );
      customerDb.rpc.mockResolvedValue({ data: 7, error: null });
      clients.createForUser.mockReturnValue(customerDb);
      supabase.from.mockImplementation((table: string) => {
        if (table === 'products') return createQueryBuilder({ data: CATALOG_ROWS });
        if (table === 'deliveryzones') return createQueryBuilder({ data: ZONES });
        return notExpected('shared')(table);
      });

      const result = await create(buildDto());

      expect(clients.createForUser).toHaveBeenCalledWith('customer-token');
      expect(result.order.order_number).toBe('JM-2026/09/19-7');
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ customer_id: 'customer-1' }),
      );
    });

    it('scopes the duplicate-key check to the customer', async () => {
      const { duplicateQuery } = mockDb();

      await create(buildDto());

      expect(duplicateQuery.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
      expect(duplicateQuery.eq).toHaveBeenCalledWith('idempotency_key', 'test-key-1');
    });

    it("looks up an order only among the customer's own orders", async () => {
      const query = createQueryBuilder({ data: { order_number: 'JM-1' } });
      supabase.from.mockReturnValue(query);

      await service.getOrderById('JM-1', account);

      expect(clients.createForUser).toHaveBeenCalledWith('customer-token');
      expect(query.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
      expect(query.eq).toHaveBeenCalledWith('order_number', 'JM-1');
    });

    it("lists only the customer's own orders, newest first", async () => {
      const query = createQueryBuilder({ data: [] });
      supabase.from.mockReturnValue(query);

      await service.getOrders(account);

      expect(clients.createForUser).toHaveBeenCalledWith('customer-token');
      expect(query.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
      expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('getOrderById', () => {
    it('returns the order matching the order number', async () => {
      const order = { order_number: 'JM-2026/09/19-1' };
      const query = createQueryBuilder({ data: order });
      supabase.from.mockReturnValue(query);

      await expect(service.getOrderById('JM-2026/09/19-1', account)).resolves.toEqual(
        order,
      );
      expect(query.eq).toHaveBeenCalledWith('order_number', 'JM-2026/09/19-1');
    });

    it('throws NotFoundException when the order does not exist', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(
        service.getOrderById('JM-2026/09/19-99', account),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws InternalServerErrorException with the cause on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'db down' } }),
      );

      const result = service.getOrderById('JM-1', account);
      await expect(result).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(result).rejects.toThrow('Failed to fetch order: db down');
    });
  });

  describe('getOrders', () => {
    it('returns all orders', async () => {
      const orders = [{ order_number: 'JM-1' }, { order_number: 'JM-2' }];
      supabase.from.mockReturnValue(createQueryBuilder({ data: orders }));

      await expect(service.getOrders(account)).resolves.toEqual(orders);
      expect(supabase.from).toHaveBeenCalledWith('orders');
    });

    it('returns an empty list when there are no orders', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: [] }));

      await expect(service.getOrders(account)).resolves.toEqual([]);
    });

    it('returns an empty list when Supabase returns null data', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.getOrders(account)).resolves.toEqual([]);
    });

    it('throws InternalServerErrorException with the cause on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'db down' } }),
      );

      const result = service.getOrders(account);
      await expect(result).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(result).rejects.toThrow('Failed to fetch orders: db down');
    });
  });
});
