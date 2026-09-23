import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { SUPABASE_CLIENT } from "../../supabase/supabase.module.js";
import { SupabaseClient } from "@supabase/supabase-js";



@Injectable()
export class ProductsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getProducts() {
    const { data, error } = await this.supabase.from("products").select("*");
    if (error) throw error;
    return data;
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
        return product;
      }
    }

    throw new NotFoundException('Product not found');
  }

}