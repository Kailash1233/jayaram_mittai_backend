-- Race-free order numbers (ISSUES.md #3).
-- Run in the Supabase SQL editor BEFORE deploying the matching backend change.

-- 1. One counter row per (IST) day
CREATE TABLE IF NOT EXISTS public.order_counters (
  day        date PRIMARY KEY,
  last_value integer NOT NULL
);

-- No policies: only the function below (running as owner) can touch it
ALTER TABLE public.order_counters ENABLE ROW LEVEL SECURITY;

-- 2. Seed from existing orders so today's numbering continues where it is
INSERT INTO public.order_counters (day, last_value)
SELECT to_date(substring(order_number FROM 4 FOR 10), 'YYYY/MM/DD'),
       max(split_part(order_number, '-', 3)::integer)
FROM public.orders
WHERE order_number ~ '^JM-\d{4}/\d{2}/\d{2}-\d+$'
GROUP BY 1
ON CONFLICT (day) DO UPDATE
  SET last_value = GREATEST(order_counters.last_value, EXCLUDED.last_value);

-- 3. Atomically increment and return the next number for a day.
--    The row lock on the upsert makes concurrent callers wait their turn.
--    SECURITY DEFINER so the anon key can call it without table access.
CREATE OR REPLACE FUNCTION public.next_order_seq(p_day date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.order_counters (day, last_value) VALUES (p_day, 1)
  ON CONFLICT (day) DO UPDATE
    SET last_value = order_counters.last_value + 1
  RETURNING last_value;
$$;

REVOKE ALL ON FUNCTION public.next_order_seq(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_order_seq(date) TO anon, authenticated, service_role;

-- 4. Safety net: the database refuses duplicate order numbers.
--    Already present in production (unique index orders_order_number_key),
--    so this step was skipped there.
-- ALTER TABLE public.orders
--   ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
