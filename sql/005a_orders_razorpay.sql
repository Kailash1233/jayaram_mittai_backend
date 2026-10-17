-- Razorpay payments, step 1 of 2. Additive only: safe to run now.
-- Orders start as status 'pending_payment' / payment_status 'pending' and
-- become 'confirmed' / 'paid' once the backend verifies the payment.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id   text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS paid_at             timestamptz;

-- One Razorpay order per shop order; also makes the payment lookups fast.
-- Existing orders stay NULL (allowed more than once).
CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_order_id_key
  ON public.orders (razorpay_order_id);

-- Check: if this returns a CHECK constraint on `status` or `payment_status`
-- that doesn't allow 'pending_payment' / 'pending' / 'failed', it must be
-- widened before the new code can save orders. Paste the result to review.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass AND contype = 'c';
