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
  it("MCP opera o patrimônio principal e preserva isolamento dos agentes locais", () => {
    lab.execute("get_account_balance", {}, "mcp");
    expect(
      (lab.execute("get_portfolio", {}, "mcp") as Portfolio).account.id,
    ).toBe("main");
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
    expect(lab.trading.position("main", "BTC/USD")).toBeDefined();
    expect(lab.trading.account("main").cash).toBeLessThan(100000);
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

it("avanços maiores que o buffer do gráfico não descartam candles do histórico persistido", () => {
  lab.advance(7300);
  const history = db.candles(
    lab.state.sessionId,
    "BTC/USD",
    0,
    Number.MAX_SAFE_INTEGER,
    20000,
  );
  expect(lab.market.quotes[0].candles).toHaveLength(7200);
  expect(history).toHaveLength(10900);
  expect(history.every((c, i) => c.time === 1735689601 + i)).toBe(true);
});

it("notícia aplica impacto e MCP só recebe texto público, sem configuração privada", () => {
  const before = lab.market.quotes[0].price;
  const text = "Instituições anunciam adoção de pagamentos digitais.";
  lab.execute("publish_news", { text, symbol: "BTC/USD", percent: 12 });
  expect(lab.market.quotes[0].price).toBeCloseTo(before * 1.12);
  const publicNews = lab.execute("get_market_news", {}, "mcp") as {
    text: string;
  }[];
  expect(publicNews[0].text).toBe(text);
  expect(Object.keys(publicNews[0]).sort()).toEqual(["text"]);
  expect(() =>
    lab.execute(
      "publish_news",
      { text: "x", symbol: "BTC/USD", percent: -10 },
      "mcp",
    ),
  ).toThrow("administrativa");
  expect(db.loadState()?.news?.[0].text).toBe(text);
  expect(lab.market.quotes[0].candles.at(-1)?.close).toBeCloseTo(before * 1.12);
});
it("delta de tela é pequeno e checkpoint compacto restaura todo o histórico", () => {
  const full = lab.view("BTC/USD"),
    bytes = JSON.stringify(full).length;
  lab.advanceRealtime(1);
  const delta = lab.view("BTC/USD", {
    sessionId: lab.state.sessionId,
    since: full.market.time,
    page: "Visão geral",
  });
  expect(JSON.stringify(delta).length).toBeLessThan(bytes / 4);
  lab.commit();
  expect(db.loadState()?.market.quotes[0].candles).toHaveLength(3601);
});

it("notícia aguarda o relógio simulado e aplica percentual gradual após reiniciar", async () => {
  lab.state.simulation.frozen = true;
  const before = lab.market.quotes[0].price;
  lab.execute("publish_news", {
    text: "Publicação com efeito futuro.",
    symbol: "BTC/USD",
    percent: -20,
    delaySeconds: 2,
    durationSeconds: 3,
  });
  lab.advance(2);
  expect(lab.market.quotes[0].price).toBe(before);
  lab.advance(1);
  expect(lab.market.quotes[0].price).toBeCloseTo(before * Math.pow(0.8, 1 / 3));
  db.close();
  db = await openDatabase(join(dir, "lab.sqlite"));
  lab = new LabService(db);
  lab.advance(2);
  expect(lab.market.quotes[0].price).toBeCloseTo(before * 0.8);
  expect(lab.view().newsSchedule[0].status).toBe("completed");
  expect(lab.execute("get_market_news", {}, "mcp")).toEqual([
    { text: "Publicação com efeito futuro." },
  ]);
});
