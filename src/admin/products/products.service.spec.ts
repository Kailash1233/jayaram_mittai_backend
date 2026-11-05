import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.module.js';
import { AdminProductsService } from './products.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../../test/utils/supabase-mock.js';

const ROWS = () => [
  {
    id: 1,
    category_slug: 'desserts',
    category_name: 'Desserts',
    products: [
      { product_id: 'royal-rasamalai', name: 'Royal Rasamalai', price: 120, stock: 5 },
      {
        product_id: 'gulab-jamun',
        name: 'Gulab Jamun',
        price: 90,
        stock_state: 'temporary_hold',
        custom_message: 'Back soon',
      },
    ],
  },
  {
    id: 2,
    category_slug: 'savouries',
    category_name: 'Savouries',
    products: [
      { product_id: 'murukku', name: 'Murukku', price: 60, stock: 20 },
    ],
  },
];

describe('AdminProductsService', () => {
  let service: AdminProductsService;
  const supabase = createSupabaseMock();

  const build = async (admin: unknown = supabase) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: SUPABASE_ADMIN_CLIENT, useValue: admin },
      ],
    }).compile();
    return module.get<AdminProductsService>(AdminProductsService);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    service = await build();
  });

  describe('findAll', () => {
    it('flattens every category row into one list with resolved stock', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      const result = await service.findAll();

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(
        expect.objectContaining({
          productId: 'royal-rasamalai',
          categorySlug: 'desserts',
          stockState: 'in_stock',
          stock: 5,
        }),
      );
      expect(result).toContainEqual(
        expect.objectContaining({
          productId: 'gulab-jamun',
          stockState: 'temporary_hold',
          customMessage: 'Back soon',
        }),
      );
    });

    it('throws 503 when the secret key is not configured', async () => {
      const withoutAdmin = await build(null);
      await expect(withoutAdmin.findAll()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('findOne', () => {
    it('finds a product by id regardless of which category row it is in', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      const result = await service.findOne('murukku');

      expect(result).toMatchObject({
        productId: 'murukku',
        categorySlug: 'savouries',
        price: 60,
      });
    });

    it('throws NotFoundException for an unknown id', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('appends to an existing category row', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

      const result = await service.create({
        categorySlug: 'desserts',
        productId: 'jangiri',
        name: 'Jangiri',
        price: 80,
      } as any);

      expect(result).toMatchObject({
        productId: 'jangiri',
        categorySlug: 'desserts',
        stockState: 'in_stock',
      });
      expect(updateQuery.update).toHaveBeenCalledWith({
        products: expect.arrayContaining([
          expect.objectContaining({ product_id: 'jangiri' }),
        ]),
      });
      expect(updateQuery.eq).toHaveBeenCalledWith('id', 1);
    });

    it('creates a new category row when categorySlug is new', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const insertQuery = createQueryBuilder({
        data: { id: 3, category_slug: 'beverages', category_name: 'Beverages', products: [] },
      });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(insertQuery);

      const result = await service.create({
        categorySlug: 'beverages',
        productId: 'filter-coffee',
        name: 'Filter Coffee',
        price: 40,
      } as any);

      expect(result).toMatchObject({ productId: 'filter-coffee', categorySlug: 'beverages' });
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ category_slug: 'beverages' }),
      );
    });

    it('rejects a duplicate productId anywhere in the catalogue', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      await expect(
        service.create({
          categorySlug: 'savouries',
          productId: 'royal-rasamalai',
          name: 'Dup',
          price: 1,
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('merges changed fields and writes back the whole category row', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

      const result = await service.update('royal-rasamalai', { price: 150 });

      expect(result).toMatchObject({ productId: 'royal-rasamalai', price: 150 });
      expect(updateQuery.update).toHaveBeenCalledWith({
        products: [
          expect.objectContaining({ product_id: 'royal-rasamalai', price: 150 }),
          expect.objectContaining({ product_id: 'gulab-jamun' }),
        ],
      });
    });

    it('throws NotFoundException for an unknown id', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      await expect(service.update('nope', { price: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateStock', () => {
    it('mark_temporary defaults outOfStockUntil to +24h', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-19T10:00:00Z'));

      const result = await service.updateStock('royal-rasamalai', {
        action: 'mark_temporary',
      } as any);

      expect(result.stockState).toBe('temporary_hold');
      expect(result.outOfStockUntil).toBe('2026-09-20T10:00:00.000Z');
      vi.useRealTimers();
    });

    it('mark_scheduled requires outOfStockUntil', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: ROWS() }));

      await expect(
        service.updateStock('royal-rasamalai', { action: 'mark_scheduled' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mark_scheduled stores the given (future) date', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-19T10:00:00Z'));

      const result = await service.updateStock('royal-rasamalai', {
        action: 'mark_scheduled',
        outOfStockUntil: '2026-10-01T00:00:00.000Z',
      } as any);

      expect(result).toMatchObject({
        stockState: 'scheduled_hold',
        outOfStockUntil: '2026-10-01T00:00:00.000Z',
      });
      vi.useRealTimers();
    });

    it('mark_permanent discontinues the item', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

      const result = await service.updateStock('murukku', {
        action: 'mark_permanent',
      } as any);

      expect(result.stockState).toBe('permanent_out_of_stock');
    });

    it('restock reopens the item and sets the given quantity', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

      const result = await service.updateStock('gulab-jamun', {
        action: 'restock',
        stock: 30,
      } as any);

      expect(result).toMatchObject({ stockState: 'in_stock', stock: 30 });
    });

    it('restock without a stock value defaults to 1', async () => {
      const selectQuery = createQueryBuilder({ data: ROWS() });
      const updateQuery = createQueryBuilder({ data: null });
      supabase.from.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

      const result = await service.updateStock('gulab-jamun', {
        action: 'restock',
      } as any);

      expect(result).toMatchObject({ stockState: 'in_stock', stock: 1 });
    });
  });
});
