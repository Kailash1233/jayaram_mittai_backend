import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { SUPABASE_CLIENT } from "../../supabase/supabase.module.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  customerStockMessage,
  isPurchasable,
  resolveStock,
} from "../stock-state.js";

/**
 * Attaches the resolved (display-ready) stock state to a catalog item.
 * This is a read-only caller: auto-transitions are computed for display
 * but never written back here (the public client has no write access).
 */
function withResolvedStock(product: any) {
  const resolved = resolveStock(product);
  return {
    ...product,
    stock_state: resolved.stockState,
    out_of_stock_until: resolved.outOfStockUntil,
    available: isPurchasable(resolved.stockState),
    stock_message: customerStockMessage(resolved),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getProducts() {
    const { data, error } = await this.supabase.from("products").select("*");
    if (error) throw error;
    return (data ?? []).map((row: any) =>
      Array.isArray(row.products)
        ? { ...row, products: row.products.map(withResolvedStock) }
        : row,
    );
  }

  async findProductById(categorySlug: string, productId: string) {
    const { data, error } = await this.supabase.from('products').select('*').eq('category_slug', categorySlug);
    if (error) {
      throw new NotFoundException(error.message);
    }

    for (const obj of data) {
      const product = obj.products?.find(
        (product:any) => product.product_id === productId,
      );

      if (product) {
        return withResolvedStock(product);
      }
    }

    throw new NotFoundException('Product not found');
  }

}
