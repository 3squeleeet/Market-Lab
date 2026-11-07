export const SYMBOLS = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
  "XRP/USD",
  "DOGE/USD",
  "ADA/USD",
  "AVAX/USD",
] as const;
export type Symbol = (typeof SYMBOLS)[number];
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
export type Regime = 0 | 1 | 2;
export type EventKind = "volatility" | "crash" | "rally" | "quiet" | "regime";
export interface MarketEvent {
  id: string;
  time: number;
  kind: EventKind;
  description: string;
  duration: number;
}
export interface MarketState {
  seed: number;
  volatility: number;
  spreadBps: number;
  rng: number;
  spare: number | null;
  ticks: number;
  time: number;
  regime: Regime;
  factor: number;
  logVariance: number;
  event: EventKind | null;
  eventUntil: number;
  quotes: Quote[];
  events: MarketEvent[];
}
export interface ExecutionConfig {
  feeBps: number;
  slippageBps: number;
  spreadBps: number;
  limitPriceImprovement: boolean;
}
export interface Account {
  id: string;
  name: string;
  initialCapital: number;
  cash: number;
  realized: number;
  deposits: number;
  peakEquity?: number;
  maxDrawdown?: number;
}
export interface Position {
  id: string;
  accountId: string;
  symbol: Symbol;
  quantity: number;
  averagePrice: number;
  entryFees: number;
  openedAt: number;
  stopLoss: number | null;
  takeProfit: number | null;
}
export interface ClosedPosition {
  id: string;
  positionId: string;
  accountId: string;
  symbol: Symbol;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
  reason: string;
}
export interface Order {
  id: string;
  requestId: string;
  accountId: string;
  symbol: Symbol;
  type: "market" | "limit";
  side: "buy" | "sell";
  quantity: number;
  requestedPrice: number | null;
  executedPrice: number | null;
  status: "pending" | "filled" | "cancelled" | "rejected";
  createdAt: number;
  updatedAt: number;
  fees: number;
  slippage: number;
  reason: string | null;
  stopLoss: number | null;
  takeProfit: number | null;
}
export interface Execution {
  id: string;
  orderId: string;
  accountId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  slippage: number;
  time: number;
}
export interface TradingState {
  accounts: Account[];
  positions: Position[];
  closed: ClosedPosition[];
  orders: Order[];
  executions: Execution[];
  sequence: number;
  config: ExecutionConfig;
}
export interface EquityPoint {
  accountId: string;
  time: number;
  equity: number;
  realized: number;
  contributions?: number;
}
export interface Portfolio {
  account: Account;
  available: number;
  reserved: number;
  equity: number;
  invested: number;
  unrealized: number;
  realized: number;
  returnPercent: number;
  positions: (Position & {
    currentPrice: number;
    value: number;
    unrealized: number;
    exposurePercent: number;
  })[];
}
export interface Metrics {
  totalPnl: number;
  returnPercent: number;
  winRate: number;
  lossRate: number;
  maxDrawdown: number;
  averageProfit: number;
  averageLoss: number;
  bestTrade: number;
  worstTrade: number;
  totalTrades: number;
  volume: number;
  byAsset: {
    symbol: Symbol;
    realized: number;
    unrealized: number;
    volume: number;
    trades: number;
  }[];
}
export type Strategy = "buy_hold" | "sma" | "rsi" | "external";
export interface Decision {
  id: string;
  time: number;
  action: string;
  reason: string;
  orderId?: string;
}
export interface Agent {
  id: string;
  accountId: string;
  owner: "ui" | "mcp";
  name: string;
  description: string;
  assets: Symbol[];
  capital: number;
  maxExposure: number;
  strategy: Strategy;
  status: "running" | "paused" | "stopped";
  lastDecision: number;
  history: Decision[];
}
export interface BacktestConfig {
  symbol: Symbol;
  start: number;
  end: number;
  capital: number;
  feeBps: number;
  slippageBps: number;
  strategy: Exclude<Strategy, "external">;
}
export interface Backtest {
  id: string;
  createdAt: number;
  config: BacktestConfig;
  metrics: Metrics;
  equity: EquityPoint[];
  executions: Execution[];
  finalEquity: number;
}
export interface AuditEntry {
  id: string;
  time: number;
  actor: string;
  action: string;
  details: unknown;
}
export interface SimulationConfig {
  running: boolean;
  speed: number;
  tickMs: number;
  frozen: boolean;
  theme: "dark";
  chartInterval: number;
}
export interface LabState {
  version: 2;
  sessionId: string;
  market: MarketState;
  trading: TradingState;
  agents: Agent[];
  equity: EquityPoint[];
  backtests: Backtest[];
  audit: AuditEntry[];
  simulation: SimulationConfig;
}
export interface MCPStatus {
  enabled: boolean;
  transport: "stdio";
  protocol: string;
  connections: number;
  lastSeen: number | null;
  tools: string[];
  configPath: string;
  configuration: unknown;
  logs: { time: number; message: string }[];
}
export interface LabView {
  version: string;
  sessionId: string;
  market: {
    time: number;
    ticks: number;
    seed: number;
    volatility: number;
    regime: Regime;
    factor: number;
    quotes: Quote[];
    events: MarketEvent[];
  };
  simulation: SimulationConfig;
  config: ExecutionConfig;
  portfolio: Portfolio;
  orders: Order[];
  executions: Execution[];
  closed: ClosedPosition[];
  agents: (Agent & { portfolio: Portfolio; metrics: Metrics })[];
  metrics: Metrics;
  equity: EquityPoint[];
  backtests: Backtest[];
  audit: AuditEntry[];
  mcp: MCPStatus | null;
  database: { path: string; schemaVersion: number; lastSaved: number };
}
export type Reply<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export interface DesktopAPI {
  invoke(name: string, args?: Record<string, unknown>): Promise<Reply>;
  view(symbol?: Symbol): Promise<Reply<LabView>>;
}
export interface SavedSession {
  version: 1;
  seed: number;
  ticks: number;
  speed: number;
  volatility: number;
  running: boolean;
}
