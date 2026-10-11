import { IsNotEmpty, Matches } from 'class-validator';
import { PHONE_E164 } from './request-otp.dto.js';

export class VerifyOtpDto {
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(PHONE_E164, {
    message: 'Phone number must include the country code, e.g. +919840012345.',
  })
  declare phone: string;

  @IsNotEmpty({ message: 'OTP is required.' })
  @Matches(/^\d{4,10}$/, { message: 'OTP must be digits only.' })
  declare token: string;
}
