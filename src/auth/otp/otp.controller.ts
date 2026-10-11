import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { OtpService } from './otp.service.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { RefreshSessionDto } from './dto/refresh-session.dto.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedCustomer,
} from '../../common/guards/supabase-auth.guard.js';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator.js';

/**
 * Customer Auth Controller (phone OTP)
 *
 * POST /api/auth/otp/request  — send an OTP to { phone }
 * POST /api/auth/otp/verify   — { phone, token } → session (access + refresh token)
 * POST /api/auth/otp/refresh  — { refresh_token } → new session
 * POST /api/auth/logout       — end the session (Bearer access token)
 *
 * Use the access token as `Authorization: Bearer <token>` on customer
 * routes such as /api/orders.
 */
@Controller('api/auth')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto.phone, dto.token);
  }

  @Post('otp/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshSessionDto) {
    return this.otpService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.otpService.logout(customer.accessToken);
  }
}
