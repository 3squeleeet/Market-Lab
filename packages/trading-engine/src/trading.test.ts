import { describe, it, expect } from "vitest";
import { TradingEngine } from "./index";
import type { Quote } from "../../shared/src/index";
const quote = (price = 100): Quote => ({
  symbol: "BTC/USD",
  price,
  initial: 100,
  bid: price - 0.1,
  ask: price + 0.1,
  volume: 1000,
  candles: [],
});
const order = (
  requestId: string,
  side: "buy" | "sell" = "buy",
  quantity = 1,
) => ({
  requestId,
  symbol: "BTC/USD" as const,
  side,
  type: "market" as const,
  quantity,
});
describe("contabilidade e execução spot", () => {
  it("mantém e liquida resíduos sem apagar patrimônio", () => {
    const t = new TradingEngine();
    t.submit("main", order("dust-buy"), [quote()], 1);
    t.submit(
      "main",
      order("dust-sell", "sell", 0.99999999995),
      [quote(1e12)],
      2,
    );
    expect(t.position("main", "BTC/USD")!.quantity).toBeGreaterThan(0);
    t.close("main", "BTC/USD", [quote(1e12)], 3);
    expect(t.state.positions).toHaveLength(0);
  });
  it("compra com spread, slippage e taxa, sem criar posições falsas", () => {
    const t = new TradingEngine(),
      q = quote();
    expect(t.state.positions).toHaveLength(0);
    const o = t.submit("main", order("a"), [q], 1),
      px = q.ask * 1.0002,
      fee = px * 0.001;
    expect(o.executedPrice).toBeCloseTo(px, 10);
    expect(o.fees).toBeCloseTo(fee, 10);
    expect(o.slippage).toBeCloseTo(px - q.ask, 10);
    expect(t.account("main").cash).toBeCloseTo(100000 - px - fee, 8);
    expect(t.portfolio("main", [q]).unrealized).toBeCloseTo(100 - px - fee, 8);
  });
  it("preço médio ponderado, redução, P&L líquido e fechamento", () => {
    const t = new TradingEngine();
    t.submit("main", order("a", "buy", 2), [quote(100)], 1);
    t.submit("main", order("b", "buy", 1), [quote(130)], 2);
    const p = t.position("main", "BTC/USD")!,
      avg = (100.1 * 1.0002 * 2 + 130.1 * 1.0002) / 3;
    expect(p.averagePrice).toBeCloseTo(avg, 10);
    const allocation = p.entryFees / 3,
      o = t.submit("main", order("c", "sell", 1), [quote(150)], 3);
    expect(t.account("main").realized).toBeCloseTo(
      o.executedPrice! - avg - o.fees - allocation,
      9,
    );
    expect(t.position("main", "BTC/USD")?.quantity).toBe(2);
    t.close("main", "BTC/USD", [quote(140)], 4);
    expect(t.state.positions).toHaveLength(0);
    expect(t.state.closed).toHaveLength(2);
    expect(t.account("main").cash - 100000).toBeCloseTo(
      t.account("main").realized,
      8,
    );
  });
  it("reserva saldo e quantidade; cancela e libera reservas", () => {
    const t = new TradingEngine();
    const o = t.submit(
      "main",
      { ...order("limit"), type: "limit", quantity: 900, price: 100 },
      [quote(110)],
      1,
    );
    expect(o.status).toBe("pending");
    expect(t.portfolio("main", [quote()]).reserved).toBeCloseTo(90090);
    expect(() =>
      t.submit("main", order("large", "buy", 200), [quote()], 1),
    ).toThrow("Saldo");
    t.cancel("main", o.id, 2);
    expect(t.reservedCash("main")).toBe(0);
    t.submit("main", order("buy", "buy", 2), [quote()], 3);
    t.submit(
      "main",
      { ...order("sell", "sell", 2), type: "limit", price: 150 },
      [quote()],
      4,
    );
    expect(() =>
      t.submit("main", order("oversell", "sell", 1), [quote()], 5),
    ).toThrow("Quantidade");
  });
  it("limite executa apenas ao atingir bid/ask e respeita o preço solicitado", () => {
    const t = new TradingEngine(),
      o = t.submit(
        "main",
        { ...order("limit"), type: "limit", price: 95 },
        [quote()],
        1,
      );
    t.onTick([quote(96)], 2);
    expect(o.status).toBe("pending");
    t.onTick([quote(94)], 3);
    expect(o.status).toBe("filled");
    expect(o.executedPrice).toBeLessThanOrEqual(95);
    const sell = t.submit(
      "main",
      { ...order("sell", "sell"), type: "limit", price: 120 },
      [quote(100)],
      4,
    );
    t.onTick([quote(121)], 5);
    expect(sell.status).toBe("filled");
    expect(sell.executedPrice).toBeGreaterThanOrEqual(120);
  });
  it("idempotência não duplica saldo/execução e detecta conflito", () => {
    const t = new TradingEngine(),
      a = t.submit("main", order("id"), [quote()], 1);
    const balance = t.account("main").cash;
    expect(t.submit("main", order("id"), [quote(120)], 2).id).toBe(a.id);
    expect(t.account("main").cash).toBe(balance);
    expect(t.state.executions).toHaveLength(1);
    expect(() => t.submit("main", order("id", "buy", 2), [quote()], 3)).toThrow(
      "Identificador",
    );
  });
  it("recusa saldo/quantidade inválidos, venda sem posição e excesso de exposição", () => {
    const t = new TradingEngine();
    for (const n of [0, -1, NaN, Infinity])
      expect(() =>
        t.submit("main", order("x" + n, "buy", n), [quote()], 1),
      ).toThrow();
    expect(() =>
      t.submit("main", order("sell", "sell"), [quote()], 1),
    ).toThrow();
    expect(() =>
      t.submit("main", order("exp", "buy", 600), [quote()], 1, 0.5),
    ).toThrow("exposição");
    expect(t.account("main").cash).toBe(100000);
  });
  it("stop-loss percentual dispara venda com custos e cancela vendas reservadas", () => {
    const t = new TradingEngine();
    t.submit("main", order("buy", "buy", 2), [quote()], 1);
    const p = t.setRisk("main", "BTC/USD", "stopLoss", null, 5, [quote()]);
    expect(p.stopLoss).toBeCloseTo(p.averagePrice * 0.95);
    const lim = t.submit(
      "main",
      { ...order("l", "sell", 2), type: "limit", price: 150 },
      [quote()],
      2,
    );
    t.onTick([quote(90)], 3);
    expect(t.state.positions).toHaveLength(0);
    expect(lim.status).toBe("cancelled");
    expect(t.state.closed[0].reason).toBe("stop_loss");
  });
  it("take-profit absoluto dispara e aceita remoção de proteção", () => {
    const t = new TradingEngine();
    t.submit("main", order("buy"), [quote()], 1);
    t.setRisk("main", "BTC/USD", "takeProfit", 110, undefined, [quote()]);
    t.onTick([quote(111)], 2);
    expect(t.state.closed[0].reason).toBe("take_profit");
    expect(t.account("main").realized).toBeGreaterThan(0);
  });
  it("identidade contábil mantém patrimônio igual a capital mais P&L líquido", () => {
    const t = new TradingEngine();
    t.submit("main", order("a", "buy", 2), [quote(100)], 1);
    t.submit("main", order("b", "sell", 0.7), [quote(110)], 2);
    const pf = t.portfolio("main", [quote(105)]);
    expect(pf.equity - 100000).toBeCloseTo(pf.realized + pf.unrealized, 8);
    expect(() =>
      t.submit(
        "main",
        order("tooMuch", "sell", 1.30000000001),
        [quote(110)],
        3,
      ),
    ).toThrow("Quantidade");
  });
  it("contas isoladas não compartilham saldo nem inventário", () => {
    const t = new TradingEngine();
    t.addAccount("a", "A", 1000);
    t.addAccount("b", "B", 2000);
    t.submit("a", order("a"), [quote()], 1);
    expect(t.account("main").cash).toBe(100000);
    expect(t.account("b").cash).toBe(2000);
    expect(() => t.submit("b", order("sell", "sell"), [quote()], 2)).toThrow();
  });
});

