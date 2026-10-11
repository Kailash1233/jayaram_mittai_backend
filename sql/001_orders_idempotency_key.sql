-- Prevents duplicate orders from double-submits and retries (ISSUES.md #2).
-- Run in the Supabase SQL editor BEFORE deploying the matching backend change.
-- Existing rows stay NULL; Postgres UNIQUE allows multiple NULLs.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_key
  ON public.orders (idempotency_key);
