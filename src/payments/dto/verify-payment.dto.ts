import { IsNotEmpty, IsString } from 'class-validator';

/** Razorpay Checkout's success response, passed on unchanged by the frontend. */
export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  declare razorpay_order_id: string;

  @IsString()
  @IsNotEmpty()
  declare razorpay_payment_id: string;

  @IsString()
  @IsNotEmpty()
  declare razorpay_signature: string;
}
