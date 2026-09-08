/** Normalized quote contract shared by the adapter and spread engine. */
export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  observedAt: string;
}
