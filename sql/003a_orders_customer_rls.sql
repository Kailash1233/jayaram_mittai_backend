-- Per-customer orders, step 1 of 2. Additive only: safe to run BEFORE
-- deploying the backend that requires customer login for /api/orders.
-- Old code keeps working (its anon policies are untouched).

-- Which customer (Supabase Auth user) placed the order.
-- Existing orders stay NULL. Deleting a customer keeps their orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id uuid
  REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx
  ON public.orders (customer_id);

-- Logged-in customers may create orders only for themselves...
CREATE POLICY "Customers create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = (SELECT auth.uid()));

-- ...and read only their own. No UPDATE/DELETE: orders can't be changed.
CREATE POLICY "Customers read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()));
