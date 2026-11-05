import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_CLIENT_FACTORY,
} from '../supabase/supabase.module.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayService } from './razorpay.service.js';
import { AdminRealtimeGateway } from '../admin/realtime/admin-realtime.gateway.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../test/utils/supabase-mock.js';

describe('PaymentsService', () => {
  const customerDb = createSupabaseMock();
  const adminDb = createSupabaseMock();
  const clients = { createAnonymous: vi.fn(), createForUser: vi.fn(() => customerDb) };
  const razorpay = {
    isValidPaymentSignature: vi.fn(),
    isValidWebhookSignature: vi.fn(),
  };
  const account = { id: 'customer-1', accessToken: 'customer-token' };
  const realtime = { notifyNewOrder: vi.fn(), notifyOrderAcknowledged: vi.fn() };
  const dto = {
    razorpay_order_id: 'order_RZP1',
    razorpay_payment_id: 'pay_ABC',
    razorpay_signature: 'sig',
  };

  const build = async (admin: unknown = adminDb) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: SUPABASE_ADMIN_CLIENT, useValue: admin },
        { provide: SUPABASE_CLIENT_FACTORY, useValue: clients },
        { provide: RazorpayService, useValue: razorpay },
        { provide: AdminRealtimeGateway, useValue: realtime },
      ],
    }).compile();
    return module.get<PaymentsService>(PaymentsService);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    customerDb.from.mockReset();
    adminDb.from.mockReset();
    clients.createForUser.mockImplementation(() => customerDb);
  });

  describe('verifyCheckout', () => {
    it('rejects a bad signature without touching the database', async () => {
      razorpay.isValidPaymentSignature.mockReturnValue(false);
      const service = await build();

      await expect(service.verifyCheckout(dto, account)).rejects.toThrow(
        new BadRequestException('Payment verification failed.'),
      );
      expect(customerDb.from).not.toHaveBeenCalled();
      expect(adminDb.from).not.toHaveBeenCalled();
    });

    it("returns 404 when the order isn't this customer's", async () => {
      razorpay.isValidPaymentSignature.mockReturnValue(true);
      const lookup = createQueryBuilder({ data: null });
      customerDb.from.mockReturnValue(lookup);
      const service = await build();

      await expect(service.verifyCheckout(dto, account)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(clients.createForUser).toHaveBeenCalledWith('customer-token');
      expect(lookup.eq).toHaveBeenCalledWith('customer_id', 'customer-1');
      expect(lookup.eq).toHaveBeenCalledWith('razorpay_order_id', 'order_RZP1');
      expect(adminDb.from).not.toHaveBeenCalled();
    });

    it('marks the order paid and confirmed with the secret-key client', async () => {
      razorpay.isValidPaymentSignature.mockReturnValue(true);
      customerDb.from.mockReturnValue(
        createQueryBuilder({ data: { id: 'ord_1', payment_status: 'pending' } }),
      );
      const paid = { id: 'ord_1', payment_status: 'paid', status: 'confirmed' };
      const update = createQueryBuilder({ data: paid });
      adminDb.from.mockReturnValue(update);
      const service = await build();

      await expect(service.verifyCheckout(dto, account)).resolves.toEqual(paid);
      expect(razorpay.isValidPaymentSignature).toHaveBeenCalledWith(
        'order_RZP1',
        'pay_ABC',
        'sig',
      );
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_status: 'paid',
          status: 'confirmed',
          razorpay_payment_id: 'pay_ABC',
          paid_at: expect.any(String),
        }),
      );
      expect(update.eq).toHaveBeenCalledWith('razorpay_order_id', 'order_RZP1');
      expect(update.neq).toHaveBeenCalledWith('payment_status', 'paid');
      expect(realtime.notifyNewOrder).toHaveBeenCalledWith(paid);
    });

    it('returns an already-paid order without updating it again', async () => {
      razorpay.isValidPaymentSignature.mockReturnValue(true);
      const order = { id: 'ord_1', payment_status: 'paid' };
      customerDb.from.mockReturnValue(createQueryBuilder({ data: order }));
      const service = await build();

      await expect(service.verifyCheckout(dto, account)).resolves.toEqual(order);
      expect(adminDb.from).not.toHaveBeenCalled();
      expect(realtime.notifyNewOrder).not.toHaveBeenCalled();
    });

    it('returns 503 when the secret key is not configured', async () => {
      razorpay.isValidPaymentSignature.mockReturnValue(true);
      customerDb.from.mockReturnValue(
        createQueryBuilder({ data: { id: 'ord_1', payment_status: 'pending' } }),
      );
      const service = await build(null);

      await expect(service.verifyCheckout(dto, account)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('handleWebhook', () => {
    const event = (name: string) =>
      Buffer.from(
        JSON.stringify({
          event: name,
          payload: {
            payment: {
              entity: { id: 'pay_ABC', order_id: 'order_RZP1', method: 'upi' },
            },
          },
        }),
      );

    it.each([
      ['no body', undefined, 'sig'],
      ['no signature', event('payment.captured'), undefined],
    ])('rejects a request with %s', async (_case, body, signature) => {
      const service = await build();

      await expect(service.handleWebhook(body, signature)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid signature without touching the database', async () => {
      razorpay.isValidWebhookSignature.mockReturnValue(false);
      const service = await build();

      await expect(
        service.handleWebhook(event('payment.captured'), 'bad'),
      ).rejects.toThrow('Invalid webhook signature.');
      expect(adminDb.from).not.toHaveBeenCalled();
    });

    it.each(['payment.captured', 'order.paid'])(
      '%s marks the order paid and records the method used',
      async (name) => {
        razorpay.isValidWebhookSignature.mockReturnValue(true);
        const update = createQueryBuilder({ data: { id: 'ord_1' } });
        adminDb.from.mockReturnValue(update);
        const service = await build();

        await expect(service.handleWebhook(event(name), 'sig')).resolves.toEqual({
          received: true,
        });
        expect(update.update).toHaveBeenCalledWith(
          expect.objectContaining({
            payment_status: 'paid',
            status: 'confirmed',
            razorpay_payment_id: 'pay_ABC',
            payment_method: 'upi',
          }),
        );
        expect(update.neq).toHaveBeenCalledWith('payment_status', 'paid');
        expect(realtime.notifyNewOrder).toHaveBeenCalledWith({ id: 'ord_1' });
      },
    );

    it('payment.failed marks only a still-pending order as failed', async () => {
      razorpay.isValidWebhookSignature.mockReturnValue(true);
      const update = createQueryBuilder({ data: null });
      adminDb.from.mockReturnValue(update);
      const service = await build();

      await service.handleWebhook(event('payment.failed'), 'sig');

      expect(update.update).toHaveBeenCalledWith({ payment_status: 'failed' });
      expect(update.eq).toHaveBeenCalledWith('razorpay_order_id', 'order_RZP1');
      expect(update.eq).toHaveBeenCalledWith('payment_status', 'pending');
      expect(realtime.notifyNewOrder).not.toHaveBeenCalled();
    });

    it('acknowledges other events without changing anything', async () => {
      razorpay.isValidWebhookSignature.mockReturnValue(true);
      const service = await build();

      await expect(
        service.handleWebhook(event('refund.created'), 'sig'),
      ).resolves.toEqual({ received: true });
      expect(adminDb.from).not.toHaveBeenCalled();
    });
  });
});
