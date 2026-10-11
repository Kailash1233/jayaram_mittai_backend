import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';

describe('SupabaseAuthGuard', () => {
  const getUser = vi.fn();
  const guard = new SupabaseAuthGuard({
    auth: { getUser },
  } as unknown as SupabaseClient);

  const contextFor = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => vi.clearAllMocks());

  it('attaches the customer for a valid Supabase token', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'customer-1', phone: '919840012345' } },
      error: null,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(getUser).toHaveBeenCalledWith('valid-token');
    expect(request.customer).toEqual({
      id: 'customer-1',
      phone: '919840012345',
      accessToken: 'valid-token',
    });
  });

  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic abc' }],
    ['an empty Bearer token', { authorization: 'Bearer ' }],
  ])('rejects a request with %s without calling Supabase', async (_case, headers) => {
    await expect(
      guard.canActivate(contextFor({ headers })),
    ).rejects.toThrow(new UnauthorizedException('Please log in to continue.'));
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired token', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer expired' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
