import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminProductsService, type AdminProduct } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateStockDto } from './dto/update-stock.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Products Controller
 *
 * Base route: /admin/products
 * All routes require a valid JWT token with role === 'admin'.
 *
 * `productId` throughout is the catalogue's own slug (e.g.
 * "royal-rasamalai"), not a UUID — products live inside the `products`
 * table's category rows, not as their own rows.
 */
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminProductsController {
  constructor(private readonly productsService: AdminProductsService) {}

  /**
   * POST /admin/products
   *
   * Creates a new product under `categorySlug`, creating that category
   * row if it doesn't exist yet.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProductDto: CreateProductDto): Promise<AdminProduct> {
    return this.productsService.create(createProductDto);
  }

  /**
   * GET /admin/products
   *
   * Returns every product across every category, flattened, each with its
   * resolved (display-ready) stock state.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<AdminProduct[]> {
    return this.productsService.findAll();
  }

  /**
   * GET /admin/products/:productId
   *
   * @throws 404 Not Found when no product with that id exists.
   */
  @Get(':productId')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('productId') productId: string): Promise<AdminProduct> {
    return this.productsService.findOne(productId);
  }

  /**
   * PATCH /admin/products/:productId
   *
   * Partially updates a product's catalogue fields (name, price,
   * description, unit, images, raw stock quantity). To move it through
   * the out-of-stock state machine, use PATCH :productId/stock instead.
   */
  @Patch(':productId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('productId') productId: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<AdminProduct> {
    return this.productsService.update(productId, updateProductDto);
  }

  /**
   * PATCH /admin/products/:productId/stock
   *
   * Moves a product through the out-of-stock state machine: hold it
   * temporarily or on a known schedule, discontinue it, or restock it.
   * See `UpdateStockDto` for the available actions.
   */
  @Patch(':productId/stock')
  @HttpCode(HttpStatus.OK)
  async updateStock(
    @Param('productId') productId: string,
    @Body() updateStockDto: UpdateStockDto,
  ): Promise<AdminProduct> {
    return this.productsService.updateStock(productId, updateStockDto);
  }
}
