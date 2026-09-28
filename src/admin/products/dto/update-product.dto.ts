import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for PATCH /admin/products/:id
 *
 * Every field is optional so the client can send only the fields
 * that actually need to change.  An explicit `images` array fully
 * replaces the existing image list (image override semantics).
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price must be a number with up to 2 decimal places.' })
  @Min(0, { message: 'Price cannot be negative.' })
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Stock must be a number.' })
  @Min(0, { message: 'Stock cannot be negative.' })
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /**
   * When provided, fully replaces the product's image array.
   * Send an empty array `[]` to clear all images.
   */
  @IsOptional()
  @IsArray({ message: 'Images must be an array of URLs.' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL.' })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
