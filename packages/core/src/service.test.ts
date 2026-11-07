import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, type Repository } from "../../database/src/index";
import { LabService } from "./index";
import { MarketEngine } from "../../market-engine/src/index";
import { SimulationClock } from "../../time-controller/src/index";
import type { Agent, Backtest, Portfolio } from "../../shared/src/index";
let dir: string, db: Repository, lab: LabService;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lab-service-"));
  db = await openDatabase(join(dir, "lab.sqlite"));
  lab = new LabService(db);
  lab.state.simulation.running = false;
  lab.commit();
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("serviços persistidos", () => {
  it("guarda trading, risco, limites, eventos e PRNG sem replay na reabertura", async () => {
    const q = lab.market.quotes[0];
    lab.execute("place_market_order", {
      requestId: "buy",
      symbol: q.symbol,
      side: "buy",
      quantity: 0.1,
    });
    lab.execute("place_limit_order", {
      requestId: "limit",
      symbol: q.symbol,
      side: "buy",
      quantity: 0.01,
      price: q.price * 0.5,
    });
    lab.execute("set_stop_loss", { symbol: q.symbol, percent: 20 });
    lab.execute("admin_intervene", {
      confirmed: true,
      action: "event",
      event: "volatility",
    });
    lab.advance(10);
    const expected = lab.snapshot(),
      next = MarketEngine.restore(expected.market);
    next.step();
    db.close();
    db = await openDatabase(join(dir, "lab.sqlite"));
    lab = new LabService(db);
    expect(lab.snapshot()).toEqual(expected);
    lab.market.step();
    expect(lab.market.snapshot()).toEqual(next.snapshot());
    expect(db.candles(expected.sessionId, "BTC/USD").length).toBe(3610);
  });
  it("agentes locais funcionam com limite e não mudam conta principal", () => {
    const a = lab.execute("create_agent", {
      name: "Hold",
      description: "teste",
      assets: ["BTC/USD"],
      capital: 1000,
      maxExposure: 0.5,
      strategy: "buy_hold",
    }) as Agent;
    lab.advance(20);
    const pf = lab.execute("get_portfolio", {
      accountId: a.accountId,
    }) as Portfolio;
    expect(pf.positions).toHaveLength(1);
    expect(pf.invested).toBeLessThan(pf.equity * 0.5);
    expect(lab.trading.account("main").cash).toBe(100000);
    lab.execute("pause_agent", { agentId: a.id });
    const count = lab.trading.state.executions.length;
    lab.advance(20);
    expect(lab.trading.state.executions).toHaveLength(count);
    lab.execute("resume_agent", { agentId: a.id });
    lab.execute("stop_agent", { agentId: a.id });
    expect(lab.trading.position(a.accountId, "BTC/USD")).toBeUndefined();
    expect(() => lab.execute("resume_agent", { agentId: a.id })).toThrow(
      "encerrado",
    );
  });
  it("MCP só controla contas e agentes da própria origem", () => {
    lab.execute("get_account_balance", {}, "mcp");
    expect(() =>
      lab.execute("get_portfolio", { accountId: "main" }, "mcp"),
    ).toThrow("principal");
    const a = lab.execute("create_agent", {
      name: "Local",
      assets: ["BTC/USD"],
      capital: 1000,
      maxExposure: 0.5,
      strategy: "external",
    }) as Agent;
    expect(() =>
      lab.execute("pause_agent", { agentId: a.id }, "mcp"),
    ).toThrow();
    expect(() =>
      lab.execute(
        "admin_intervene",
        { confirmed: true, action: "price", symbol: "BTC/USD", value: 1 },
        "mcp",
      ),
    ).toThrow("administrativa");
    expect(() =>
      lab.execute(
        "place_market_order",
        { requestId: "bad", symbol: "BTC/USD", side: "buy", quantity: -1 },
        "mcp",
      ),
    ).toThrow();
    lab.execute(
      "place_market_order",
      { requestId: "mcp", symbol: "BTC/USD", side: "buy", quantity: 0.01 },
      "mcp",
    );
    expect(lab.trading.position("external", "BTC/USD")).toBeDefined();
    expect(lab.trading.account("main").cash).toBe(100000);
  });
  it("intervenções exigem confirmação, são auditadas e reset arquiva candles", () => {
    expect(() =>
      lab.execute("admin_intervene", { action: "balance", value: 1 }),
    ).toThrow();
    lab.execute("admin_intervene", {
      confirmed: true,
      action: "balance",
      value: 150000,
    });
    expect(lab.view().portfolio.returnPercent).toBe(0);
    const old = lab.state.sessionId;
    lab.execute("admin_intervene", {
      confirmed: true,
      action: "seed",
      value: 77,
    });
    expect(lab.state.sessionId).not.toBe(old);
    expect(lab.market.seed).toBe(77);
    expect(db.candles(old, "BTC/USD")).toHaveLength(3600);
    expect(
      lab.state.audit.some((a) => a.action === "experiment_archived"),
    ).toBe(true);
  });
  it("backtest fica isolado e reproduz métricas usando candles persistidos", () => {
    const before = structuredClone(lab.trading.state),
      config = {
        symbol: "BTC/USD",
        start: 1735689601,
        end: 1735693200,
        capital: 10000,
        feeBps: 10,
        slippageBps: 2,
        strategy: "buy_hold",
      };
    const a = lab.execute("run_backtest", config) as Backtest,
      b = lab.execute("run_backtest", config) as Backtest;
    expect(a.finalEquity).toEqual(b.finalEquity);
    expect(a.executions.length).toBe(2);
    expect(a.metrics.totalTrades).toBe(1);
    expect(lab.trading.state).toEqual(before);
    expect(lab.execute("get_backtest_results", {})).toHaveLength(2);
  });
  it("falha ao salvar desfaz operação financeira em memória e preserva estado anterior", () => {
    const before = lab.snapshot(),
      real = db.saveState;
    db.saveState = () => {
      throw Error("Disco indisponível");
    };
    expect(() =>
      lab.execute("place_market_order", {
        requestId: "failure",
        symbol: "BTC/USD",
        side: "buy",
        quantity: 0.1,
      }),
    ).toThrow("Disco");
    db.saveState = real;
    expect(lab.snapshot()).toEqual(before);
    expect(db.loadState()).toEqual(before);
  });
});
it("transação SQLite desfaz inclusive o checkpoint ao falhar uma constraint de saldo", () => {
  const before = lab.snapshot(),
    bytes = readFileSync(db.path),
    invalid = structuredClone(before);
  invalid.trading.accounts[0].cash = -1;
  expect(() => db.saveState(invalid)).toThrow();
  expect(db.loadState()).toEqual(before);
  expect(readFileSync(db.path).equals(bytes)).toBe(true);
});
it("ordem com saldo insuficiente registra rejeição persistida sem alterar patrimônio", () => {
  const before = lab.trading.account("main").cash;
  expect(() =>
    lab.execute("place_market_order", {
      requestId: "over-budget",
      symbol: "BTC/USD",
      side: "buy",
      quantity: 1000000,
    }),
  ).toThrow("Saldo");
  expect(lab.trading.state.orders.at(-1)?.status).toBe("rejected");
  expect(db.loadState()?.trading.orders.at(-1)?.status).toBe("rejected");
  expect(lab.trading.account("main").cash).toBe(before);
});
describe("determinismo ampliado", () => {
  it("snapshot conserva estado do PRNG, eventos e regimes", () => {
    const a = new MarketEngine(983),
      events: string[] = [];
    a.onEvent((e) => events.push(e.kind));
    for (let i = 0; i < 5000; i++) a.step();
    const b = MarketEngine.restore(a.snapshot());
    for (let i = 0; i < 250; i++) {
      a.step();
      b.step();
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(events).toContain("regime");
    expect(events.some((e) => e !== "regime")).toBe(true);
  });
  it("a velocidade afeta apenas quantos ticks cabem no tempo de execução", () => {
    const a = new MarketEngine(42),
      b = new MarketEngine(42),
      c1 = new SimulationClock(),
      c50 = new SimulationClock();
    c50.speed = 50;
    c1.advance(50000, () => a.step());
    c50.advance(1000, () => b.step());
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
