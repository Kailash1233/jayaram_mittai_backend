import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';

@Injectable()
export class DeliveryZonesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getDeliveryZones() {
    const { data, error } = await this.supabase
      .from('deliveryzones')
      .select('*')

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch delivery zones: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async getDeliveryZoneByLocation(location: string) {
    const { data, error } = await this.supabase
      .from('deliveryzones')
      .select('*')
      .eq('location_name', location)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch delivery zone by location: ${error.message}`,
      );
    }

    if(!data) {
      throw new InternalServerErrorException(
        `No delivery zone found for location: ${location}`,
      );
    }

    return data ?? null;
  }

}