it("SHORT reserva margem 1x, lucra na queda e cobre com taxas sem alterar a identidade contábil", () => {
  const t = new TradingEngine();
  const entry = t.submit(
    "main",
    { ...order("short", "sell", 2), positionSide: "short" },
    [quote(100)],
    1,
  );
  const p = t.position("main", "BTC/USD")!;
  expect(p.direction).toBe("short");
  expect(t.account("main").cash).toBeCloseTo(
    100000 - entry.executedPrice! * 2 - entry.fees,
  );
  const pf = t.portfolio("main", [quote(80)]);
  expect(pf.unrealized).toBeGreaterThan(0);
  expect(pf.equity - 100000).toBeCloseTo(pf.realized + pf.unrealized, 8);
  t.close("main", "BTC/USD", [quote(80)], 2);
  expect(t.state.positions).toHaveLength(0);
  expect(t.account("main").realized).toBeGreaterThan(0);
  expect(t.account("main").cash - 100000).toBeCloseTo(
    t.account("main").realized,
    8,
  );
});
it("SHORT suporta limite, reserva e stop acima da entrada", () => {
  const t = new TradingEngine();
  const o = t.submit(
    "main",
    {
      ...order("short-limit", "sell", 2),
      positionSide: "short",
      type: "limit",
      price: 110,
    },
    [quote(100)],
    1,
  );
  expect(o.status).toBe("pending");
  expect(t.reservedCash("main")).toBeCloseTo(220.22);
  t.onTick([quote(111)], 2);
  expect(o.status).toBe("filled");
  const p = t.setRisk("main", "BTC/USD", "stopLoss", null, 5, [quote(111)]);
  expect(p.stopLoss).toBeGreaterThan(p.averagePrice);
  t.onTick([quote(120)], 3);
  expect(t.state.positions).toHaveLength(0);
  expect(t.state.closed[0].reason).toBe("stop_loss");
});
it("SHORT é liquidado na alta e gaps não geram saldo negativo", () => {
  const t = new TradingEngine();
  t.submit(
    "main",
    { ...order("short-gap", "sell", 2), positionSide: "short" },
    [quote(100)],
    1,
  );
  t.onTick([quote(1000)], 2);
  expect(t.state.positions).toHaveLength(0);
  expect(t.state.closed[0].reason).toBe("margin_liquidation");
  expect(t.state.closed[0].gapProtection).toBeGreaterThan(0);
  expect(t.account("main").cash).toBeGreaterThan(0);
  expect(t.account("main").cash - 100000).toBeCloseTo(
    t.account("main").realized,
    8,
  );
});
it("SHORT impede hedge oposto e permite redução parcial e take-profit", () => {
  const t = new TradingEngine();
  t.submit(
    "main",
    { ...order("short-a", "sell", 3), positionSide: "short" },
    [quote(100)],
    1,
  );
  expect(() =>
    t.submit("main", order("opposite", "buy", 1), [quote(100)], 2),
  ).toThrow("inverter");
  t.submit(
    "main",
    { ...order("cover-one", "buy", 1), positionSide: "short" },
    [quote(90)],
    3,
  );
  expect(t.position("main", "BTC/USD")?.quantity).toBe(2);
  t.setRisk("main", "BTC/USD", "takeProfit", 80, undefined, [quote(90)]);
  t.onTick([quote(79)], 4);
  expect(t.state.positions).toHaveLength(0);
  expect(t.state.closed.at(-1)?.reason).toBe("take_profit");
});
