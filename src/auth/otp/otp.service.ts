import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthError, Session } from '@supabase/supabase-js';
import {
  SUPABASE_CLIENT_FACTORY,
  type SupabaseClientFactory,
} from '../../supabase/supabase.module.js';

/** What the customer keeps after logging in. */
export interface CustomerSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; phone?: string };
}

/**
 * Customer phone-OTP login via Supabase Auth.
 * SMS delivery is configured in Supabase (Auth → Providers → Phone, e.g.
 * Twilio); this service only talks to Supabase Auth.
 *
 * Every call uses a fresh client, so sessions are returned to the caller
 * and never stored on a client shared with other requests.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(SUPABASE_CLIENT_FACTORY)
    private readonly clients: SupabaseClientFactory,
  ) {}

  async requestOtp(phone: string) {
    const { error } = await this.clients
      .createAnonymous()
      .auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });

    if (error) {
      throw this.toHttpError(error, 'Could not send OTP');
    }
    return { message: 'OTP sent.' };
  }

  async verifyOtp(phone: string, token: string): Promise<CustomerSession> {
    const { data, error } = await this.clients
      .createAnonymous()
      .auth.verifyOtp({ phone, token, type: 'sms' });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid or expired OTP.');
    }
    return this.toCustomerSession(data.session);
  }

  async refresh(refreshToken: string): Promise<CustomerSession> {
    const { data, error } = await this.clients
      .createAnonymous()
      .auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw new UnauthorizedException(
        'Session expired. Please log in again.',
      );
    }
    return this.toCustomerSession(data.session);
  }

  /** Ends only this customer's current session. */
  async logout(accessToken: string) {
    const { error } = await this.clients
      .createAnonymous()
      .auth.admin.signOut(accessToken, 'local');

    if (error) {
      throw this.toHttpError(error, 'Could not log out');
    }
    return { message: 'Logged out.' };
  }

  private toCustomerSession(session: Session): CustomerSession {
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: { id: session.user.id, phone: session.user.phone },
    };
  }

  private toHttpError(error: AuthError, context: string) {
    if (error.status === HttpStatus.TOO_MANY_REQUESTS) {
      return new HttpException(
        'Too many attempts. Please wait and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return new BadRequestException(`${context}: ${error.message}`);
  }
}
