import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module.js';
import { ProductsService } from './products.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../../test/utils/supabase-mock.js';

describe('ProductsService (catalog)', () => {
  let service: ProductsService;
  const supabase = createSupabaseMock();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('getProducts', () => {
    it('returns all products from the products table', async () => {
      const rows = [{ id: 1, category_slug: 'sweets' }];
      const query = createQueryBuilder({ data: rows });
      supabase.from.mockReturnValue(query);

      await expect(service.getProducts()).resolves.toEqual(rows);
      expect(supabase.from).toHaveBeenCalledWith('products');
      expect(query.select).toHaveBeenCalledWith('*');
    });

    it('rethrows the Supabase error', async () => {
      const error = { message: 'connection lost' };
      supabase.from.mockReturnValue(createQueryBuilder({ error }));

      await expect(service.getProducts()).rejects.toBe(error);
    });
  });

  describe('findProductById', () => {
    const categories = [
      {
        category_slug: 'desserts',
        products: [
          { product_id: 'royal-rasamalai', name: 'Royal Rasamalai' },
          { product_id: 'badam-basundi', name: 'Rich Badam Basundi' },
        ],
      },
      {
        category_slug: 'desserts',
        products: [{ product_id: 'gulab-jamun', name: 'Gulab Jamun' }],
      },
    ];

    it('filters by category slug and returns the matching product', async () => {
      const query = createQueryBuilder({ data: categories });
      supabase.from.mockReturnValue(query);

      await expect(
        service.findProductById('desserts', 'badam-basundi'),
      ).resolves.toEqual({
        product_id: 'badam-basundi',
        name: 'Rich Badam Basundi',
      });
      expect(query.eq).toHaveBeenCalledWith('category_slug', 'desserts');
    });

    it('searches across every row in the category', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: categories }));

      await expect(
        service.findProductById('desserts', 'gulab-jamun'),
      ).resolves.toMatchObject({ name: 'Gulab Jamun' });
    });

    it('skips rows without a products array', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ data: [{ category_slug: 'desserts' }] }),
      );

      await expect(
        service.findProductById('desserts', 'royal-rasamalai'),
      ).rejects.toThrow('Product not found');
    });

    it('throws NotFoundException when no product matches', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: categories }));

      await expect(
        service.findProductById('desserts', 'unknown'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException with the Supabase error message', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'bad filter' } }),
      );

      const result = service.findProductById('desserts', 'royal-rasamalai');
      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.toThrow('bad filter');
    });
  });
});
