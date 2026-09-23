import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './orders.service.js';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  @Get()
  getOrders(){
    return this.ordersService.getOrders();
  }

//api/orders?orderNumber=JM-2026%2F09%2F19-1
  @Get('search')
  getOrderById(@Query('orderNumber') orderNumber: string) {
    return this.ordersService.getOrderById(orderNumber);
  }
}
