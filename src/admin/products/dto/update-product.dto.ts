import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for PATCH /admin/products/:productId.
 *
 * Every field is optional so the client can send only what changed.
 * An explicit `images` array fully replaces the existing image list.
 * Setting `stock` to 0 is a plain quantity edit, not a manual hold: the
 * stock-state machine (`resolveStock`) picks that up on the next read and
 * auto-enters `temporary_hold`. To set a hold/discontinue state directly,
 * use PATCH /admin/products/:productId/stock instead.
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
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Stock must be a number.' })
  @Min(0, { message: 'Stock cannot be negative.' })
  @Type(() => Number)
  stock?: number;

  /**
   * When provided, fully replaces the product's image array.
   * Send an empty array `[]` to clear all images.
   */
  @IsOptional()
  @IsArray({ message: 'Images must be an array of URLs.' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL.' })
  images?: string[];
}
