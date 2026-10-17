import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { VerifyPaymentDto } from './dto/verify-payment.dto.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedCustomer,
} from '../common/guards/supabase-auth.guard.js';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator.js';

/**
 * Razorpay payments
 *
 * POST /api/payments/razorpay/verify   — customer; Checkout's success response
 * POST /api/payments/razorpay/webhook  — Razorpay only; signed with the webhook secret
 */
@Controller('api/payments/razorpay')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('verify')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  verify(
    @Body() dto: VerifyPaymentDto,
    @CurrentCustomer() account: AuthenticatedCustomer,
  ) {
    return this.paymentsService.verifyCheckout(dto, account);
  }

  // No login: Razorpay calls this. The signature check is the authentication,
  // and it needs the exact raw body (rawBody: true in main.ts).
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }
}
