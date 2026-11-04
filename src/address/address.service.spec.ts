import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';
import { AddressService } from './address.service.js';
import type { AddressInput } from './address.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../test/utils/supabase-mock.js';

describe('AddressService', () => {
  let service: AddressService;
  const supabase = createSupabaseMock();

  const input: AddressInput = {
    address_line: '12 Market Street',
    landmark: 'Near Temple',
    city: 'Chennai',
    pincode: '600044',
    contact_number: '9840012345',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressService,
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    service = module.get<AddressService>(AddressService);
  });

  describe('createAddress', () => {
    it('inserts the address and returns the created row', async () => {
      const row = { id: 1, ...input };
      const query = createQueryBuilder({ data: row });
      supabase.from.mockReturnValue(query);

      await expect(service.createAddress(input)).resolves.toEqual(row);
      expect(supabase.from).toHaveBeenCalledWith('addresses');
      expect(query.insert).toHaveBeenCalledWith(input);
      expect(query.single).toHaveBeenCalled();
    });

    it('throws BadRequestException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'duplicate key' } }),
      );

      const result = service.createAddress(input);
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toThrow(
        'Error creating address: duplicate key',
      );
    });
  });

  describe('getAddressById', () => {
    it('looks up the address by contact number', async () => {
      const row = { id: 1, ...input };
      const query = createQueryBuilder({ data: row });
      supabase.from.mockReturnValue(query);

      await expect(service.getAddressById('9840012345')).resolves.toEqual(row);
      expect(query.eq).toHaveBeenCalledWith('contact_number', '9840012345');
    });

    it('throws BadRequestException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'connection lost' } }),
      );

      await expect(
        service.getAddressById('9840012345'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when no data is returned', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.getAddressById('0000000000')).rejects.toThrow(
        new NotFoundException('Address not found for contact number: 0000000000'),
      );
    });
  });

  describe('updateAddress', () => {
    it('updates only the address fields, keyed by contact number', async () => {
      const row = { id: 1, ...input, city: 'Madurai' };
      const query = createQueryBuilder({ data: row });
      supabase.from.mockReturnValue(query);

      await expect(
        service.updateAddress({ ...input, city: 'Madurai' }),
      ).resolves.toEqual(row);
      expect(query.update).toHaveBeenCalledWith({
        landmark: 'Near Temple',
        address_line: '12 Market Street',
        city: 'Madurai',
        pincode: '600044',
      });
      expect(query.eq).toHaveBeenCalledWith('contact_number', '9840012345');
    });

    it('throws BadRequestException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'invalid pincode' } }),
      );

      await expect(service.updateAddress(input)).rejects.toThrow(
        'Error updating address: invalid pincode',
      );
    });

    it('throws NotFoundException when no row was updated', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.updateAddress(input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
