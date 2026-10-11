import { Test, TestingModule } from '@nestjs/testing';
import { AddressController } from './address.controller.js';
import { AddressService } from './address.service.js';
import type { AddressInput } from './address.service.js';

describe('AddressController', () => {
  let controller: AddressController;
  const addressService = {
    createAddress: vi.fn(),
    getAddressById: vi.fn(),
    updateAddress: vi.fn(),
  };

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
      controllers: [AddressController],
      providers: [{ provide: AddressService, useValue: addressService }],
    }).compile();

    controller = module.get<AddressController>(AddressController);
  });

  it('createAddress delegates to the service', async () => {
    addressService.createAddress.mockResolvedValue({ id: 1, ...input });

    await expect(controller.createAddress(input)).resolves.toMatchObject({
      id: 1,
    });
    expect(addressService.createAddress).toHaveBeenCalledWith(input);
  });

  it('getAddressById extracts contact_number from the body', async () => {
    addressService.getAddressById.mockResolvedValue({ id: 1 });

    await controller.getAddressById({ contact_number: '9840012345' });
    expect(addressService.getAddressById).toHaveBeenCalledWith('9840012345');
  });

  it('updateAddress delegates to the service', async () => {
    addressService.updateAddress.mockResolvedValue({ id: 1, ...input });

    await controller.updateAddress(input);
    expect(addressService.updateAddress).toHaveBeenCalledWith(input);
  });
});
