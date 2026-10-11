import type { Mock } from 'vitest';

export interface SupabaseResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'like',
  'order',
  'limit',
] as const;

export type QueryBuilderMock = Record<(typeof CHAIN_METHODS)[number], Mock> & {
  single: Mock;
  maybeSingle: Mock;
  then: PromiseLike<SupabaseResult>['then'];
};

// What PostgREST returns when `.single()` matches no rows
const NO_ROWS_ERROR = {
  message: 'Cannot coerce the result to a single JSON object',
  code: 'PGRST116',
};

/**
 * Mimics a Supabase PostgrestQueryBuilder: every filter method returns the
 * builder, `single`/`maybeSingle` resolve to `result`, and awaiting the
 * builder directly also resolves to `result`.
 */
export function createQueryBuilder(
  result: SupabaseResult = { data: null, error: null },
): QueryBuilderMock {
  const resolved = { data: null, error: null, ...result };
  const builder = {} as QueryBuilderMock;

  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  // Like real Supabase, `single` treats zero rows as an error
  builder.single = vi.fn(() =>
    Promise.resolve(
      resolved.data === null && !resolved.error
        ? { data: null, error: NO_ROWS_ERROR }
        : resolved,
    ),
  );
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolved));
  // Real Supabase builders are thenable (awaitable without .single()); the mock must be too
  // oxlint-disable-next-line unicorn/no-thenable
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);

  return builder;
}

export function createSupabaseMock() {
  return { from: vi.fn(), rpc: vi.fn() };
}
