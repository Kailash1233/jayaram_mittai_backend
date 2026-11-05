import {
  resolveStock,
  isPurchasable,
  customerStockMessage,
  toStored,
  type StoredStock,
} from './stock-state.js';

const NOW = new Date('2026-09-19T10:00:00Z');

describe('resolveStock', () => {
  it('defaults a bare item to in_stock', () => {
    const resolved = resolveStock({}, NOW);

    expect(resolved).toEqual({
      stockState: 'in_stock',
      stock: null,
      outOfStockUntil: null,
      customMessage: null,
      reviewFlaggedAt: null,
      changed: false,
    });
  });

  it('leaves a healthy in_stock item untouched', () => {
    const resolved = resolveStock({ stock_state: 'in_stock', stock: 5 }, NOW);

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('in_stock');
  });

  it('auto-enters temporary_hold when stock drops to zero while in_stock', () => {
    const resolved = resolveStock({ stock_state: 'in_stock', stock: 0 }, NOW);

    expect(resolved.changed).toBe(true);
    expect(resolved.stockState).toBe('temporary_hold');
    expect(resolved.outOfStockUntil).toBe(
      new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('auto-enters temporary_hold when stock is negative while in_stock', () => {
    const resolved = resolveStock({ stock_state: 'in_stock', stock: -3 }, NOW);

    expect(resolved.stockState).toBe('temporary_hold');
  });

  it('does not touch in_stock items with no tracked quantity', () => {
    const resolved = resolveStock({ stock_state: 'in_stock', stock: null }, NOW);

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('in_stock');
  });

  it('stays on temporary_hold before the deadline', () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'temporary_hold', out_of_stock_until: future, stock: 0 },
      NOW,
    );

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('temporary_hold');
  });

  it('reopens a temporary_hold at the deadline when restocked', () => {
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'temporary_hold', out_of_stock_until: past, stock: 20 },
      NOW,
    );

    expect(resolved.changed).toBe(true);
    expect(resolved).toMatchObject({
      stockState: 'in_stock',
      stock: 20,
      outOfStockUntil: null,
      customMessage: null,
      reviewFlaggedAt: null,
    });
  });

  it('escalates an unresolved temporary_hold to needs_review at the deadline', () => {
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'temporary_hold', out_of_stock_until: past, stock: 0 },
      NOW,
    );

    expect(resolved.changed).toBe(true);
    expect(resolved.stockState).toBe('needs_review');
    expect(resolved.reviewFlaggedAt).toBe(NOW.toISOString());
  });

  it('escalates to needs_review when still unrestocked (stock null)', () => {
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'temporary_hold', out_of_stock_until: past, stock: null },
      NOW,
    );

    expect(resolved.stockState).toBe('needs_review');
  });

  it('keeps the original reviewFlaggedAt if one was already set', () => {
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const resolved = resolveStock(
      {
        stock_state: 'temporary_hold',
        out_of_stock_until: past,
        stock: 0,
        review_flagged_at: '2026-09-18T00:00:00.000Z',
      },
      NOW,
    );

    expect(resolved.reviewFlaggedAt).toBe('2026-09-18T00:00:00.000Z');
  });

  it('never auto-changes needs_review on its own', () => {
    const resolved = resolveStock(
      { stock_state: 'needs_review', stock: 0, review_flagged_at: '2026-09-01T00:00:00.000Z' },
      NOW,
    );

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('needs_review');
  });

  it('stays on scheduled_hold before the deadline', () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'scheduled_hold', out_of_stock_until: future },
      NOW,
    );

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('scheduled_hold');
  });

  it('reopens a scheduled_hold at the deadline regardless of stock', () => {
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const resolved = resolveStock(
      { stock_state: 'scheduled_hold', out_of_stock_until: past, stock: 0 },
      NOW,
    );

    expect(resolved.changed).toBe(true);
    expect(resolved.stockState).toBe('in_stock');
    expect(resolved.outOfStockUntil).toBeNull();
  });

  it('never auto-changes permanent_out_of_stock', () => {
    const resolved = resolveStock({ stock_state: 'permanent_out_of_stock' }, NOW);

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('permanent_out_of_stock');
  });

  it('a scheduled_hold with no out_of_stock_until never auto-reopens', () => {
    const resolved = resolveStock({ stock_state: 'scheduled_hold' }, NOW);

    expect(resolved.changed).toBe(false);
    expect(resolved.stockState).toBe('scheduled_hold');
  });
});

describe('isPurchasable', () => {
  it('is true only for in_stock', () => {
    expect(isPurchasable('in_stock')).toBe(true);
    expect(isPurchasable('temporary_hold')).toBe(false);
    expect(isPurchasable('needs_review')).toBe(false);
    expect(isPurchasable('scheduled_hold')).toBe(false);
    expect(isPurchasable('permanent_out_of_stock')).toBe(false);
  });
});

describe('customerStockMessage', () => {
  it('returns null when in stock', () => {
    const resolved = resolveStock({ stock_state: 'in_stock' }, NOW);
    expect(customerStockMessage(resolved)).toBeNull();
  });

  it('prefers a custom message when set', () => {
    const resolved = resolveStock(
      { stock_state: 'temporary_hold', custom_message: 'Back by Diwali!' },
      NOW,
    );
    expect(customerStockMessage(resolved)).toBe('Back by Diwali!');
  });

  it('falls back to a default message per state', () => {
    expect(
      customerStockMessage(resolveStock({ stock_state: 'temporary_hold' }, NOW)),
    ).toBe('Temporarily out of stock.');
    expect(
      customerStockMessage(resolveStock({ stock_state: 'needs_review' }, NOW)),
    ).toBe('Currently unavailable.');
    expect(
      customerStockMessage(resolveStock({ stock_state: 'permanent_out_of_stock' }, NOW)),
    ).toBe('No longer available.');
  });

  it('gives a scheduled_hold message whether or not a date is set', () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    expect(
      customerStockMessage(
        resolveStock({ stock_state: 'scheduled_hold', out_of_stock_until: future }, NOW),
      ),
    ).toBe('Back in stock soon.');
    expect(
      customerStockMessage(resolveStock({ stock_state: 'scheduled_hold' }, NOW)),
    ).toBe('Coming back soon.');
  });
});

describe('toStored', () => {
  it('round-trips a resolved state back to the snake_case stored shape', () => {
    const stored: StoredStock = {
      stock_state: 'scheduled_hold',
      stock: 0,
      out_of_stock_until: '2026-10-01T00:00:00.000Z',
      custom_message: 'Back for Diwali',
      review_flagged_at: null,
    };

    const resolved = resolveStock(stored, NOW);
    expect(toStored(resolved)).toEqual(stored);
  });
});
