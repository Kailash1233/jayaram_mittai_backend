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
import { AdminDeliveryService, CreateZoneDto, UpdateZoneDto } from './delivery.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Delivery Zones Controller
 *
 * Base route: /admin/delivery/zones
 * All routes require admin JWT.
 *
 * Manages delivery zones defined by sets of pincodes.
 * Each zone can have its own fee rules via /admin/delivery/rules.
 */
@Controller('admin/delivery/zones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ZonesController {
  constructor(private readonly deliveryService: AdminDeliveryService) {}

  /**
   * GET /admin/delivery/zones
   * Returns all delivery zones, newest first.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.deliveryService.findAllZones();
  }

  /**
   * POST /admin/delivery/zones
   * Creates a new delivery zone.
   *
   * Body:
   * {
   *   "name": "Chennai Central",
   *   "pincodes": ["600001", "600002"],
   *   "radiusKm": 3.5,       // optional
   *   "isActive": true        // optional, defaults to true
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateZoneDto) {
    return this.deliveryService.createZone(dto);
  }

  /**
   * PATCH /admin/delivery/zones/:id
   * Partially updates a delivery zone.
   * Only provided fields are changed.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.deliveryService.updateZone(id, dto);
  }

  /**
   * DELETE /admin/delivery/zones/:id
   * Deletes a delivery zone.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.deliveryService.deleteZone(id);
  }
}
