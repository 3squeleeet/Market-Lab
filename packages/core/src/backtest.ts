import type {
  Backtest,
  BacktestConfig,
  Candle,
  Quote,
  EquityPoint,
} from "../../shared/src/index.js";
import { TradingEngine } from "../../trading-engine/src/index.js";
import { signal } from "../../agent-manager/src/index.js";
import { performance } from "./analytics.js";
export function runBacktest(
  id: string,
  config: BacktestConfig,
  candles: Candle[],
  createdAt: number,
): Backtest {
  const data = candles.filter(
    (c) => c.time >= config.start && c.time <= config.end,
  );
  if (data.length < 32)
    throw Error("Selecione um período com pelo menos 32 candles");
  const engine = new TradingEngine();
  engine.state.accounts = [];
  engine.addAccount("backtest", "Backtest", config.capital);
  engine.state.config = {
    feeBps: config.feeBps,
    slippageBps: config.slippageBps,
    spreadBps: 0,
    limitPriceImprovement: true,
  };
  const equity: EquityPoint[] = [];
  let quotes: Quote[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    quotes = [
      {
        symbol: config.symbol,
        price: c.close,
        initial: data[0].open,
        bid: c.close,
        ask: c.close,
        volume: c.volume,
        candles: data.slice(Math.max(0, i - 40), i + 1),
      },
    ];
    // Decisions use only closed candles preceding the current fill, eliminating look-ahead.
    const holding = !!engine.position("backtest", config.symbol);
    const decision = signal(
      config.strategy,
      data.slice(Math.max(0, i - 40), i),
      holding,
    );
    if (decision === "buy") {
      const quantity =
        (engine.account("backtest").cash * 0.95) /
        (c.open *
          (1 + config.slippageBps / 10000) *
          (1 + config.feeBps / 10000));
      const fillQuote = { ...quotes[0], bid: c.open, ask: c.open };
      engine.submit(
        "backtest",
        {
          requestId: `bt-${i}`,
          symbol: config.symbol,
          side: "buy",
          type: "market",
          quantity,
        },
        [fillQuote],
        c.time,
      );
    } else if (decision === "sell")
      engine.close(
        "backtest",
        config.symbol,
        [{ ...quotes[0], bid: c.open, ask: c.open }],
        c.time,
      );
    equity.push({
      accountId: "backtest",
      time: c.time,
      equity: engine.portfolio("backtest", quotes).equity,
      realized: engine.account("backtest").realized,
    });
  }
  if (engine.position("backtest", config.symbol)) {
    engine.close(
      "backtest",
      config.symbol,
      quotes,
      data.at(-1)!.time,
      "backtest_end",
    );
    equity[equity.length - 1] = {
      accountId: "backtest",
      time: data.at(-1)!.time,
      equity: engine.portfolio("backtest", quotes).equity,
      realized: engine.account("backtest").realized,
    };
  }
  return {
    id,
    createdAt,
    config,
    metrics: performance(engine.state, quotes, equity, "backtest"),
    equity,
    executions: engine.state.executions,
    finalEquity: engine.portfolio("backtest", quotes).equity,
  };
}
