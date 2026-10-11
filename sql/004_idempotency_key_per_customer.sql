-- Make idempotency keys unique per customer instead of across all orders.
-- Before: customer B got a 500 if customer A had already used the same key.
-- Run after 003a (needs orders.customer_id).

-- Remove the global rule. It may exist as a constraint or a plain unique
-- index depending on how it was created; each line is a no-op if absent.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;
DROP INDEX IF EXISTS public.orders_idempotency_key_key;

-- Same key allowed for different customers, never twice for one customer.
-- Old orders (customer_id NULL) are not constrained against each other.
CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_key
  ON public.orders (customer_id, idempotency_key);
