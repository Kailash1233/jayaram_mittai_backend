import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedCustomer } from '../guards/supabase-auth.guard.js';

/**
 * Injects the customer set by SupabaseAuthGuard.
 * Usage: handler(@CurrentCustomer() customer: AuthenticatedCustomer)
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedCustomer =>
    context.switchToHttp().getRequest<{ customer: AuthenticatedCustomer }>()
      .customer,
);
