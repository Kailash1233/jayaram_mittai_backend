import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service.js';

@Controller('api/catalog')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}
  @Get('products')
  getProducts() {
    return this.productsService.getProducts();
  }
  //api/catalog/products/search?categorySlug=desserts&productId=royal-rasamalai
  @Get('products/search')
  async findByProductId(
    @Query('categorySlug') categorySlug: string,
    @Query('productId') productId: string,
  ) {
    return this.productsService.findProductById(categorySlug, productId);
  }
}
