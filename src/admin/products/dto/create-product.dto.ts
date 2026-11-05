import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for POST /admin/products.
 *
 * The real `products` table groups items by category: one row per
 * category, each holding a `products` jsonb array. `categorySlug` picks
 * (or, if new, creates) that row; `productId` is the item's own slug,
 * unique across the whole catalogue.
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'categorySlug is required.' })
  @MaxLength(100)
  categorySlug: string;

  /** Only used when `categorySlug` doesn't match an existing category row. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryName?: string;

  @IsString()
  @IsNotEmpty({ message: 'productId is required.' })
  @MaxLength(100)
  productId: string;

  @IsString()
  @IsNotEmpty({ message: 'Product name is required.' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price must be a number with up to 2 decimal places.' })
  @Min(0, { message: 'Price cannot be negative.' })
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Stock must be a number.' })
  @Min(0, { message: 'Stock cannot be negative.' })
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsArray({ message: 'Images must be an array of URLs.' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL.' })
  images?: string[];

  /** Only meaningful when it's not `in_stock`; defaults to `in_stock`. */
  @IsOptional()
  @IsIn(['in_stock', 'temporary_hold', 'needs_review', 'scheduled_hold', 'permanent_out_of_stock'])
  stockState?: 'in_stock' | 'temporary_hold' | 'needs_review' | 'scheduled_hold' | 'permanent_out_of_stock';
}
