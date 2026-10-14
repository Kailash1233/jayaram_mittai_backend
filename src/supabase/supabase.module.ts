import { Global, Module } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';
export const SUPABASE_CLIENT_FACTORY = 'SUPABASE_CLIENT_FACTORY';
/**
 * Secret (service role) key client: bypasses RLS. Only for admin code
 * behind `JwtAuthGuard` + `RolesGuard`; never for customer requests.
 */
export const SUPABASE_ADMIN_CLIENT = 'SUPABASE_ADMIN_CLIENT';

export interface SupabaseClientFactory {
  /**
   * A fresh client for sign-in / OTP calls. Each call gets its own client,
   * so one customer's session can never leak into another request.
   */
  createAnonymous(): SupabaseClient;
  /**
   * A client whose requests run as the customer owning `accessToken`,
   * so RLS sees role `authenticated` and `auth.uid()` = that customer.
   */
  createForUser(accessToken: string): SupabaseClient;
}

// Server-side clients must never store or refresh a session themselves
const SERVER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

function readConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_KEY environment variables',
    );
  }
  return { url, key };
}

function readAdminConfig() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables',
    );
  }
  return { url, secretKey };
}

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: (): SupabaseClient => {
        const { url, key } = readConfig();
        return createClient(url, key, { auth: SERVER_AUTH_OPTIONS });
      },
    },
    {
      provide: SUPABASE_CLIENT_FACTORY,
      useFactory: (): SupabaseClientFactory => {
        const { url, key } = readConfig();
        return {
          createAnonymous: () =>
            createClient(url, key, { auth: SERVER_AUTH_OPTIONS }),
          createForUser: (accessToken) =>
            createClient(url, key, {
              auth: SERVER_AUTH_OPTIONS,
              global: { headers: { Authorization: `Bearer ${accessToken}` } },
            }),
        };
      },
    },
    {
      provide: SUPABASE_ADMIN_CLIENT,
      useFactory: (): SupabaseClient => {
        const { url, secretKey } = readAdminConfig();
        return createClient(url, secretKey, { auth: SERVER_AUTH_OPTIONS });
      },
    },
  ],
  exports: [SUPABASE_CLIENT, SUPABASE_CLIENT_FACTORY, SUPABASE_ADMIN_CLIENT],
})
export class SupabaseModule {}
