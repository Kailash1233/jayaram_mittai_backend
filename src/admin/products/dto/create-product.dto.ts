import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
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

  @IsNumber({}, { message: 'Stock must be a number.' })
  @Min(0, { message: 'Stock cannot be negative.' })
  @Type(() => Number)
  stock: number;

  @IsString()
  @IsNotEmpty({ message: 'Category is required.' })
  @MaxLength(100)
  category: string;

  @IsOptional()
  @IsArray({ message: 'Images must be an array of URLs.' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL.' })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
