import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * Creates a new product in the database.
   * @param createProductDto - Validated product data from the request body.
   * @returns The newly created product entity.
   */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const product = this.productRepository.create({
        ...createProductDto,
        images: createProductDto.images ?? [],
        isActive: createProductDto.isActive ?? true,
      });

      return await this.productRepository.save(product);
    } catch (error: unknown) {
      // Handle unique constraint violations gracefully
      if (
        error instanceof Object &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new ConflictException('A product with this name already exists.');
      }
      throw new InternalServerErrorException(
        'Failed to create product. Please try again.',
      );
    }
  }

  /**
   * Updates an existing product by ID.
   *
   * Only the fields present in `updateProductDto` are changed.
   * When `images` is supplied it fully replaces the existing image array
   * (image-override semantics — no merging).
   *
   * @param id - UUID of the product to update.
   * @param updateProductDto - Partial product data.
   * @returns The updated product entity.
   * @throws NotFoundException when no product with the given ID exists.
   */
  /**
   * Returns all products ordered by creation date (newest first).
   */
  async findAll(): Promise<Product[]> {
    return this.productRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Returns a single product by UUID.
   * @throws NotFoundException when no product with the given ID exists.
   */
  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    // Merge only supplied fields; `images` replaces the whole array when present.
    Object.assign(product, updateProductDto);

    try {
      return await this.productRepository.save(product);
    } catch (error: unknown) {
      if (
        error instanceof Object &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new ConflictException('A product with this name already exists.');
      }
      throw new InternalServerErrorException(
        'Failed to update product. Please try again.',
      );
    }
  }
}
