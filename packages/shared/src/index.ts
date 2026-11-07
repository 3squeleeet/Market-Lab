export type Symbol =
  | "BTC/USD"
  | "ETH/USD"
  | "SOL/USD"
  | "BNB/USD"
  | "XRP/USD"
  | "DOGE/USD"
  | "ADA/USD"
  | "AVAX/USD";
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Quote {
  symbol: Symbol;
  price: number;
  initial: number;
  bid: number;
  ask: number;
  volume: number;
  candles: Candle[];
}
export interface SavedSession {
  version: 1;
  seed: number;
  ticks: number;
  speed: number;
  volatility: number;
  running: boolean;
}
export interface DesktopAPI {
  load(): Promise<SavedSession | null>;
  save(session: SavedSession): Promise<void>;
}
