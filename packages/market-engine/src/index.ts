import type {
  Quote,
  Symbol,
  Candle,
  MarketState,
  MarketEvent,
  EventKind,
  Regime,
} from "../../shared/src/index.js";
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
const descriptions: Record<EventKind, string> = {
  volatility: "Pico sintético de volatilidade",
  crash: "Queda sintética repentina",
  rally: "Movimento sintético de alta",
  quiet: "Período sintético de baixa atividade",
  regime: "Transição de regime",
};
export class MarketEngine {
  private state: number;
  private spare: number | null = null;
  private logVariance = 0;
  private event: EventKind | null = null;
  private eventUntil = 0;
  private listeners = new Set<(event: MarketEvent) => void>();
  events: MarketEvent[] = [];
  ticks = 0;
  time = 1735689600;
  regime: Regime = 0;
  factor = 0;
  quotes: Quote[];
  constructor(
    public seed = 42,
    public volatility = 1,
    public spreadBps = 1.2,
  ) {
    this.state = seed >>> 0;
    this.quotes = ASSETS.map(([symbol, price]) => ({
      symbol,
      price,
      initial: price,
      bid: price * (1 - spreadBps / 20000),
      ask: price * (1 + spreadBps / 20000),
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
      const x = this.spare;
      this.spare = null;
      return x;
    }
    const r = Math.sqrt(-2 * Math.log(this.uniform())),
      a = 2 * Math.PI * this.uniform();
    this.spare = r * Math.sin(a);
    return r * Math.cos(a);
  }
  onEvent(listener: (event: MarketEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(kind: EventKind, duration = 60) {
    if (kind === "regime") {
      const next = ((this.regime + 1 + Math.floor(this.uniform() * 2)) %
        3) as Regime;
      this.regime = next;
    } else {
      this.event = kind;
      this.eventUntil = this.time + duration;
    }
    const e: MarketEvent = {
      id: `event-${this.ticks}-${this.events.length}`,
      time: this.time,
      kind,
      duration,
      description: descriptions[kind],
    };
    this.events.push(e);
    for (const l of this.listeners) l(e);
    return e;
  }
  forceRegime(regime: Regime) {
    this.regime = regime;
    const e: MarketEvent = {
      id: `event-${this.ticks}-${this.events.length}`,
      time: this.time,
      kind: "regime",
      duration: 0,
      description: `Regime forçado: ${["lateral", "alta", "estresse"][regime]}`,
    };
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }
  setPrice(symbol: Symbol, price: number) {
    const q = this.quotes.find((q) => q.symbol === symbol)!;
    q.price = price;
    this.updateSpread(q, 0);
  }
  private updateSpread(q: Quote, activity: number) {
    const half = (q.price * (this.spreadBps / 10000 + activity * 0.2)) / 2;
    q.bid = Math.max(1e-12, q.price - half);
    q.ask = q.price + half;
  }
  step() {
    this.ticks++;
    this.time++;
    if (this.time >= this.eventUntil) this.event = null;
    // Markov transitions preserve regime persistence and consume randomness only on simulated ticks.
    if (this.ticks % 240 === 1 && this.uniform() < 0.65) this.emit("regime", 0);
    if (this.ticks % 120 === 0 && this.uniform() < 0.22)
      this.emit(
        (["volatility", "crash", "rally", "quiet"] as EventKind[])[
          Math.floor(this.uniform() * 4)
        ],
        30 + Math.floor(this.uniform() * 120),
      );
    const common = this.normal();
    this.factor = 0.85 * this.factor + 0.15 * this.normal();
    this.logVariance = Math.max(
      -2,
      Math.min(
        2,
        0.97 * this.logVariance +
          0.075 * (Math.abs(common) - 0.8) +
          0.04 * this.normal(),
      ),
    );
    const multiplier =
      this.event === "quiet" ? 0.3 : this.event === "volatility" ? 2.5 : 1;
    const sigma =
      0.00055 *
      this.volatility *
      Math.exp(this.logVariance / 2) *
      (this.regime === 2 ? 1.6 : 1) *
      multiplier;
    const shock =
      this.event === "crash" ? -0.00035 : this.event === "rally" ? 0.00035 : 0;
    const drift = [0.000009, 0.000055, -0.000045][this.regime] + shock;
    for (const q of this.quotes) {
      const r =
        drift +
        sigma * (0.72 * common + Math.sqrt(1 - 0.72 ** 2) * this.normal()) +
        this.factor * 0.00003;
      const open = q.price;
      q.price = Math.max(
        1e-8,
        Math.min(1e12, open * Math.exp(r - (sigma * sigma) / 2)),
      );
      const range = Math.abs(this.normal()) * sigma * 0.35;
      const volume =
        (((1 + Math.abs(r) / Math.max(sigma, 1e-9)) * this.uniform() * 150000) /
          open) *
        multiplier;
      q.volume += volume;
      this.updateSpread(q, Math.abs(r));
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
  snapshot(): MarketState {
    return structuredClone({
      seed: this.seed,
      volatility: this.volatility,
      spreadBps: this.spreadBps,
      rng: this.state,
      spare: this.spare,
      ticks: this.ticks,
      time: this.time,
      regime: this.regime,
      factor: this.factor,
      logVariance: this.logVariance,
      event: this.event,
      eventUntil: this.eventUntil,
      quotes: this.quotes,
      events: this.events,
    });
  }
  static restore(s: MarketState) {
    const m = new MarketEngine(s.seed, s.volatility, s.spreadBps);
    m.state = s.rng;
    m.spare = s.spare;
    m.ticks = s.ticks;
    m.time = s.time;
    m.regime = s.regime;
    m.factor = s.factor;
    m.logVariance = s.logVariance;
    m.event = s.event;
    m.eventUntil = s.eventUntil;
    m.quotes = structuredClone(s.quotes);
    m.events = structuredClone(s.events);
    return m;
  }
}
export function aggregate(candles: Candle[], interval: number): Candle[] {
  const result: Candle[] = [];
  for (const c of candles) {
    const time = Math.floor(c.time / interval) * interval,
      last = result.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else result.push({ ...c, time });
  }
  return result;
}
