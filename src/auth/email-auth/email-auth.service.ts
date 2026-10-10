import { Injectable, Inject } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module.js';

@Injectable()
export class EmailAuthService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async signUp(email: string, password: string) {
    console.log('Signing up user with email:', email);
  const { data, error } = await this.supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('Supabase signup error:', error.message);
    console.error('Error status:', error.status);
    throw error;
  }

  console.log('Signup response:', data);
  return data;
}

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  }
}
