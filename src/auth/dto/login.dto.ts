import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty()
  declare email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  declare password: string;
}
