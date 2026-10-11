import { IsNotEmpty, Matches } from 'class-validator';

// E.164: + country code + number, e.g. +919840012345
export const PHONE_E164 = /^\+[1-9]\d{7,14}$/;

export class RequestOtpDto {
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(PHONE_E164, {
    message: 'Phone number must include the country code, e.g. +919840012345.',
  })
  declare phone: string;
}
