// =============================================================================
// JAYARAM MITTAI — PRODUCT STOCK STATE MACHINE
// Pure, DB-free logic shared by the catalog (customer reads), orders
// (purchase-time check) and admin products (staff actions).
//
// States:
//   in_stock               — purchasable.
//   temporary_hold         — auto-set when stock hits 0; auto-reopens at
//                            `outOfStockUntil` if stock has been replenished
//                            by then, otherwise escalates to needs_review.
//   needs_review           — a temporary hold nobody resolved in time;
//                            surfaced to staff, never set automatically
//                            except by that escalation.
//   scheduled_hold         — staff knows exactly when it's back (e.g. a
//                            restock date); auto-reopens at `outOfStockUntil`.
//   permanent_out_of_stock — discontinued; never auto-changes.
//
// Fields are stored directly on each item inside a `products` row's
// `products` jsonb array (there is no separate stock table), so every field
// here is optional — older items predate this feature entirely and should
// behave as plain `in_stock`.
// =============================================================================

export type StockState =
  | 'in_stock'
  | 'temporary_hold'
  | 'needs_review'
  | 'scheduled_hold'
  | 'permanent_out_of_stock';

export const STOCK_STATES: StockState[] = [
  'in_stock',
  'temporary_hold',
  'needs_review',
  'scheduled_hold',
  'permanent_out_of_stock',
];

/** The stock fields as stored on a catalog item. Snake_case, matching the
 * existing `product_id` / `image_url` convention on these jsonb items. */
export interface StoredStock {
  stock_state?: StockState | null;
  stock?: number | null;
  out_of_stock_until?: string | null;
  custom_message?: string | null;
  review_flagged_at?: string | null;
}

export interface ResolvedStock {
  stockState: StockState;
  stock: number | null;
  outOfStockUntil: string | null;
  customMessage: string | null;
  reviewFlaggedAt: string | null;
  /** True when `fields` is now stale and should be written back. */
  changed: boolean;
}

/** How long a temporary hold waits for a restock before it escalates. */
const TEMPORARY_HOLD_DEFAULT_HOURS = 24;

/**
 * Resolves the *effective* state right now, applying the two automatic
 * transitions (temporary_hold -> needs_review | in_stock, scheduled_hold ->
 * in_stock) without mutating the input. Callers with write access (admin
 * reads, the secret-key client) should persist a `changed: true` result;
 * read-only callers (the public catalog) just display it.
 */
export function resolveStock(fields: StoredStock, now: Date = new Date()): ResolvedStock {
  const state: StockState = fields.stock_state ?? 'in_stock';
  const stock = fields.stock ?? null;
  const outOfStockUntil = fields.out_of_stock_until ?? null;
  const customMessage = fields.custom_message ?? null;
  const reviewFlaggedAt = fields.review_flagged_at ?? null;

  if (state === 'temporary_hold' && outOfStockUntil && now >= new Date(outOfStockUntil)) {
    if (stock != null && stock > 0) {
      return {
        stockState: 'in_stock',
        stock,
        outOfStockUntil: null,
        customMessage: null,
        reviewFlaggedAt: null,
        changed: true,
      };
    }
    return {
      stockState: 'needs_review',
      stock,
      outOfStockUntil,
      customMessage,
      reviewFlaggedAt: reviewFlaggedAt ?? now.toISOString(),
      changed: true,
    };
  }

  if (state === 'scheduled_hold' && outOfStockUntil && now >= new Date(outOfStockUntil)) {
    return {
      stockState: 'in_stock',
      stock,
      outOfStockUntil: null,
      customMessage: null,
      reviewFlaggedAt: null,
      changed: true,
    };
  }

  // A tracked quantity hitting zero while nominally "in stock" is the one
  // automatic *entry* into the hold states — everything else above is exit.
  if (state === 'in_stock' && stock != null && stock <= 0) {
    return {
      stockState: 'temporary_hold',
      stock,
      outOfStockUntil: new Date(now.getTime() + TEMPORARY_HOLD_DEFAULT_HOURS * 60 * 60 * 1000).toISOString(),
      customMessage: null,
      reviewFlaggedAt: null,
      changed: true,
    };
  }

  return { stockState: state, stock, outOfStockUntil, customMessage, reviewFlaggedAt, changed: false };
}

export function isPurchasable(state: StockState): boolean {
  return state === 'in_stock';
}

/** What to show a customer for a non-purchasable item; null when it's available. */
export function customerStockMessage(resolved: ResolvedStock): string | null {
  if (resolved.stockState === 'in_stock') return null;
  if (resolved.customMessage) return resolved.customMessage;
  switch (resolved.stockState) {
    case 'temporary_hold':
      return 'Temporarily out of stock.';
    case 'needs_review':
      return 'Currently unavailable.';
    case 'scheduled_hold':
      return resolved.outOfStockUntil
        ? `Back in stock soon.`
        : 'Coming back soon.';
    case 'permanent_out_of_stock':
      return 'No longer available.';
  }
}

/** Converts a resolved state back to the stored (snake_case) shape, for writes. */
export function toStored(resolved: ResolvedStock): Required<StoredStock> {
  return {
    stock_state: resolved.stockState,
    stock: resolved.stock,
    out_of_stock_until: resolved.outOfStockUntil,
    custom_message: resolved.customMessage,
    review_flagged_at: resolved.reviewFlaggedAt,
  };
}
