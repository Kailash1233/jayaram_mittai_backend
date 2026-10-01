import {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseClient } from '@supabase/supabase-js/dist/index.cjs';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';

export interface AddressInput {
  address_line: string;
  landmark: string;
  city: string;
  pincode: string;
  contact_number: string;
}

export interface updateAddressInput {
  address_line: string;
  landmark: string;
  city: string;
  pincode: string;
}

export interface UpdateAddressRequest extends updateAddressInput {
  contact_number: string;
}

@Injectable()
export class AddressService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async createAddress(addressInput: AddressInput) {
    const { data, error } = await this.supabase
      .from('addresses')
      .insert(addressInput)
      .select()
      .single();

    if (error) {
      throw new BadRequestException('Error creating address: ' + error.message);
    }

    return data;
  }

  async getAddressById(number: string) {
    const { data, error } = await this.supabase
      .from('addresses')
      .select()
      .eq('contact_number', number)
      .single();

    if (error) {
      throw new BadRequestException('Error fetching address: ' + error.message);
    }

    if (!data) {
      throw new NotFoundException(
        'Address not found for contact number: ' + number,
      );
    }

    return data;
  }

async updateAddress(addressInput: AddressInput) {
  const {
    contact_number: contactNumber,
    landmark,
    address_line,
    city,
    pincode,
  } = addressInput;

  const { data, error } = await this.supabase
    .from('addresses')
    .update({
      landmark,
      address_line,
      city,
      pincode,
    })
    .eq('contact_number', contactNumber)
    .select()
    .single();

  if (error) {
    throw new BadRequestException(
      'Error updating address: ' + error.message,
    );
  }

  if (!data) {
    throw new NotFoundException(
      'Address not found for contact number: ' + contactNumber,
    );
  }

  return data;
}
}
