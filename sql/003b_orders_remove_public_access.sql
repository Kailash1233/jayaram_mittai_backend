-- Per-customer orders, step 2 of 2. Run only AFTER the backend with
-- customer login is deployed and verified (ISSUES.md #15).
--
-- ⚠️ Admin order screens and analytics read `orders` as anon and will see
-- no orders after this (ISSUES.md #13) until admin gets its own access.

-- Nobody can read every order with the public key any more
DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;

-- Nobody can insert orders directly with the public key, bypassing the backend
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.orders;

-- Only logged-in customers (via the backend) need order numbers
REVOKE EXECUTE ON FUNCTION public.next_order_seq(date) FROM anon;
