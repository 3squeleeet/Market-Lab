import type {
  TradingState,
  Quote,
  EquityPoint,
  Metrics,
  Symbol,
} from "../../shared/src/index.js";
import { SYMBOLS } from "../../shared/src/index.js";
import { TradingEngine } from "../../trading-engine/src/index.js";
export function performance(
  state: TradingState,
  quotes: Quote[],
  curve: EquityPoint[],
  accountId: string,
): Metrics {
  const t = new TradingEngine();
  // portfolio() only reads state; avoid copying the full execution ledger for each metric.
  t.state = state;
  const pf = t.portfolio(accountId, quotes),
    closed = state.closed.filter((x) => x.accountId === accountId),
    wins = closed.filter((x) => x.pnl > 0),
    losses = closed.filter((x) => x.pnl < 0),
    values = closed.map((x) => x.pnl);
  let peak = pf.account.initialCapital,
    dd = pf.account.maxDrawdown ?? 0;
  for (const p of curve.filter((p) => p.accountId === accountId)) {
    const normalized = p.equity - (p.contributions ?? 0);
    peak = Math.max(peak, normalized);
    if (peak > 0) dd = Math.max(dd, ((peak - normalized) / peak) * 100);
  }
  const executions = state.executions.filter((x) => x.accountId === accountId);
  return {
    totalPnl: pf.equity - pf.account.initialCapital - pf.account.deposits,
    returnPercent: pf.returnPercent,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    lossRate: closed.length ? (losses.length / closed.length) * 100 : 0,
    maxDrawdown: dd,
    averageProfit: wins.length
      ? wins.reduce((s, x) => s + x.pnl, 0) / wins.length
      : 0,
    averageLoss: losses.length
      ? losses.reduce((s, x) => s + x.pnl, 0) / losses.length
      : 0,
    bestTrade: values.length ? Math.max(...values) : 0,
    worstTrade: values.length ? Math.min(...values) : 0,
    totalTrades: closed.length,
    volume: executions.reduce((s, x) => s + x.price * x.quantity, 0),
    byAsset: SYMBOLS.map((symbol: Symbol) => ({
      symbol,
      realized: closed
        .filter((x) => x.symbol === symbol)
        .reduce((s, x) => s + x.pnl, 0),
      unrealized:
        pf.positions.find((p) => p.symbol === symbol)?.unrealized ?? 0,
      volume: executions
        .filter((x) => x.symbol === symbol)
        .reduce((s, x) => s + x.price * x.quantity, 0),
      trades: closed.filter((x) => x.symbol === symbol).length,
    })),
  };
}
