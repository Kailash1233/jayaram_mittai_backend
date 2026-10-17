import { createHmac } from 'node:crypto';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RazorpayService } from './razorpay.service.js';

describe('RazorpayService', () => {
  const service = new RazorpayService();
  const fetchMock = vi.fn();
  const hmac = (secret: string, data: string) =>
    createHmac('sha256', secret).update(data).digest('hex');

  beforeEach(() => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_key');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'key-secret');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('createOrder', () => {
    it('creates an INR order in paise with basic auth', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'order_RZP1', amount: 53000, currency: 'INR', status: 'created' }),
          { status: 200 },
        ),
      );

      await expect(
        service.createOrder({
          amountPaise: 53000,
          receipt: 'JM-2026/10/12-1',
          notes: { order_id: 'ord_1' },
        }),
      ).resolves.toMatchObject({ id: 'order_RZP1', amount: 53000 });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.razorpay.com/v1/orders');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('rzp_test_key:key-secret').toString('base64')}`,
      );
      expect(JSON.parse(init.body)).toEqual({
        amount: 53000,
        currency: 'INR',
        receipt: 'JM-2026/10/12-1',
        notes: { order_id: 'ord_1' },
      });
    });

    it("returns 502 with Razorpay's reason when it refuses", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ error: { description: 'Authentication failed' } }),
          { status: 401 },
        ),
      );

      const result = service.createOrder({ amountPaise: 100, receipt: 'r' });
      await expect(result).rejects.toBeInstanceOf(BadGatewayException);
      await expect(result).rejects.toThrow(
        'Could not start payment: Authentication failed',
      );
    });

    it('returns 503 without calling Razorpay when keys are missing', async () => {
      vi.stubEnv('RAZORPAY_KEY_SECRET', '');

      await expect(
        service.createOrder({ amountPaise: 100, receipt: 'r' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('isValidPaymentSignature', () => {
    it('accepts the HMAC of "order_id|payment_id" with the key secret', () => {
      const signature = hmac('key-secret', 'order_RZP1|pay_ABC');

      expect(
        service.isValidPaymentSignature('order_RZP1', 'pay_ABC', signature),
      ).toBe(true);
    });

    it.each([
      ['a different payment id', 'order_RZP1|pay_OTHER', 'key-secret'],
      ['a different secret', 'order_RZP1|pay_ABC', 'wrong-secret'],
    ])('rejects a signature made with %s', (_case, data, secret) => {
      expect(
        service.isValidPaymentSignature('order_RZP1', 'pay_ABC', hmac(secret, data)),
      ).toBe(false);
    });

    it('rejects a malformed signature', () => {
      expect(service.isValidPaymentSignature('order_RZP1', 'pay_ABC', 'abc')).toBe(
        false,
      );
    });
  });

  describe('isValidWebhookSignature', () => {
    const body = '{"event":"payment.captured"}';

    it('accepts the HMAC of the raw body with the webhook secret', () => {
      expect(
        service.isValidWebhookSignature(Buffer.from(body), hmac('webhook-secret', body)),
      ).toBe(true);
    });

    it('rejects a body that was changed after signing', () => {
      expect(
        service.isValidWebhookSignature(
          Buffer.from('{"event":"payment.failed"}'),
          hmac('webhook-secret', body),
        ),
      ).toBe(false);
    });

    it('returns 503 when the webhook secret is missing', () => {
      vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');

      expect(() => service.isValidWebhookSignature(body, 'x')).toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
