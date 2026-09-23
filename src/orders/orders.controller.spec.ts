import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [OrdersService],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('creates an order from a valid checkout payload', async () => {
    const result = await controller.createOrder({
      customer: {
        fullName: 'Ramesh Kumar',
        phone: '9840012345',
        email: 'ramesh@example.com',
      },
      address: {
        line1: '12 Market Street',
        line2: 'Near Temple',
        city: 'Chennai',
        pincode: '600044',
        zoneId: 'zone_chennai_central',
      },
      items: [{ productId: 'milk_mysore_pak', quantity: 2 }],
      paymentMethod: 'upi',
      idempotencyKey: 'test-key-1',
      customerNotes: 'Please ring bell',
    });

    expect(result.success).toBe(true);
    expect(result.order.total).toBeGreaterThan(0);
    expect(result.order.order_number).toMatch(/^JM-/);
  });
});
