import { Body, Controller, Get, Post } from '@nestjs/common';
import { DeliveryZonesService } from './delivery.zones.service.js';

@Controller('api/deliveryzones')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  getDeliveryZones() {
    return this.deliveryZonesService.getDeliveryZones();
  }
  @Post('location')
  getDeliveryZoneByLocation(@Body() { location }: { location: string }) {
    return this.deliveryZonesService.getDeliveryZoneByLocation(location);
  }
}
