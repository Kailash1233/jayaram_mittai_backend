import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './orders.service.js';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard.js';

describe('OrdersController', () => {
  let controller: OrdersController;
  const ordersService = {
    createOrder: vi.fn(),
    getOrders: vi.fn(),
    getOrderById: vi.fn(),
  };
  const account = {
    id: 'customer-1',
    phone: '+919840012345',
    accessToken: 'customer-token',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('requires a logged-in customer on every route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OrdersController)).toEqual([
      SupabaseAuthGuard,
    ]);
  });

  it('createOrder passes the checkout payload and the customer to the service', async () => {
    const dto: CreateOrderDto = {
      customer: {
        fullName: 'Ramesh Kumar',
        phone: '9840012345',
        email: 'ramesh@example.com',
      },
      address: {
        line1: '12 Market Street',
        line2: 'Near Temple',
        city: 'Chennai',
        pincode: '600043',
      },
      items: [{ productId: 'royal-rasamalai', quantity: 2 }],
      paymentMethod: 'upi',
      idempotencyKey: 'test-key-1',
      customerNotes: 'Please ring bell',
    };
    const response = { success: true, order: { order_number: 'JM-1' } };
    ordersService.createOrder.mockResolvedValue(response);

    await expect(controller.createOrder(dto, account)).resolves.toEqual(
      response,
    );
    expect(ordersService.createOrder).toHaveBeenCalledWith(dto, account);
  });

  it("getOrders returns the customer's orders", async () => {
    const orders = [{ order_number: 'JM-1' }];
    ordersService.getOrders.mockResolvedValue(orders);

    await expect(controller.getOrders(account)).resolves.toEqual(orders);
    expect(ordersService.getOrders).toHaveBeenCalledWith(account);
  });

  it('getOrderById passes the order number and the customer', async () => {
    const order = { order_number: 'JM-2026/09/19-1' };
    ordersService.getOrderById.mockResolvedValue(order);

    await expect(
      controller.getOrderById('JM-2026/09/19-1', account),
    ).resolves.toEqual(order);
    expect(ordersService.getOrderById).toHaveBeenCalledWith(
      'JM-2026/09/19-1',
      account,
    );
  });
});
