import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
});
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id"),
  balance: real("balance").notNull(),
});
export const assets = sqliteTable("assets", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  seed: integer("seed").notNull(),
  state: text("state").notNull(),
});
export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  payload: text("payload").notNull(),
});
export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  startedAt: integer("started_at").notNull(),
  config: text("config").notNull(),
});
export const candles = sqliteTable(
  "candles",
  {
    sessionId: text("session_id").notNull(),
    symbol: text("symbol").notNull(),
    time: integer("time").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.symbol, t.time] })],
);
export const virtualAccounts = sqliteTable(
  "virtual_accounts",
  {
    sessionId: text("session_id").notNull(),
    id: text("id").notNull(),
    cash: real("cash").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
);
const entity = (name: string) =>
  sqliteTable(
    name,
    {
      sessionId: text("session_id").notNull(),
      id: text("id").notNull(),
      accountId: text("account_id").notNull(),
      payload: text("payload").notNull(),
    },
    (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
  );
export const executions = entity("executions"),
  positions = entity("positions"),
  closedPositions = entity("closed_positions"),
  agents = entity("agents");
export const orders = sqliteTable(
  "orders",
  {
    sessionId: text("session_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    status: text("status").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
);
export const marketEvents = sqliteTable(
  "market_events",
  {
    sessionId: text("session_id").notNull(),
    id: text("id").notNull(),
    time: integer("time").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
);
export const agentHistory = sqliteTable(
  "agent_history",
  {
    sessionId: text("session_id").notNull(),
    agentId: text("agent_id").notNull(),
    id: text("id").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.agentId, t.id] })],
);
export const equityCurve = sqliteTable(
  "equity_curve",
  {
    sessionId: text("session_id").notNull(),
    accountId: text("account_id").notNull(),
    time: integer("time").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.accountId, t.time] })],
);
export const backtestResults = sqliteTable(
  "backtest_results",
  {
    sessionId: text("session_id").notNull(),
    id: text("id").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
);
export const adminLogs = sqliteTable("admin_logs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  time: integer("time").notNull(),
  payload: text("payload").notNull(),
});
