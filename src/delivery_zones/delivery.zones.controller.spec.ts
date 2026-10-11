import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryZonesController } from './delivery.zones.controller.js';
import { DeliveryZonesService } from './delivery.zones.service.js';

describe('DeliveryZonesController', () => {
  let controller: DeliveryZonesController;
  const deliveryZonesService = {
    getDeliveryZones: vi.fn(),
    getDeliveryZoneByLocation: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryZonesController],
      providers: [
        { provide: DeliveryZonesService, useValue: deliveryZonesService },
      ],
    }).compile();

    controller = module.get<DeliveryZonesController>(DeliveryZonesController);
  });

  it('getDeliveryZones delegates to the service', async () => {
    const zones = [{ location_name: 'Mylapore' }];
    deliveryZonesService.getDeliveryZones.mockResolvedValue(zones);

    await expect(controller.getDeliveryZones()).resolves.toEqual(zones);
  });

  it('getDeliveryZoneByLocation passes the location from the body', async () => {
    const zone = { location_name: 'Adyar' };
    deliveryZonesService.getDeliveryZoneByLocation.mockResolvedValue(zone);

    await expect(
      controller.getDeliveryZoneByLocation({ location: 'Adyar' }),
    ).resolves.toEqual(zone);
    expect(deliveryZonesService.getDeliveryZoneByLocation).toHaveBeenCalledWith(
      'Adyar',
    );
  });
});
