-- Razorpay payments, step 2 of 2. Run only AFTER the backend with
-- SUPABASE_SECRET_KEY is running and a test order + payment have worked.
--
-- Orders are now inserted and updated only by the backend's secret-key
-- client (which bypasses RLS). Customers keep read access to their own
-- orders ("Customers read own orders").

-- A logged-in customer can no longer insert orders straight into Supabase
-- (e.g. a ₹1 order marked paid), bypassing backend pricing and payment.
DROP POLICY IF EXISTS "Customers create own orders" ON public.orders;

-- Order numbers are taken by the backend only
REVOKE EXECUTE ON FUNCTION public.next_order_seq(date) FROM authenticated;
