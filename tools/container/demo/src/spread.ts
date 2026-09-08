import type { Quote } from './quote';

/** Return the quoted spread; reject invalid or crossed markets. */
export function spread(quote: Quote): number {
  if (!Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.ask < quote.bid) {
    throw new Error('A finite, uncrossed quote is required');
  }
  return quote.ask - quote.bid;
}
