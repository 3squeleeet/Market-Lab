import { describe, it, expect } from "vitest";
import { MarketEngine, aggregate } from "./index";
import { SimulationClock } from "../../time-controller/src/index";
describe("mercado determinístico", () => {
  it("reproduz integralmente a trajetória pela seed", () => {
    const a = new MarketEngine(123),
      b = new MarketEngine(123),
      c = new MarketEngine(124);
    for (let i = 0; i < 1000; i++) {
      a.step();
      b.step();
      c.step();
    }
    expect(a.quotes).toEqual(b.quotes);
    expect(a.quotes[0].price).not.toBe(c.quotes[0].price);
  });
  it("mantém preços positivos, spread e invariantes OHLCV", () => {
    const m = new MarketEngine(9, 5);
    for (let i = 0; i < 10000; i++) m.step();
    for (const q of m.quotes) {
      expect(q.bid).toBeLessThan(q.ask);
      expect(
        q.candles.every(
          (c) =>
            c.low > 0 &&
            c.high >= Math.max(c.open, c.close) &&
            c.low <= Math.min(c.open, c.close) &&
            c.volume >= 0,
        ),
      ).toBe(true);
    }
  });
  it("agrega sem perder volume e preserva abertura e fechamento", () => {
    const m = new MarketEngine();
    for (let i = 0; i < 90; i++) m.step();
    const raw = m.quotes[0].candles;
    const a = aggregate(raw, 15);
    expect(a[0].open).toBe(raw[0].open);
    expect(a.at(-1)?.close).toBe(raw.at(-1)?.close);
    expect(a.reduce((s, c) => s + c.volume, 0)).toBeCloseTo(
      raw.reduce((s, c) => s + c.volume, 0),
    );
  });
  it("produz correlação positiva sem trajetórias idênticas", () => {
    const m = new MarketEngine(42);
    const a: number[] = [],
      b: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const x = m.quotes[0].price,
        y = m.quotes[1].price;
      m.step();
      a.push(Math.log(m.quotes[0].price / x));
      b.push(Math.log(m.quotes[1].price / y));
    }
    const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
    const ma = avg(a),
      mb = avg(b);
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
    const corr =
      cov /
      Math.sqrt(
        a.reduce((s, x) => s + (x - ma) ** 2, 0) *
          b.reduce((s, x) => s + (x - mb) ** 2, 0),
      );
    expect(corr).toBeGreaterThan(0.3);
    expect(corr).toBeLessThan(0.85);
  });
});
describe("relógio", () => {
  it("respeita pausa, velocidade e frações de tick", () => {
    const clock = new SimulationClock();
    let n = 0;
    const step = () => n++;
    clock.advance(500, step);
    expect(n).toBe(0);
    clock.advance(500, step);
    expect(n).toBe(1);
    clock.running = false;
    clock.advance(10000, step);
    expect(n).toBe(1);
    clock.running = true;
    clock.speed = 50;
    clock.advance(1000, step);
    expect(n).toBe(51);
  });
});
