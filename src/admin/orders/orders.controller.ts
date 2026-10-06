import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminOrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Orders Controller
 *
 * Base route: /admin/orders
 * All routes require a valid JWT token with role === 'admin'.
 */
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  /**
   * GET /admin/orders
   * GET /admin/orders?status=confirmed
   *
   * Returns the live order queue, newest first.
   * Optionally filter by order status.
   *
   * @param status - Optional status filter.
   * @returns 200 OK with an array of order records.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query('status') status?: string): Promise<unknown[]> {
    return this.ordersService.findAll(status);
  }

  /**
   * GET /admin/orders/:id
   *
   * Returns a single order by its internal ID.
   *
   * @param id - The order's `id` column value.
   * @returns 200 OK with the order record.
   * @throws 404 Not Found when no order with the given id exists.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<unknown> {
    return this.ordersService.findOne(id);
  }

  /**
   * PATCH /admin/orders/:id/status
   *
   * Updates the status of an order for the live queue workflow.
   * Body: { "status": "preparing" | "out_for_delivery" | "delivered" | "cancelled" }
   *
   * @param id     - The order's `id` column value.
   * @param body   - Object containing the new status.
   * @returns 200 OK with the updated order record.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ): Promise<unknown> {
    return this.ordersService.updateStatus(id, status);
  }
}
