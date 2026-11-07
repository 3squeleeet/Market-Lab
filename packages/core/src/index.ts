import { randomUUID } from "node:crypto";
import type {
  Agent,
  LabState,
  LabView,
  MCPStatus,
  Symbol,
  BacktestConfig,
  Regime,
  EventKind,
  Quote,
  MarketState,
  Candle,
} from "../../shared/src/index.js";
import { SYMBOLS } from "../../shared/src/index.js";
import {
  schemas,
  MCP_TOOLS,
  READ_ONLY,
  type ToolName,
} from "../../shared/src/commands.js";
import { MarketEngine } from "../../market-engine/src/index.js";
import {
  TradingEngine,
  TradingError,
  type OrderInput,
} from "../../trading-engine/src/index.js";
import { signal, recordDecision } from "../../agent-manager/src/index.js";
import { performance } from "./analytics.js";
import { runBacktest } from "./backtest.js";
import type { Repository } from "../../database/src/index.js";
import { assertJSON } from "../../shared/src/validation.js";
export const VERSION = "0.2.0";
export const SIMULATION_ONLY = true;
type Actor = "ui" | "mcp";
type Params = {
  accountId?: string;
  symbol?: Symbol;
  limit?: number;
  start?: number;
  end?: number;
  depth?: number;
  requestId?: string;
  side?: "buy" | "sell";
  quantity?: number;
  price?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  orderId?: string;
  percent?: number;
  agentId?: string;
  name?: string;
  description?: string;
  assets?: Symbol[];
  capital?: number;
  maxExposure?: number;
  strategy?: Agent["strategy"];
  speed?: number;
  experimentId?: string;
  volatility?: number;
  feeBps?: number;
  slippageBps?: number;
  spreadBps?: number;
  tickMs?: number;
  chartInterval?: string;
  limitPriceImprovement?: boolean;
  confirmed?: true;
  action?: string;
  value?: number;
  event?: EventKind;
};
export class LabService {
  market: MarketEngine;
  trading: TradingEngine;
  state: LabState;
  mcpStatus: MCPStatus | null = null;
  private pendingCandles: { symbol: Symbol; candle: Candle }[] = [];
  constructor(public repository: Repository) {
    const saved = repository.loadState();
    if (saved) {
      this.state = saved;
      this.market = MarketEngine.restore(saved.market);
      this.trading = new TradingEngine(saved.trading);
      this.assertState();
    } else {
      const legacy = repository.load();
      this.market = new MarketEngine(
        legacy?.seed ?? 42,
        legacy?.volatility ?? 1,
      );
      const ticks = Math.min(legacy?.ticks ?? 3600, 1000000);
      for (let i = 0; i < ticks; i++) this.market.step();
      this.trading = new TradingEngine();
      this.state = {
        version: 2,
        sessionId: randomUUID(),
        market: this.market.snapshot(),
        trading: this.trading.state,
        agents: [],
        equity: [],
        backtests: [],
        audit: [],
        simulation: {
          running: legacy?.running ?? true,
          speed: legacy?.speed ?? 1,
          tickMs: 1000,
          frozen: false,
          theme: "dark",
          chartInterval: 15,
        },
      };
      this.sample();
      this.commit();
    }
  }
  private assertState() {
    if (
      !Number.isFinite(this.market.time) ||
      !this.market.quotes.every(
        (q) => Number.isFinite(q.price) && q.price > 0,
      ) ||
      this.trading.state.accounts.some(
        (a) => !Number.isFinite(a.cash) || a.cash < 0,
      ) ||
      this.trading.state.positions.some(
        (p) => !Number.isFinite(p.quantity) || p.quantity <= 0,
      )
    )
      throw Error("Estado persistido inválido");
  }
  snapshot(): LabState {
    return structuredClone({
      ...this.state,
      market: this.market.snapshot(),
      trading: this.trading.state,
    });
  }
  restore(s: LabState) {
    this.pendingCandles = [];
    this.state = s;
    this.market = MarketEngine.restore(s.market);
    this.trading = new TradingEngine(s.trading);
  }
  commit() {
    this.assertState();
    this.state.market = this.market.snapshot();
    this.state.trading = this.trading.state;
    assertJSON(this.state);
    this.repository.saveState(this.state, this.pendingCandles);
    this.pendingCandles = [];
  }
  private audit(action: string, details: unknown, actor: string) {
    this.state.audit.push({
      id: randomUUID(),
      time: this.market.time,
      actor,
      action,
      details,
    });
  }
  private mark() {
    for (const a of this.trading.state.accounts) {
      const equity =
        this.trading.portfolio(a.id, this.market.quotes).equity - a.deposits;
      a.peakEquity = Math.max(a.peakEquity ?? a.initialCapital, equity);
      a.maxDrawdown = Math.max(
        a.maxDrawdown ?? 0,
        a.peakEquity > 0 ? ((a.peakEquity - equity) / a.peakEquity) * 100 : 0,
      );
    }
  }
  private sample() {
    this.mark();
    for (const a of this.trading.state.accounts) {
      const p = {
        accountId: a.id,
        time: this.market.time,
        equity: this.trading.portfolio(a.id, this.market.quotes).equity,
        realized: a.realized,
        contributions: a.deposits,
      };
      const prev = this.state.equity.findLastIndex(
        (x) => x.accountId === a.id && x.time === p.time,
      );
      if (prev >= 0) this.state.equity[prev] = p;
      else this.state.equity.push(p);
    }
  }
  private exposure(accountId: string) {
    return (
      this.state.agents.find((a) => a.accountId === accountId)?.maxExposure ?? 1
    );
  }
  private external() {
    let a = this.state.agents.find((a) => a.id === "external");
    if (!a) {
      const before = this.snapshot();
      try {
        this.trading.addAccount("external", "Claude / MCP", 100000);
        a = {
          id: "external",
          accountId: "external",
          owner: "mcp",
          name: "Claude / MCP",
          description:
            "Conta isolada para comandos externos; conexão exibida no painel MCP.",
          assets: [...SYMBOLS],
          capital: 100000,
          maxExposure: 1,
          strategy: "external",
          status: "running",
          lastDecision: 0,
          history: [],
        };
        this.state.agents.push(a);
        this.sample();
        this.commit();
      } catch (e) {
        this.restore(before);
        throw e;
      }
    }
    return a;
  }
  private account(actor: Actor, id?: string) {
    const account = id ?? (actor === "ui" ? "main" : this.external().accountId);
    this.trading.account(account);
    if (
      actor === "mcp" &&
      !this.state.agents.some(
        (a) => a.accountId === account && a.owner === "mcp",
      )
    )
      throw new TradingError(
        "FORBIDDEN",
        "MCP não pode acessar a conta principal nem agentes locais",
      );
    return account;
  }
  private agent(id: string, actor: Actor) {
    const a = this.state.agents.find((a) => a.id === id);
    if (!a || (actor === "mcp" && a.owner !== "mcp"))
      throw new TradingError(
        "FORBIDDEN",
        "Agente indisponível para este controlador",
      );
    return a;
  }
  private assertAgentOrder(accountId: string, symbol: Symbol) {
    const a = this.state.agents.find((a) => a.accountId === accountId);
    if (a && (a.status !== "running" || !a.assets.includes(symbol)))
      throw new TradingError(
        "AGENT_RULE",
        "Agente pausado/encerrado ou ativo não autorizado",
      );
  }
  private decide() {
    for (const a of this.state.agents) {
      if (
        a.status !== "running" ||
        a.strategy === "external" ||
        this.market.time - a.lastDecision < 15
      )
        continue;
      a.lastDecision = this.market.time;
      for (const symbol of a.assets) {
        const q = this.market.quotes.find((q) => q.symbol === symbol)!,
          p = this.trading.position(a.accountId, symbol);
        const decision = signal(a.strategy, q.candles, !!p);
        try {
          if (decision === "buy") {
            const pf = this.trading.portfolio(a.accountId, this.market.quotes),
              budget =
                Math.min(
                  pf.available * 0.9,
                  Math.max(0, pf.equity * a.maxExposure - pf.invested) * 0.9,
                ) / a.assets.length;
            if (budget < 1) {
              recordDecision(
                a,
                this.market.time,
                "hold",
                "Saldo ou exposição disponível insuficiente",
              );
              continue;
            }
            const quantity =
              budget /
              (q.ask *
                (1 + this.trading.state.config.slippageBps / 10000) *
                (1 + this.trading.state.config.feeBps / 10000));
            const o = this.trading.submit(
              a.accountId,
              {
                requestId: `${a.id}-${symbol}-${this.market.time}`,
                symbol,
                side: "buy",
                type: "market",
                quantity,
              },
              this.market.quotes,
              this.market.time,
              a.maxExposure,
            );
            recordDecision(
              a,
              this.market.time,
              "buy",
              `${a.strategy}: sinal em ${symbol}`,
              o.id,
            );
          } else if (decision === "sell") {
            const o = this.trading.close(
              a.accountId,
              symbol,
              this.market.quotes,
              this.market.time,
              "agent",
            );
            recordDecision(
              a,
              this.market.time,
              "sell",
              `${a.strategy}: sinal em ${symbol}`,
              o.id,
            );
          } else
            recordDecision(
              a,
              this.market.time,
              "hold",
              `${symbol}: sem novo sinal (${a.strategy})`,
            );
        } catch (e) {
          recordDecision(
            a,
            this.market.time,
            "rejected",
            e instanceof Error ? e.message : "Falha ao executar",
          );
        }
      }
    }
  }
  advance(ticks: number, persist = true) {
    const before = persist ? this.snapshot() : null;
    try {
      for (let i = 0; i < ticks; i++) {
        if (this.state.simulation.frozen) {
          this.market.ticks++;
          this.market.time++;
          for (const q of this.market.quotes) {
            q.candles.push({
              time: this.market.time,
              open: q.price,
              high: q.price,
              low: q.price,
              close: q.price,
              volume: 0,
            });
            if (q.candles.length > 7200) q.candles.shift();
          }
        } else this.market.step();
        for (const q of this.market.quotes) {
          const candle = q.candles.at(-1);
          if (candle) this.pendingCandles.push({ symbol: q.symbol, candle });
        }
        this.trading.onTick(this.market.quotes, this.market.time, (id) =>
          this.exposure(id),
        );
        this.decide();
        this.mark();
        if (this.market.time % 10 === 0) this.sample();
      }
      if (persist) {
        this.sample();
        this.commit();
      }
    } catch (e) {
      if (before) this.restore(before);
      throw e;
    }
  }
  view(symbol: Symbol = "BTC/USD"): LabView {
    const t = this.trading.state,
      portfolio = this.trading.portfolio("main", this.market.quotes);
    return structuredClone({
      version: VERSION,
      sessionId: this.state.sessionId,
      market: {
        time: this.market.time,
        ticks: this.market.ticks,
        seed: this.market.seed,
        volatility: this.market.volatility,
        regime: this.market.regime,
        factor: this.market.factor,
        quotes: this.market.quotes.map((q) => ({
          ...q,
          candles: q.candles.slice(q.symbol === symbol ? -7200 : -120),
        })),
        events: this.market.events.slice(-200),
      },
      simulation: this.state.simulation,
      config: t.config,
      portfolio,
      orders: t.orders.slice(-1000),
      executions: t.executions.slice(-1000),
      closed: t.closed.slice(-1000),
      agents: this.state.agents.map((a) => ({
        ...a,
        history: a.history.slice(-100),
        portfolio: this.trading.portfolio(a.accountId, this.market.quotes),
        metrics: performance(
          t,
          this.market.quotes,
          this.state.equity,
          a.accountId,
        ),
      })),
      metrics: performance(t, this.market.quotes, this.state.equity, "main"),
      equity: this.state.equity
        .filter((x) => x.accountId === "main")
        .slice(-2000),
      backtests: this.state.backtests,
      audit: this.state.audit.slice(-250),
      mcp: this.mcpStatus,
      database: {
        path: this.repository.path,
        schemaVersion: this.repository.schemaVersion,
        lastSaved: this.repository.lastSaved,
      },
    });
  }
  execute(name: string, args: unknown = {}, actor: Actor = "ui"): unknown {
    if (!Object.hasOwn(schemas, name))
      throw new TradingError("TOOL", "Ferramenta desconhecida");
    const tool = name as ToolName;
    if (actor === "mcp" && !MCP_TOOLS.includes(tool))
      throw new TradingError(
        "FORBIDDEN",
        "Ferramenta administrativa não disponível por MCP",
      );
    const p = schemas[tool].parse(args) as Params;
    if (actor === "mcp") this.external();
    const before = READ_ONLY.has(tool) ? null : this.snapshot();
    try {
      const result = this.dispatch(tool, p, actor);
      assertJSON(result);
      if (before) {
        this.audit(tool, p, actor);
        this.sample();
        this.commit();
      }
      return structuredClone(result);
    } catch (e) {
      const rejected =
        before && e instanceof TradingError
          ? this.trading.state.orders.find(
              (o) =>
                o.status === "rejected" &&
                !before.trading.orders.some((old) => old.id === o.id),
            )
          : undefined;
      const sequence = this.trading.state.sequence;
      if (before) this.restore(before);
      if (rejected && before) {
        try {
          this.trading.state.sequence = sequence;
          this.trading.state.orders.push(structuredClone(rejected));
          this.audit(
            "order_rejected",
            { orderId: rejected.id, reason: rejected.reason },
            actor,
          );
          this.commit();
        } catch (saveError) {
          this.restore(before);
          throw saveError;
        }
      }
      throw e;
    }
  }
  private dispatch(name: ToolName, p: Params, actor: Actor): unknown {
    const quotes = this.market.quotes,
      time = this.market.time,
      t = this.trading.state;
    const account = () => this.account(actor, p.accountId);
    const pf = () => this.trading.portfolio(account(), quotes);
    const historyLimit = p.limit ?? 250;
    switch (name) {
      case "get_market_overview":
        return quotes.map(({ candles, ...q }) => q);
      case "get_asset_price":
        return quotes
          .map(({ candles, ...q }) => q)
          .find((q) => q.symbol === p.symbol)!;
      case "get_market_candles": {
        const saved = this.repository.candles(
          this.state.sessionId,
          p.symbol!,
          p.start,
          p.end,
          p.limit,
        );
        const memory = quotes
          .find((q) => q.symbol === p.symbol)!
          .candles.filter(
            (c) =>
              c.time > (saved.at(-1)?.time ?? 0) &&
              c.time >= (p.start ?? 0) &&
              c.time <= (p.end ?? Infinity),
          );
        return [...saved, ...memory].slice(-(p.limit ?? 7200));
      }
      case "get_order_book": {
        const q = quotes.find((q) => q.symbol === p.symbol)!;
        return {
          symbol: q.symbol,
          synthetic: true,
          indicative: true,
          description:
            "Profundidade indicativa sintética; não é um livro de exchange. Ordens executam pelo bid/ask, sem preenchimentos parciais.",
          time,
          bids: Array.from({ length: p.depth ?? 10 }, (_, i) => ({
            price: q.bid * (1 - i * 0.0001),
            quantity: Math.max(0.00001, q.volume / (100 * (i + 1))),
          })),
          asks: Array.from({ length: p.depth ?? 10 }, (_, i) => ({
            price: q.ask * (1 + i * 0.0001),
            quantity: Math.max(0.00001, q.volume / (100 * (i + 1))),
          })),
        };
      }
      case "get_market_regime":
        return {
          regime: this.market.regime,
          name: ["lateral", "alta", "estresse"][this.market.regime],
        };
      case "get_market_events":
        return this.market.events.slice(-(p.limit ?? 100));
      case "get_account_balance": {
        const portfolio = pf();
        return {
          accountId: portfolio.account.id,
          cash: portfolio.account.cash,
          available: portfolio.available,
          reserved: portfolio.reserved,
          currency: "USD",
          simulated: true,
        };
      }
      case "get_portfolio":
        return pf();
      case "get_open_positions":
        return pf().positions;
      case "get_trade_history": {
        const id = account();
        return t.executions
          .filter((x) => x.accountId === id)
          .slice(-historyLimit);
      }
      case "get_order_history": {
        const id = account();
        return t.orders.filter((x) => x.accountId === id).slice(-historyLimit);
      }
      case "place_market_order":
      case "place_limit_order": {
        const id = account();
        this.assertAgentOrder(id, p.symbol!);
        const input: OrderInput = {
          requestId: p.requestId!,
          symbol: p.symbol!,
          side: p.side!,
          type: name === "place_market_order" ? "market" : "limit",
          quantity: p.quantity!,
          ...(p.price != null ? { price: p.price } : {}),
          ...(p.stopLoss ? { stopLoss: p.stopLoss } : {}),
          ...(p.takeProfit ? { takeProfit: p.takeProfit } : {}),
        };
        const o = this.trading.submit(
          id,
          input,
          quotes,
          time,
          this.exposure(id),
        );
        const a = this.state.agents.find((a) => a.accountId === id);
        if (a)
          recordDecision(
            a,
            time,
            o.side,
            `Ordem solicitada por ${actor}`,
            o.id,
          );
        return o;
      }
      case "cancel_order":
        return this.trading.cancel(account(), p.orderId!, time);
      case "close_position":
        return this.trading.close(account(), p.symbol!, quotes, time);
      case "set_stop_loss":
        return this.trading.setRisk(
          account(),
          p.symbol!,
          "stopLoss",
          p.price ?? null,
          p.percent,
          quotes,
        );
      case "set_take_profit":
        return this.trading.setRisk(
          account(),
          p.symbol!,
          "takeProfit",
          p.price ?? null,
          p.percent,
          quotes,
        );
      case "list_agents":
        if (actor === "mcp") this.external();
        return this.state.agents
          .filter((a) => actor === "ui" || a.owner === "mcp")
          .map((a) => ({
            ...a,
            history: a.history.slice(-20),
            portfolio: this.trading.portfolio(a.accountId, quotes),
          }));
      case "create_agent": {
        const id = randomUUID(),
          a: Agent = {
            id,
            accountId: `agent-${id}`,
            owner: actor,
            name: p.name!,
            description: p.description!,
            assets: p.assets!,
            capital: p.capital!,
            maxExposure: p.maxExposure!,
            strategy: p.strategy!,
            status: "running",
            lastDecision: time,
            history: [],
          };
        this.trading.addAccount(a.accountId, a.name, a.capital);
        this.state.agents.push(a);
        recordDecision(a, time, "created", "Conta isolada criada");
        return a;
      }
      case "update_agent": {
        const a = this.agent(p.agentId!, actor);
        if (a.status === "stopped")
          throw Error("Agente encerrado não pode ser alterado");
        const removed = a.assets.filter((s) => !p.assets!.includes(s));
        if (
          t.positions.some(
            (x) => x.accountId === a.accountId && removed.includes(x.symbol),
          ) ||
          t.orders.some(
            (o) => o.accountId === a.accountId && o.status === "pending",
          )
        )
          throw Error(
            "Feche posições de ativos removidos e cancele ordens antes de alterar o agente",
          );
        const pf = this.trading.portfolio(a.accountId, quotes);
        if (pf.invested > pf.equity * p.maxExposure!)
          throw Error(
            "Reduza posições antes de diminuir o limite de exposição",
          );
        Object.assign(a, {
          name: p.name!,
          description: p.description!,
          assets: p.assets!,
          maxExposure: p.maxExposure!,
          strategy: p.strategy!,
        });
        this.trading.account(a.accountId).name = a.name;
        recordDecision(
          a,
          time,
          "updated",
          "Configuração alterada pela interface local",
        );
        return a;
      }
      case "pause_agent":
      case "resume_agent":
      case "stop_agent": {
        const a = this.agent(p.agentId!, actor);
        if (a.status === "stopped")
          throw Error("Agente encerrado não pode ser retomado");
        a.status =
          name === "pause_agent"
            ? "paused"
            : name === "resume_agent"
              ? "running"
              : "stopped";
        for (const o of t.orders.filter(
          (o) => o.accountId === a.accountId && o.status === "pending",
        ))
          this.trading.cancel(
            a.accountId,
            o.id,
            time,
            "Agente pausado/encerrado",
          );
        if (name === "stop_agent")
          for (const pos of [
            ...t.positions.filter((x) => x.accountId === a.accountId),
          ])
            this.trading.close(
              a.accountId,
              pos.symbol,
              quotes,
              time,
              "agent_stopped",
            );
        recordDecision(a, time, a.status, "Controle manual");
        return a;
      }
      case "get_agent_performance": {
        const a = this.agent(p.agentId!, actor);
        return {
          agent: a.id,
          portfolio: this.trading.portfolio(a.accountId, quotes),
          metrics: performance(t, quotes, this.state.equity, a.accountId),
        };
      }
      case "get_agent_history":
        return this.agent(p.agentId!, actor).history.slice(-historyLimit);
      case "get_simulation_status":
        return {
          sessionId: this.state.sessionId,
          time,
          ticks: this.market.ticks,
          ...this.state.simulation,
          simulated: true,
        };
      case "pause_simulation":
        this.state.simulation.running = false;
        return this.state.simulation;
      case "resume_simulation":
        this.state.simulation.running = true;
        return this.state.simulation;
      case "set_simulation_speed":
        this.state.simulation.speed = p.speed!;
        return this.state.simulation;
      case "get_simulation_configuration":
        return {
          ...this.state.simulation,
          seed: this.market.seed,
          volatility: this.market.volatility,
          execution: t.config,
        };
      case "get_performance_metrics":
        return performance(t, quotes, this.state.equity, account());
      case "get_asset_performance":
        return performance(
          t,
          quotes,
          this.state.equity,
          account(),
        ).byAsset.find((x) => x.symbol === p.symbol)!;
      case "get_equity_curve": {
        const id = account();
        return this.state.equity
          .filter((x) => x.accountId === id)
          .slice(-historyLimit);
      }
      case "run_backtest": {
        const rows = this.repository.candles(
          this.state.sessionId,
          p.symbol!,
          p.start,
          p.end,
          200000,
        );
        if (rows.length === 200000)
          throw Error(
            "Período excede o limite de 200 mil candles; selecione um intervalo menor",
          );
        const result = runBacktest(
          randomUUID(),
          p as BacktestConfig,
          rows,
          time,
        );
        this.state.backtests.push(result);
        return result;
      }
      case "get_backtest_results":
        return p.experimentId
          ? (this.state.backtests.find((b) => b.id === p.experimentId) ?? null)
          : this.state.backtests.map((b) => ({
              id: b.id,
              createdAt: b.createdAt,
              config: b.config,
              metrics: b.metrics,
              finalEquity: b.finalEquity,
            }));
      case "update_configuration": {
        if (
          p.feeBps !== undefined &&
          t.orders.some((o) => o.status === "pending")
        )
          throw Error("Cancele as ordens pendentes antes de alterar taxas");
        for (const key of [
          "feeBps",
          "slippageBps",
          "spreadBps",
          "limitPriceImprovement",
        ] as const)
          if (p[key] !== undefined) Object.assign(t.config, { [key]: p[key] });
        if (p.volatility !== undefined) this.market.volatility = p.volatility;
        if (p.spreadBps !== undefined) {
          this.market.spreadBps = p.spreadBps;
          for (const q of quotes) this.market.setPrice(q.symbol, q.price);
        }
        if (p.tickMs !== undefined) this.state.simulation.tickMs = p.tickMs;
        if (p.chartInterval !== undefined)
          this.state.simulation.chartInterval = Number(p.chartInterval);
        return this.dispatch("get_simulation_configuration", {}, actor);
      }
      case "get_admin_log":
        return this.state.audit;
      case "get_mcp_status":
        return this.mcpStatus;
      case "admin_intervene":
        return this.intervene(p);
    }
  }
  private intervene(p: Params) {
    const value = p.value;
    if (
      [
        "balance",
        "price",
        "volatility",
        "regime",
        "advance",
        "seed",
        "reset",
      ].includes(p.action!) &&
      !Number.isFinite(value)
    )
      throw Error("Informe um valor numérico válido");
    switch (p.action) {
      case "balance": {
        const id = p.accountId ?? "main",
          a = this.trading.account(id);
        if (
          value! < this.trading.reservedCash(id) ||
          value! < 0 ||
          value! > 1e12
        )
          throw Error("Saldo inválido ou abaixo da reserva");
        a.deposits += value! - a.cash;
        a.cash = value!;
        break;
      }
      case "price":
        if (!p.symbol || value! <= 0 || value! > 1e12)
          throw Error("Ativo e preço positivo obrigatórios");
        this.market.setPrice(p.symbol, value!);
        for (const q of this.market.quotes) {
          const candle = q.candles.at(-1);
          if (candle) this.pendingCandles.push({ symbol: q.symbol, candle });
        }
        this.trading.onTick(this.market.quotes, this.market.time, (id) =>
          this.exposure(id),
        );
        break;
      case "volatility":
        if (value! < 0.1 || value! > 5)
          throw Error("Volatilidade deve estar entre 0,1 e 5");
        this.market.volatility = value!;
        break;
      case "regime":
        if (![0, 1, 2].includes(value!)) throw Error("Regime inválido");
        this.market.forceRegime(value as Regime);
        break;
      case "freeze":
        this.state.simulation.frozen = true;
        break;
      case "resume":
        this.state.simulation.frozen = false;
        this.state.simulation.running = true;
        break;
      case "event":
        if (!p.event) throw Error("Escolha o evento");
        this.market.emit(p.event);
        break;
      case "advance":
        if (!Number.isInteger(value) || value! < 1 || value! > 10000)
          throw Error("Avance de 1 a 10.000 segundos por comando");
        this.advance(value!, false);
        break;
      case "reset":
      case "seed": {
        if (!Number.isSafeInteger(value) || value! < 0 || value! > 4294967295)
          throw Error("Seed deve ser um inteiro de 0 a 4294967295");
        const old = this.state.sessionId,
          audit = this.state.audit;
        this.market = new MarketEngine(
          value!,
          this.market.volatility,
          this.trading.state.config.spreadBps,
        );
        for (let i = 0; i < 3600; i++) this.market.step();
        const cfg = this.trading.state.config;
        this.trading = new TradingEngine();
        this.trading.state.config = { ...cfg };
        this.state = {
          ...this.state,
          sessionId: randomUUID(),
          agents: [],
          equity: [],
          backtests: [],
          audit,
          simulation: {
            ...this.state.simulation,
            running: false,
            frozen: false,
          },
        };
        this.audit(
          "experiment_archived",
          { sessionId: old, newSessionId: this.state.sessionId },
          "ui",
        );
        break;
      }
      default:
        throw Error("Intervenção inválida");
    }
    return {
      action: p.action,
      time: this.market.time,
      sessionId: this.state.sessionId,
    };
  }
}
