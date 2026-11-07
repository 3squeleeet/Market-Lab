import type { Quote, Symbol, Candle } from "../../shared/src/index";
export const ASSETS: [Symbol, number][] = [
  ["BTC/USD", 67432.8],
  ["ETH/USD", 3521.4],
  ["SOL/USD", 172.65],
  ["BNB/USD", 598.2],
  ["XRP/USD", 0.5284],
  ["DOGE/USD", 0.1426],
  ["ADA/USD", 0.4532],
  ["AVAX/USD", 36.78],
];
export class MarketEngine {
  private state: number;
  private spare: number | null = null;
  ticks = 0;
  time = 1735689600;
  regime = 0;
  factor = 0;
  quotes: Quote[];
  constructor(
    public seed = 42,
    public volatility = 1,
  ) {
    this.state = seed >>> 0;
    this.quotes = ASSETS.map(([symbol, price]) => ({
      symbol,
      price,
      initial: price,
      bid: price,
      ask: price,
      volume: 0,
      candles: [],
    }));
  }
  private uniform() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return (this.state + 1) / 4294967297;
  }
  private normal(): number {
    if (this.spare !== null) {
      const n = this.spare;
      this.spare = null;
      return n;
    }
    const r = Math.sqrt(-2 * Math.log(this.uniform())),
      a = 2 * Math.PI * this.uniform();
    this.spare = r * Math.sin(a);
    return r * Math.cos(a);
  }
  step() {
    this.ticks++;
    this.time++;
    if (this.ticks % 240 === 1) this.regime = Math.floor(this.uniform() * 3);
    const drift = [0.000009, 0.000055, -0.000045][this.regime];
    this.factor = 0.85 * this.factor + 0.15 * this.normal();
    const common = this.normal();
    for (const q of this.quotes) {
      const sigma = 0.00055 * this.volatility * (this.regime === 2 ? 1.6 : 1);
      const r =
        drift +
        sigma * (0.72 * common + Math.sqrt(1 - 0.72 ** 2) * this.normal()) +
        this.factor * 0.00003;
      const open = q.price;
      q.price = Math.max(1e-8, open * Math.exp(r - (sigma * sigma) / 2));
      const range = Math.abs(this.normal()) * sigma * 0.35;
      const volume =
        ((1 + Math.abs(r) / Math.max(sigma, 1e-9)) * this.uniform() * 150000) /
        open;
      q.volume += volume;
      const spread = q.price * (0.00012 + Math.abs(r) * 0.2);
      q.bid = q.price - spread / 2;
      q.ask = q.price + spread / 2;
      q.candles.push({
        time: this.time,
        open,
        close: q.price,
        high: Math.max(open, q.price) * (1 + range),
        low: Math.min(open, q.price) * Math.exp(-range),
        volume,
      });
      if (q.candles.length > 7200) q.candles.shift();
    }
    return this.quotes;
  }
}
export function aggregate(candles: Candle[], interval: number): Candle[] {
  const result: Candle[] = [];
  for (const c of candles) {
    const time = Math.floor(c.time / interval) * interval;
    const last = result.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else result.push({ ...c, time });
  }
  return result;
}
