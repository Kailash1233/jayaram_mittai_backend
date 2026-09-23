import { Injectable, Inject } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../supabase/supabase.module.js';

export interface SendOtpRequestDto {
  email: string;
}

export interface VerifyOtpRequestDto {
  email: string;
  token: string;
}

@Injectable()
export class RequestService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async sendEmailOtp(email: string) {
    const { data, error } = await this.supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // emailRedirectTo: process.env.SUPABASE_OTP_REDIRECT_URL,
  
      },
    });

    if (error) throw error;
    return data;
  }

  async verifyEmailOtp(email: string, token: string) {
    const { data, error } = await this.supabase.auth.verifyOtp({
      email,
      token,
      type: 'sms',
    });

    if (error) throw error;
    return data;
  }
}
