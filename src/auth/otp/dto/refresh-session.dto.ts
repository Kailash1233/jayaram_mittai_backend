import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty({ message: 'refresh_token is required.' })
  declare refresh_token: string;
}
