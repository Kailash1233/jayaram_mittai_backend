import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './orders.service.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedCustomer,
} from '../common/guards/supabase-auth.guard.js';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator.js';

/**
 * Customer Orders Controller
 * All routes require a logged-in customer:
 * `Authorization: Bearer <access_token>` from POST /api/auth/otp/verify.
 */
@Controller('api/orders')
@UseGuards(SupabaseAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentCustomer() account: AuthenticatedCustomer,
  ) {
    return this.ordersService.createOrder(dto, account);
  }

  /** The logged-in customer's own orders. */
  @Get()
  getOrders(@CurrentCustomer() account: AuthenticatedCustomer) {
    return this.ordersService.getOrders(account);
  }

  //api/orders/search?orderNumber=JM-2026%2F09%2F19-1
  @Get('search')
  getOrderById(
    @Query('orderNumber') orderNumber: string,
    @CurrentCustomer() account: AuthenticatedCustomer,
  ) {
    return this.ordersService.getOrderById(orderNumber, account);
  }
}
