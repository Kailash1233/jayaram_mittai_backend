import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminDeliveryService, CreateRuleDto, UpdateRuleDto } from './delivery.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Delivery Rules Controller
 *
 * Base route: /admin/delivery/rules
 * All routes require admin JWT.
 *
 * Manages tiered delivery fee rules.
 * Rules can be global (zoneId = null) or zone-specific.
 * The order engine applies the rule with the highest minOrder
 * that the cart subtotal satisfies.
 *
 * Example tiers (global):
 *   minOrder=0,    fee=50   → subtotal < ₹1000 → ₹50 delivery
 *   minOrder=1000, fee=0    → subtotal >= ₹1000 → free delivery
 */
@Controller('admin/delivery/rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RulesController {
  constructor(private readonly deliveryService: AdminDeliveryService) {}

  /**
   * GET /admin/delivery/rules
   * Returns all fee rules (with zone name joined), ordered by minOrder asc.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.deliveryService.findAllRules();
  }

  /**
   * POST /admin/delivery/rules
   * Creates a delivery fee rule.
   *
   * Body:
   * {
   *   "zoneId": "uuid",         // optional — null means global fallback
   *   "minOrder": 0,            // cart subtotal threshold (₹)
   *   "fee": 50,                // delivery fee (₹)
   *   "isActive": true          // optional, defaults to true
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRuleDto) {
    return this.deliveryService.createRule(dto);
  }

  /**
   * PATCH /admin/delivery/rules/:id
   * Partially updates a fee rule.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.deliveryService.updateRule(id, dto);
  }

  /**
   * DELETE /admin/delivery/rules/:id
   * Deletes a fee rule.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.deliveryService.deleteRule(id);
  }
}
