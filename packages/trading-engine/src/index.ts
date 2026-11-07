export interface Position {
  symbol: string;
  quantity: number;
  entry: number;
}
export function unrealized(
  positions: Position[],
  prices: Record<string, number>,
) {
  return positions.reduce(
    (sum, p) => sum + p.quantity * ((prices[p.symbol] ?? p.entry) - p.entry),
    0,
  );
}
export interface TradingEngine {
  submitOrder(): never;
}
// Execução de ordens será implementada no próximo marco.
