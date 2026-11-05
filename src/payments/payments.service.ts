import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_CLIENT_FACTORY,
  requireAdmin,
  type SupabaseClientFactory,
} from '../supabase/supabase.module.js';
import type { AuthenticatedCustomer } from '../common/guards/supabase-auth.guard.js';
import { RazorpayService } from './razorpay.service.js';
import type { VerifyPaymentDto } from './dto/verify-payment.dto.js';
import { AdminRealtimeGateway } from '../admin/realtime/admin-realtime.gateway.js';

/** The parts of a Razorpay webhook we use. */
interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id: string; method?: string } };
  };
}

/**
 * Records Razorpay payments on orders. Payment status is only ever written
 * with the secret-key client, after a Razorpay signature check, so a customer
 * can never mark their own order as paid.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly admin: SupabaseClient | null,
    @Inject(SUPABASE_CLIENT_FACTORY)
    private readonly clients: SupabaseClientFactory,
    private readonly razorpay: RazorpayService,
    private readonly realtime: AdminRealtimeGateway,
  ) {}

  /** Called by the frontend with Razorpay Checkout's success response. */
  async verifyCheckout(dto: VerifyPaymentDto, account: AuthenticatedCustomer) {
    const valid = this.razorpay.isValidPaymentSignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );
    if (!valid) {
      throw new BadRequestException('Payment verification failed.');
    }

    // Read with the customer's own client: the order must be theirs
    const { data: order, error } = await this.clients
      .createForUser(account.accessToken)
      .from('orders')
      .select('*')
      .eq('customer_id', account.id)
      .eq('razorpay_order_id', dto.razorpay_order_id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch order: ${error.message}`,
      );
    }
    if (!order) {
      throw new NotFoundException('Order not found for this payment.');
    }
    if (order.payment_status === 'paid') {
      return order; // the webhook got there first
    }

    return (
      (await this.markPaid(dto.razorpay_order_id, dto.razorpay_payment_id)) ??
      order
    );
  }

  /** Razorpay webhook: the backup when the customer never returns to the app. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing webhook body or signature.');
    }
    if (!this.razorpay.isValidWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookEvent;
    const payment = event.payload?.payment?.entity;

    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (payment) {
          await this.markPaid(payment.order_id, payment.id, payment.method);
        }
        break;
      case 'payment.failed':
        if (payment) {
          await this.markFailed(payment.order_id);
        }
        break;
      // Other events are acknowledged and ignored
    }
    return { received: true };
  }

  /**
   * Marks the order paid and confirmed. Skips orders already paid, so the
   * checkout callback and the webhook can both arrive safely.
   * Returns the updated order, or null if nothing changed.
   */
  private async markPaid(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    method?: string,
  ) {
    const { data, error } = await requireAdmin(this.admin)
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'confirmed',
        razorpay_payment_id: razorpayPaymentId,
        paid_at: new Date().toISOString(),
        ...(method ? { payment_method: method } : {}),
      })
      .eq('razorpay_order_id', razorpayOrderId)
      .neq('payment_status', 'paid')
      .select()
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to record payment: ${error.message}`,
      );
    }
    // `data` is only non-null on the actual pending -> paid transition
    // (the `.neq` guard above), so this never double-rings for the same
    // order even though both the checkout callback and the webhook call in.
    if (data) {
      this.realtime.notifyNewOrder(data);
    }
    return data;
  }

  /** A failed attempt; the order stays pending so the customer can retry. */
  private async markFailed(razorpayOrderId: string) {
    const { error } = await requireAdmin(this.admin)
      .from('orders')
      .update({ payment_status: 'failed' })
      .eq('razorpay_order_id', razorpayOrderId)
      .eq('payment_status', 'pending');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to record payment failure: ${error.message}`,
      );
    }
  }
}
