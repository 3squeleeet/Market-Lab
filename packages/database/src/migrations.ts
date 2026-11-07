export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,profile_id TEXT,balance REAL NOT NULL);
CREATE TABLE IF NOT EXISTS assets(symbol TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,seed INTEGER NOT NULL,state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,time INTEGER NOT NULL,payload TEXT NOT NULL);
INSERT OR IGNORE INTO profiles VALUES('local','Pesquisador');INSERT OR IGNORE INTO accounts VALUES('main','local',100000);
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,version INTEGER NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS virtual_accounts(session_id TEXT NOT NULL,id TEXT NOT NULL,cash REAL NOT NULL CHECK(cash>=0),payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS candles(session_id TEXT NOT NULL,symbol TEXT NOT NULL,time INTEGER NOT NULL,open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,volume REAL NOT NULL,PRIMARY KEY(session_id,symbol,time));
CREATE TABLE IF NOT EXISTS orders(session_id TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS executions(session_id TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS positions(session_id TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS closed_positions(session_id TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS market_events(session_id TEXT NOT NULL,id TEXT NOT NULL,time INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS agents(session_id TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS agent_history(session_id TEXT NOT NULL,agent_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,agent_id,id));
CREATE TABLE IF NOT EXISTS equity_curve(session_id TEXT NOT NULL,account_id TEXT NOT NULL,time INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,account_id,time));
CREATE TABLE IF NOT EXISTS backtest_results(session_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS admin_logs(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,time INTEGER NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(session_id,account_id);
CREATE INDEX IF NOT EXISTS idx_candles_time ON candles(session_id,time);
`,
  },
];
