import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';
import { DeliveryZonesService } from './delivery.zones.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../test/utils/supabase-mock.js';

describe('DeliveryZonesService', () => {
  let service: DeliveryZonesService;
  const supabase = createSupabaseMock();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryZonesService,
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    service = module.get<DeliveryZonesService>(DeliveryZonesService);
  });

  describe('getDeliveryZones', () => {
    it('returns all zones from the deliveryzones table', async () => {
      const zones = [{ location_name: 'Mylapore' }, { location_name: 'Adyar' }];
      const query = createQueryBuilder({ data: zones });
      supabase.from.mockReturnValue(query);

      await expect(service.getDeliveryZones()).resolves.toEqual(zones);
      expect(supabase.from).toHaveBeenCalledWith('deliveryzones');
      expect(query.select).toHaveBeenCalledWith('*');
    });

    it('returns an empty array when Supabase returns no data', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.getDeliveryZones()).resolves.toEqual([]);
    });

    it('throws InternalServerErrorException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'timeout' } }),
      );

      const result = service.getDeliveryZones();
      await expect(result).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(result).rejects.toThrow(
        'Failed to fetch delivery zones: timeout',
      );
    });
  });

  describe('getDeliveryZoneByLocation', () => {
    it('returns the zone matching the location name', async () => {
      const zone = { location_name: 'Mylapore', delivery_charge: 50 };
      const query = createQueryBuilder({ data: zone });
      supabase.from.mockReturnValue(query);

      await expect(
        service.getDeliveryZoneByLocation('Mylapore'),
      ).resolves.toEqual(zone);
      expect(query.eq).toHaveBeenCalledWith('location_name', 'Mylapore');
      expect(query.maybeSingle).toHaveBeenCalled();
    });

    it('throws NotFoundException when no zone exists for the location', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      const result = service.getDeliveryZoneByLocation('Tambaram');
      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.toThrow(
        'No delivery zone found for location: Tambaram',
      );
    });

    it('throws InternalServerErrorException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'timeout' } }),
      );

      const result = service.getDeliveryZoneByLocation('Mylapore');
      await expect(result).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(result).rejects.toThrow(
        'Failed to fetch delivery zone by location: timeout',
      );
    });
  });
});
