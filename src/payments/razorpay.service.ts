import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export interface CreateRazorpayOrderInput {
  /** In paise: ₹530 = 53000. */
  amountPaise: number;
  /** Our reference, max 40 characters (the order number). */
  receipt: string;
  notes?: Record<string, string>;
}

/**
 * Razorpay Orders API + signature checks. Keys come from the environment
 * and are read on use, so the app starts even before they are set.
 */
@Injectable()
export class RazorpayService {
  /** Public key id, sent to the frontend for Razorpay Checkout. */
  get keyId(): string {
    return this.credentials().keyId;
  }

  async createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrder> {
    const { keyId, keySecret } = this.credentials();

    const response = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = body?.error?.description ?? `HTTP ${response.status}`;
      throw new BadGatewayException(`Could not start payment: ${reason}`);
    }
    return body as RazorpayOrder;
  }

  /** Checkout success callback: HMAC-SHA256 of "order_id|payment_id". */
  isValidPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string,
  ): boolean {
    const expected = createHmac('sha256', this.credentials().keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    return safeEqual(expected, signature);
  }

  /** Webhook: HMAC-SHA256 of the raw request body with the webhook secret. */
  isValidWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException(
        'Payment webhooks are not configured yet: RAZORPAY_WEBHOOK_SECRET is missing.',
      );
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  private credentials() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Online payments are not configured yet: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing.',
      );
    }
    return { keyId, keySecret };
  }
}

// Constant-time compare, so a signature can't be guessed byte by byte
function safeEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
