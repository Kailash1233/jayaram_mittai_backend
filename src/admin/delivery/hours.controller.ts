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
import { AdminDeliveryService, CreateHoursDto, UpdateHoursDto } from './delivery.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Delivery Hours Controller
 *
 * Base route: /admin/delivery/hours
 * All routes require admin JWT.
 *
 * Manages two kinds of entries in the `delivery_hours` table:
 *
 *  1. Weekly schedule  — dayOfWeek 0 (Sun) … 6 (Sat)
 *     Set these once to define the shop's regular operating hours.
 *
 *  2. Date overrides   — overrideDate "YYYY-MM-DD"
 *     Use these to close the shop on a specific holiday or extend hours
 *     for a special event.  Overrides take precedence over the weekly schedule.
 *
 * GET returns both groups separately for easy consumption.
 */
@Controller('admin/delivery/hours')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class HoursController {
  constructor(private readonly deliveryService: AdminDeliveryService) {}

  /**
   * GET /admin/delivery/hours
   *
   * Returns:
   * {
   *   "weeklySchedule": [ { id, day_of_week, open_time, close_time, is_closed } … ],
   *   "overrides":       [ { id, override_date, open_time, close_time, is_closed, note } … ]
   * }
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.deliveryService.findAllHours();
  }

  /**
   * POST /admin/delivery/hours
   *
   * Create a weekly schedule entry:
   * {
   *   "dayOfWeek": 1,          // 0=Sun, 1=Mon … 6=Sat
   *   "openTime":  "09:00",
   *   "closeTime": "21:00",
   *   "isClosed":  false        // optional
   * }
   *
   * Create a date-specific override (e.g. Diwali holiday):
   * {
   *   "overrideDate": "2026-11-01",
   *   "isClosed": true,
   *   "note": "Diwali — shop closed"
   * }
   *
   * Note: provide either dayOfWeek OR overrideDate, not both.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateHoursDto) {
    return this.deliveryService.createHours(dto);
  }

  /**
   * PATCH /admin/delivery/hours/:id
   * Update open/close times, isClosed flag, or note.
   *
   * Body (all fields optional):
   * {
   *   "openTime":  "10:00",
   *   "closeTime": "22:00",
   *   "isClosed":  false,
   *   "note":      "Extended hours for Pongal"
   * }
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() dto: UpdateHoursDto) {
    return this.deliveryService.updateHours(id, dto);
  }

  /**
   * DELETE /admin/delivery/hours/:id
   * Removes a schedule entry or date override.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.deliveryService.deleteHours(id);
  }
}
