# Known issues checklist

## Bugs in app code

- [x] **1. `createOrder` reports success when the insert fails** — `src/orders/orders.service.ts`
  Supabase returns `{ error }` instead of throwing, so the `catch` never runs. The customer gets
  `success: true` but the order isn't saved. Check `error` and throw.
- [x] **2. `idempotencyKey` is required but never used** — `src/orders/orders.service.ts`
  A double-click or retry creates two orders. Store the key and return the existing order on repeat.
  ⚠️ Run `sql/001_orders_idempotency_key.sql` in Supabase before deploying.
- [x] **3. Order numbers can collide** — `src/orders/orders.service.ts`
  The next number is "latest + 1", so two orders placed at the same moment can both get
  `JM-…-6`. Needs a DB sequence or a unique constraint with retry.
  Fixed with a per-day DB counter (IST dates); verified live with 5 simultaneous orders.
  `orders.order_number` already had a UNIQUE index (`orders_order_number_key`), so step 4 of
  the SQL was not needed.
- [x] **4. Address returns 400 instead of 404 when not found** — `src/address/address.service.ts`
  `.single()` reports "no rows" as an error, so the `NotFoundException` branch never runs.
  Use `.maybeSingle()` in `getAddressById` and `updateAddress`.
- [x] **5. Unknown delivery location returns 500** — `src/delivery_zones/delivery.zones.service.ts`
  `getDeliveryZoneByLocation` throws `InternalServerErrorException`; should be `NotFoundException`.
- [x] **6. Orders use hard-coded products and zones** — `src/orders/orders.service.ts`
  `CATALOG_PRODUCTS` and `DELIVERY_ZONES` duplicate the DB tables, so prices can drift.
  Load them from `products` / `deliveryzones`.
- [x] **7. Orders throw plain `Error` for DB failures** — `src/orders/orders.service.ts`
  Nest turns these into generic 500s with no useful message. Use Nest HTTP exceptions.

- [x] **13. Admin order status update silently does nothing** — `src/admin/orders/orders.service.ts`
  `PATCH /admin/orders/:id/status` returns 200 with an empty body, but the status is unchanged.
  The backend uses the publishable (anon) Supabase key, so Row Level Security most likely
  blocks the UPDATE without an error. Use the secret (service role) key server-side, and
  throw when the update returns no row instead of returning `null`.
  ⚠️ After `sql/003b` runs, admin orders and analytics (anon) will see no orders at all until
  admin gets its own DB access (e.g. a secret-key client for admin code).

- [x] **14. Admin delivery endpoints all return 500** — `src/admin/delivery/delivery.service.ts`
  The code reads tables `delivery_zones`, `delivery_rules` and `delivery_hours`, none of which
  exist. The real zones table is `deliveryzones` (columns `id`, `location_name`, `pincodes`),
  while the admin code expects `name`, `radius_km`, `is_active`, `created_at`. Every
  `/admin/delivery/{zones,rules,hours}` route fails. Decide: point admin at the real tables,
  or create the missing tables.

- [x] **15. `orders` table is open to the public via the anon key** — Supabase RLS policies
  "Enable read access for all users" (SELECT, `public`) lets anyone read every order, including
  customer names, phones and addresses. "Enable insert for authenticated users only" is actually
  granted to `anon`, so anyone can insert orders directly, bypassing backend validation and
  pricing. Fix chosen: per-customer RLS. Customers log in (phone OTP), orders are written and
  read with the customer's own token, policies allow only `customer_id = auth.uid()`.
  Done: `sql/003a` + `sql/003b` applied, verified live — customers see only their own orders,
  and the anon key can no longer read orders, insert orders, or call `next_order_seq`.
  Follow-up (Supabase setting): turn on "Detect and revoke potentially compromised refresh
  tokens" — currently off, so reusing an old refresh token doesn't end the session.

- [x] **16. Customer login is shared across all users** — old `src/auth/email-auth`, `src/auth/otp/request`
  Sign-in / OTP verify ran on the shared `SUPABASE_CLIENT`, which stores the session.
  Old email/OTP code was removed; the new phone-OTP login (`src/auth/otp/`) uses a fresh,
  non-persisting client per call and returns the session to the caller.
- [x] **17. Email OTP verified with `type: 'sms'`** — removed with the old OTP code; the new
  phone OTP correctly uses `type: 'sms'`.
- [x] **19. Idempotency key is unique across all customers** — DB index `orders_idempotency_key_key`
  Found in live test 3.4: customer B reusing a key customer A already used gets a 500
  (duplicate key). Fixed by `sql/004_idempotency_key_per_customer.sql` (unique per
  customer); verified live: A and B each have their own order with the same key.
- [x] **18. Address folder tracked as `src/Address` in git** — the code imports `./address/…`.
  Fine on Windows (case-insensitive), but a Linux build/deploy won't find the files.
  Fix: `git mv src/Address src/address-tmp && git mv src/address-tmp src/address`.

## Failing tests

- [x] **8. `users.service.spec.ts` fails (4 tests)** — still mocks a TypeORM repository, but
  `UsersService` now uses Supabase. Rewrite with `test/utils/supabase-mock.ts`.
- [x] **9. `app.controller.spec.ts` fails** — expects `'Hello World!'`, controller returns
  `{ message: 'Hello from NestJS!' }`.

## Lint warnings

- [x] **10. Unused `Param` import** — `src/catalog/products/products.controller.ts:1`
- [x] **11. `no-misused-spread`** — `src/admin/products/products.service.ts:33`
- [x] **12. `no-thenable`** — `test/utils/supabase-mock.ts:41` (intentional for the mock; add a
  disable comment)
