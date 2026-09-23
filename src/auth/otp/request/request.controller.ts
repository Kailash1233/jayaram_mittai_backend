import { Body, Controller, Post } from '@nestjs/common';
import { RequestService } from './request.service.js';
import type {
  SendOtpRequestDto,
  VerifyOtpRequestDto,
} from './request.service.js';

@Controller('api/auth/otp')
export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  @Post('request')
  requestOtp(@Body() dto: SendOtpRequestDto) {
    return this.requestService.sendEmailOtp(dto.email);
  }

  @Post('verify')
  verifyOtp(@Body() dto: VerifyOtpRequestDto) {
    return this.requestService.verifyEmailOtp(dto.email, dto.token);
  }
}
