-- Razorpay: allow orders to be saved before the payment method is known.
-- Found in the live test: saving a new order failed with
--   null value in column "payment_method" ... violates not-null constraint
-- With Razorpay the customer picks UPI / card / netbanking inside Checkout;
-- the backend records the method used when the payment webhook arrives.

-- Empty until paid
ALTER TABLE public.orders ALTER COLUMN payment_method DROP NOT NULL;

-- A row inserted without a status must not look confirmed before payment.
-- (The backend always sets status itself; this is a safety default.)
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'pending_payment';

-- Check: any CHECK rules on orders (shown last so the SQL editor displays
-- it). Any rule on status / payment_status / payment_method must allow
-- 'pending_payment', 'pending', 'failed' and Razorpay's methods
-- (card, netbanking, wallet, emi, upi, cardless_emi, paylater).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass AND contype = 'c';
