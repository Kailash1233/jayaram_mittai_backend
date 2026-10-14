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
 * Manages the `deliveryzones` table that checkout prices orders from:
 * each zone's pincodes, delivery fee, free-delivery threshold and ETA.
 * A pincode may belong to only one zone.
 */
@Controller('admin/delivery/zones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ZonesController {
  constructor(private readonly deliveryService: AdminDeliveryService) {}

  /**
   * GET /admin/delivery/zones
   * Returns all delivery zones in id order.
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
   *   "locationName": "Guduvanchery",
   *   "pincodes": ["603202", "603210"],
   *   "deliveryCharge": 60,       // ₹, optional
   *   "freeDeliveryAbove": 500,   // ₹ subtotal, optional
   *   "estimatedHours": 1         // optional
   * }
   *
   * Omitted charge/threshold/hours use checkout's defaults.
   * 409 if a pincode already belongs to another zone.
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
   * Deletes a delivery zone; its pincodes stop being deliverable.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.deliveryService.deleteZone(id);
  }
}
