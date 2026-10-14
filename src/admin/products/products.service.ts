import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Product } from './entities/product.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class AdminProductsService {
  private readonly products = new Map<string, Product>();

  /**
   * Creates a new product in the in-memory store.
   * @param createProductDto - Validated product data from the request body.
   * @returns The newly created product entity.
   */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const duplicate = [...this.products.values()].find(
        (product) => product.name === createProductDto.name,
      );

      if (duplicate) {
        throw new ConflictException('A product with this name already exists.');
      }

      // Copy DTO fields by name so the request can never set id or timestamps
      const product = Object.assign(new Product(), {
        id: randomUUID(),
        name: createProductDto.name,
        description: createProductDto.description ?? null,
        price: createProductDto.price,
        stock: createProductDto.stock,
        category: createProductDto.category,
        images: createProductDto.images ?? [],
        isActive: createProductDto.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.products.set(product.id, product);
      return product;
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to create product. Please try again.',
      );
    }
  }

  /**
   * Returns all products ordered by creation date (newest first).
   */
  async findAll(): Promise<Product[]> {
    return [...this.products.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Returns a single product by UUID.
   * @throws NotFoundException when no product with the given ID exists.
   */
  async findOne(id: string): Promise<Product> {
    const product = this.products.get(id);

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = this.products.get(id);

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    const duplicate = [...this.products.values()].find(
      (existing) =>
        existing.id !== id && existing.name === updateProductDto.name,
    );

    if (duplicate) {
      throw new ConflictException('A product with this name already exists.');
    }

    Object.assign(product, updateProductDto);
    product.updatedAt = new Date();
    return product;
  }
}
