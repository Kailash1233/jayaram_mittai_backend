import { Body, Controller, Patch, Post } from '@nestjs/common';

import { AddressService } from './address.service.js';
import type { AddressInput } from './address.service.js';

@Controller('api/addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post('create')
  async createAddress(@Body() addressInput: AddressInput) {
    return this.addressService.createAddress(addressInput);
  }

  @Post('search')
  async getAddressById(
    @Body() { contact_number: contactNumber }: { contact_number: string },
  ) {
    return this.addressService.getAddressById(contactNumber);
  }

  @Patch('update')
  async updateAddress(@Body() addressInput: AddressInput) {
    return this.addressService.updateAddress(addressInput);
  }
}
