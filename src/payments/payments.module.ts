import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayService } from './razorpay.service.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService],
  // OrdersService creates the Razorpay order at checkout
  exports: [RazorpayService],
})
export class PaymentsModule {}
