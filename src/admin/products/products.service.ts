import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CLIENT,
  requireAdmin,
} from '../../supabase/supabase.module.js';
import {
  resolveStock,
  toStored,
  type StoredStock,
} from '../../catalog/stock-state.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateStockDto } from './dto/update-stock.dto.js';

/** An item as stored inside a category row's `products` jsonb array. */
interface StoredProduct extends StoredStock {
  product_id: string;
  name: string;
  description?: string | null;
  price: number;
  unit?: string | null;
  stock?: number | null;
  images?: string[];
}

/** A row of the `products` table: one category, with its items nested. */
interface CategoryRow {
  id: number | string;
  category_slug: string;
  category_name?: string | null;
  products: StoredProduct[] | null;
}

/** A single catalogue item, flattened with its category and resolved stock. */
export interface AdminProduct {
  productId: string;
  categorySlug: string;
  categoryName: string | null;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  stock: number | null;
  images: string[];
  stockState: string;
  outOfStockUntil: string | null;
  customMessage: string | null;
  reviewFlaggedAt: string | null;
}

function toAdminProduct(row: CategoryRow, product: StoredProduct): AdminProduct {
  const resolved = resolveStock(product);
  return {
    productId: product.product_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name ?? null,
    name: product.name,
    description: product.description ?? null,
    price: product.price,
    unit: product.unit ?? null,
    stock: resolved.stock,
    images: product.images ?? [],
    stockState: resolved.stockState,
    outOfStockUntil: resolved.outOfStockUntil,
    customMessage: resolved.customMessage,
    reviewFlaggedAt: resolved.reviewFlaggedAt,
  };
}

/**
 * Admin products against the real `products` table: one row per category,
 * each with a `products` jsonb array (there's no separate per-product
 * table). Every write re-reads the target category row, edits its
 * `products` array in memory, and writes the whole array back — jsonb
 * columns don't support partial/indexed updates.
 */
@Injectable()
export class AdminProductsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly client: SupabaseClient | null,
  ) {}

  private get supabase(): SupabaseClient {
    return requireAdmin(this.client);
  }

  private async fetchRows(): Promise<CategoryRow[]> {
    const { data, error } = await this.supabase.from('products').select('*');
    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch products: ${error.message}`,
      );
    }
    return (data ?? []) as CategoryRow[];
  }

  /** Finds the category row + item + index holding `productId`, or throws. */
  private async locate(
    productId: string,
  ): Promise<{ row: CategoryRow; product: StoredProduct; index: number }> {
    const rows = await this.fetchRows();
    for (const row of rows) {
      const index = (row.products ?? []).findIndex(
        (p) => p.product_id === productId,
      );
      if (index !== -1) {
        return { row, product: (row.products as StoredProduct[])[index], index };
      }
    }
    throw new NotFoundException(`Product "${productId}" not found.`);
  }

  private async writeBackProducts(row: CategoryRow, products: StoredProduct[]) {
    const { error } = await this.supabase
      .from('products')
      .update({ products })
      .eq('id', row.id);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to save product changes: ${error.message}`,
      );
    }
  }

  /** All products across every category, flattened, newest-slug-first is not guaranteed. */
  async findAll(): Promise<AdminProduct[]> {
    const rows = await this.fetchRows();
    return rows.flatMap((row) =>
      (row.products ?? []).map((product) => toAdminProduct(row, product)),
    );
  }

  async findOne(productId: string): Promise<AdminProduct> {
    const { row, product } = await this.locate(productId);
    return toAdminProduct(row, product);
  }

  async create(dto: CreateProductDto): Promise<AdminProduct> {
    const rows = await this.fetchRows();

    const existingElsewhere = rows.some((row) =>
      (row.products ?? []).some((p) => p.product_id === dto.productId),
    );
    if (existingElsewhere) {
      throw new ConflictException(
        `Product "${dto.productId}" already exists.`,
      );
    }

    const newProduct: StoredProduct = {
      product_id: dto.productId,
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      unit: dto.unit ?? null,
      stock: dto.stock ?? null,
      images: dto.images ?? [],
      stock_state: dto.stockState ?? 'in_stock',
      out_of_stock_until: null,
      custom_message: null,
      review_flagged_at: null,
    };

    const existingRow = rows.find((row) => row.category_slug === dto.categorySlug);

    if (existingRow) {
      const products = [...(existingRow.products ?? []), newProduct];
      await this.writeBackProducts(existingRow, products);
      return toAdminProduct({ ...existingRow, products }, newProduct);
    }

    const { data, error } = await this.supabase
      .from('products')
      .insert({
        category_slug: dto.categorySlug,
        category_name: dto.categoryName ?? dto.categorySlug,
        products: [newProduct],
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create category "${dto.categorySlug}": ${error.message}`,
      );
    }

    return toAdminProduct(data as CategoryRow, newProduct);
  }

  async update(productId: string, dto: UpdateProductDto): Promise<AdminProduct> {
    const { row, product, index } = await this.locate(productId);

    const updated: StoredProduct = {
      ...product,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.images !== undefined && { images: dto.images }),
    };

    const products = [...(row.products as StoredProduct[])];
    products[index] = updated;
    await this.writeBackProducts(row, products);

    return toAdminProduct(row, updated);
  }

  /** Moves a product through the out-of-stock state machine. See UpdateStockDto. */
  async updateStock(productId: string, dto: UpdateStockDto): Promise<AdminProduct> {
    const { row, product, index } = await this.locate(productId);
    const resolved = resolveStock(product);

    let next: ReturnType<typeof resolveStock>;
    switch (dto.action) {
      case 'mark_temporary':
        next = {
          ...resolved,
          stockState: 'temporary_hold',
          outOfStockUntil:
            dto.outOfStockUntil ??
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          customMessage: dto.customMessage ?? null,
          reviewFlaggedAt: null,
        };
        break;
      case 'mark_scheduled':
        if (!dto.outOfStockUntil) {
          throw new BadRequestException(
            'outOfStockUntil is required for mark_scheduled.',
          );
        }
        next = {
          ...resolved,
          stockState: 'scheduled_hold',
          outOfStockUntil: dto.outOfStockUntil,
          customMessage: dto.customMessage ?? null,
          reviewFlaggedAt: null,
        };
        break;
      case 'mark_permanent':
        next = {
          ...resolved,
          stockState: 'permanent_out_of_stock',
          outOfStockUntil: null,
          customMessage: dto.customMessage ?? null,
          reviewFlaggedAt: null,
        };
        break;
      case 'restock':
        next = {
          ...resolved,
          stockState: 'in_stock',
          stock: dto.stock ?? (resolved.stock && resolved.stock > 0 ? resolved.stock : 1),
          outOfStockUntil: null,
          customMessage: null,
          reviewFlaggedAt: null,
        };
        break;
    }

    const updated: StoredProduct = { ...product, ...toStored(next) };
    const products = [...(row.products as StoredProduct[])];
    products[index] = updated;
    await this.writeBackProducts(row, products);

    return toAdminProduct(row, updated);
  }
}
