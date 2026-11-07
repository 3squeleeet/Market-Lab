import { z } from "zod";
import { SYMBOLS } from "./index.js";
const symbol = z.enum(SYMBOLS),
  id = z.string().min(1).max(120),
  finite = z.number().finite(),
  positive = finite.positive().max(1e12),
  quantity = positive.min(1e-8),
  accountId = id.optional(),
  strategy = z.enum(["buy_hold", "sma", "rsi", "external"]),
  base = { accountId };
const empty = z.object({}).strict();
const history = z
  .object({ ...base, limit: z.number().int().min(1).max(5000).default(250) })
  .strict();
const risk = z
  .object({
    ...base,
    symbol,
    price: positive.nullable().optional(),
    percent: positive.max(99).optional(),
  })
  .strict()
  .refine(
    (v) => (v.price !== undefined) !== (v.percent !== undefined),
    "Informe preço (ou null para remover) ou percentual",
  );
const order = {
  ...base,
  requestId: id,
  symbol,
  side: z.enum(["buy", "sell"]),
  quantity,
  stopLoss: positive.optional(),
  takeProfit: positive.optional(),
};
const candleRange = {
  symbol,
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(20000).default(7200),
};
export const schemas = {
  get_market_overview: empty,
  get_asset_price: z.object({ symbol }).strict(),
  get_market_candles: z.object(candleRange).strict(),
  get_order_book: z
    .object({ symbol, depth: z.number().int().min(1).max(20).default(10) })
    .strict(),
  get_market_regime: empty,
  get_market_events: z
    .object({ limit: z.number().int().min(1).max(5000).default(100) })
    .strict(),
  get_account_balance: z.object(base).strict(),
  get_portfolio: z.object(base).strict(),
  get_open_positions: z.object(base).strict(),
  get_trade_history: history,
  get_order_history: history,
  place_market_order: z.object(order).strict(),
  place_limit_order: z.object({ ...order, price: positive }).strict(),
  cancel_order: z.object({ ...base, orderId: id }).strict(),
  close_position: z.object({ ...base, symbol }).strict(),
  set_stop_loss: risk,
  set_take_profit: risk,
  list_agents: empty,
  create_agent: z
    .object({
      name: z.string().trim().min(1).max(80),
      description: z.string().max(500).default(""),
      assets: z
        .array(symbol)
        .min(1)
        .max(8)
        .refine((a) => new Set(a).size === a.length, "Ativos duplicados"),
      capital: positive.min(1).max(1e9),
      maxExposure: finite.min(0.01).max(1),
      strategy,
    })
    .strict(),
  update_agent: z
    .object({
      agentId: id,
      name: z.string().trim().min(1).max(80),
      description: z.string().max(500),
      assets: z
        .array(symbol)
        .min(1)
        .max(8)
        .refine((a) => new Set(a).size === a.length, "Ativos duplicados"),
      maxExposure: finite.min(0.01).max(1),
      strategy,
    })
    .strict(),
  pause_agent: z.object({ agentId: id }).strict(),
  resume_agent: z.object({ agentId: id }).strict(),
  stop_agent: z.object({ agentId: id }).strict(),
  get_agent_performance: z.object({ agentId: id }).strict(),
  get_agent_history: z
    .object({
      agentId: id,
      limit: z.number().int().min(1).max(5000).default(200),
    })
    .strict(),
  get_simulation_status: empty,
  pause_simulation: empty,
  resume_simulation: empty,
  set_simulation_speed: z
    .object({
      speed: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(5),
        z.literal(10),
        z.literal(50),
      ]),
    })
    .strict(),
  get_simulation_configuration: empty,
  get_performance_metrics: z.object(base).strict(),
  get_asset_performance: z.object({ ...base, symbol }).strict(),
  get_equity_curve: history,
  run_backtest: z
    .object({
      symbol,
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      capital: positive.min(1).max(1e9),
      feeBps: finite.min(0).max(1000),
      slippageBps: finite.min(0).max(500),
      strategy: z.enum(["buy_hold", "sma", "rsi"]),
    })
    .strict()
    .refine((v) => v.start < v.end, "Período inválido"),
  get_backtest_results: z.object({ experimentId: id.optional() }).strict(),
  update_configuration: z
    .object({
      volatility: finite.min(0.1).max(5).optional(),
      feeBps: finite.min(0).max(1000).optional(),
      slippageBps: finite.min(0).max(500).optional(),
      spreadBps: finite.min(0).max(500).optional(),
      limitPriceImprovement: z.boolean().optional(),
      tickMs: finite.int().min(100).max(10000).optional(),
      chartInterval: z
        .enum(["1", "5", "15", "30", "60", "300", "900", "3600"])
        .optional(),
    })
    .strict(),
  admin_intervene: z
    .object({
      confirmed: z.literal(true),
      action: z.enum([
        "balance",
        "price",
        "volatility",
        "regime",
        "freeze",
        "resume",
        "event",
        "reset",
        "seed",
        "advance",
      ]),
      accountId: id.optional(),
      symbol: symbol.optional(),
      value: finite.optional(),
      event: z
        .enum(["volatility", "crash", "rally", "quiet", "regime"])
        .optional(),
    })
    .strict(),
  get_admin_log: empty,
  get_mcp_status: empty,
} as const;
export type ToolName = keyof typeof schemas;
export type ToolInput<K extends ToolName> = z.input<(typeof schemas)[K]>;
export const MCP_TOOLS = (Object.keys(schemas) as ToolName[]).filter(
  (n) =>
    ![
      "admin_intervene",
      "get_admin_log",
      "update_configuration",
      "stop_agent",
      "get_mcp_status",
      "update_agent",
    ].includes(n),
);
export const READ_ONLY = new Set<ToolName>([
  "get_market_overview",
  "get_asset_price",
  "get_market_candles",
  "get_order_book",
  "get_market_regime",
  "get_market_events",
  "get_account_balance",
  "get_portfolio",
  "get_open_positions",
  "get_trade_history",
  "get_order_history",
  "list_agents",
  "get_agent_performance",
  "get_agent_history",
  "get_simulation_status",
  "get_simulation_configuration",
  "get_performance_metrics",
  "get_asset_performance",
  "get_equity_curve",
  "get_backtest_results",
  "get_admin_log",
  "get_mcp_status",
]);
export const descriptions: Partial<Record<ToolName, string>> = {
  get_order_book:
    "Livro SINTÉTICO indicativo derivado do spread; não representa ordens de uma exchange.",
  place_market_order:
    "Executa compra/venda exclusivamente virtual com spread, slippage e taxa. requestId garante idempotência; MCP usa conta externa isolada.",
  place_limit_order:
    "Reserva saldo/quantidade e mantém ordem virtual até o bid/ask atingir o limite. Nunca executa além do preço limite.",
  run_backtest:
    "Executa experimento isolado sobre candles sintéticos persistidos, sem usar candles futuros nem alterar a conta principal.",
  create_agent:
    "Cria agente local com capital e limite de exposição próprios. MCP só controla agentes de sua propriedade.",
  get_market_candles:
    "Consulta histórico sintético da sessão atual salvo no SQLite. Tempos são segundos do relógio simulado UTC.",
  pause_simulation: "Pausa o relógio global da simulação local aberta.",
  resume_simulation: "Retoma o relógio global da simulação local aberta.",
};
