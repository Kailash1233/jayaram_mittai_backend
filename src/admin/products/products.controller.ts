import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Product } from './entities/product.entity.js';

/**
 * Admin Products Controller
 *
 * Base route: /admin/products
 * All routes require a valid JWT token with role === 'admin'.
 */
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminProductsController {
  constructor(private readonly productsService: AdminProductsService) {}

  /**
   * POST /admin/products
   *
   * Creates a new product.
   * Requires: Authorization: Bearer <admin_jwt>
   *
   * @param createProductDto - Validated product payload from request body
   * @returns 201 Created with the saved product entity
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProductDto: CreateProductDto): Promise<Product> {
    return this.productsService.create(createProductDto);
  }

  /**
   * GET /admin/products
   *
   * Returns all products (newest first).
   * Requires: Authorization: Bearer <admin_jwt>
   *
   * @returns 200 OK with an array of product entities.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  /**
   * GET /admin/products/:id
   *
   * Returns a single product by UUID.
   * Requires: Authorization: Bearer <admin_jwt>
   *
   * @param id - UUID of the product (validated by ParseUUIDPipe).
   * @returns 200 OK with the product entity.
   * @throws 400 Bad Request when the id is not a valid UUID.
   * @throws 404 Not Found when no product with the given id exists.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  /**
   * PATCH /admin/products/:id
   *
   * Partially updates an existing product.  Only the fields supplied in the
   * request body are changed.  If `images` is included it completely replaces
   * the stored image array (image-override semantics).
   *
   * Requires: Authorization: Bearer <admin_jwt>
   *
   * @param id  - UUID of the product to update (validated by ParseUUIDPipe).
   * @param updateProductDto - Partial product payload from the request body.
   * @returns 200 OK with the updated product entity.
   * @throws 400 Bad Request when the id is not a valid UUID.
   * @throws 404 Not Found when no product with the given id exists.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, updateProductDto);
  }
}
