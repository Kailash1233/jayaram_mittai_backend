import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type StockAction =
  | 'mark_temporary'
  | 'mark_scheduled'
  | 'mark_permanent'
  | 'restock';

const STOCK_ACTIONS: StockAction[] = [
  'mark_temporary',
  'mark_scheduled',
  'mark_permanent',
  'restock',
];

/**
 * DTO for PATCH /admin/products/:productId/stock — the one endpoint that
 * moves a product through the out-of-stock state machine (see
 * `src/catalog/stock-state.ts`).
 *
 *  - mark_temporary: goes on hold now; reopens automatically at
 *    `outOfStockUntil` (defaults to 24h from now) if restocked by then,
 *    otherwise escalates to `needs_review`.
 *  - mark_scheduled: goes on hold now for a known reason (e.g. a restock
 *    date); requires `outOfStockUntil`; reopens automatically at that time.
 *  - mark_permanent: discontinued; never auto-changes.
 *  - restock: returns to `in_stock` immediately, optionally setting `stock`.
 */
export class UpdateStockDto {
  @IsIn(STOCK_ACTIONS, {
    message: `action must be one of: ${STOCK_ACTIONS.join(', ')}`,
  })
  @IsNotEmpty()
  action: StockAction;

  /** Required for mark_scheduled; optional (defaults to +24h) for mark_temporary. */
  @IsOptional()
  @IsISO8601({}, { message: 'outOfStockUntil must be an ISO 8601 date string.' })
  outOfStockUntil?: string;

  /** Shown to customers instead of the default per-state message. */
  @IsOptional()
  @IsString()
  customMessage?: string;

  /** Only used by `restock`; the new tracked quantity. */
  @IsOptional()
  @IsNumber({}, { message: 'Stock must be a number.' })
  @Min(0, { message: 'Stock cannot be negative.' })
  @Type(() => Number)
  stock?: number;
}
