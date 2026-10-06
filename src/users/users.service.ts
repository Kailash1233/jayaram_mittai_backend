import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';
import { UserRole } from './entities/user.entity.js';

/** Shape of a `users` row returned from Supabase. */
export interface UserRow {
  id: string;
  email: string;
  hashedPassword: string;
  role: UserRole;
  hashedRefreshToken: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Find a user by their email address.
   * Returns null if not found (caller decides how to handle).
   */
  async findByEmail(email: string): Promise<UserRow | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to look up user by email: ${error.message}`,
      );
    }

    return data as UserRow | null;
  }

  /**
   * Find a user by their ID.
   * Throws NotFoundException if not found.
   */
  async findById(id: string): Promise<UserRow> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to look up user by id: ${error.message}`,
      );
    }

    if (!data) {
      throw new NotFoundException('User not found.');
    }

    return data as UserRow;
  }

  /**
   * Create a new user with an already-hashed password.
   * Throws ConflictException if the email already exists.
   */
  async create(
    email: string,
    hashedPassword: string,
    role: UserRole = UserRole.USER,
  ): Promise<UserRow> {
    // Check for duplicate email
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const { data, error } = await this.supabase
      .from('users')
      .insert({ email, hashedPassword, role, hashedRefreshToken: null })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create user: ${error.message}`,
      );
    }

    return data as UserRow;
  }

  /**
   * Store or clear the hashed refresh token on the user record.
   * Pass null to log the user out (invalidate their refresh token).
   */
  async updateRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ hashedRefreshToken })
      .eq('id', userId);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update refresh token: ${error.message}`,
      );
    }
  }
}
