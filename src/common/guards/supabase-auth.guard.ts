import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module.js';

/** The logged-in customer, attached to the request as `req.customer`. */
export interface AuthenticatedCustomer {
  id: string;
  phone?: string;
  /** The customer's Supabase access token, for per-customer DB clients. */
  accessToken: string;
}

/**
 * Customer Auth Guard — validates a Supabase Auth access token
 * (from POST /api/auth/otp/verify) in the Authorization header.
 * Returns 401 Unauthorized if the token is missing, invalid or expired.
 *
 * Separate from JwtAuthGuard, which checks the backend's own admin tokens.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      customer?: AuthenticatedCustomer;
    }>();

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Please log in to continue.');
    }

    // Asks Supabase Auth to verify the token; nothing is stored on the client
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException(
        'Your session is invalid or has expired. Please log in again.',
      );
    }

    request.customer = {
      id: data.user.id,
      phone: data.user.phone,
      accessToken: token,
    };
    return true;
  }
}
