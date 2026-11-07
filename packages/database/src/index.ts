import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import * as schema from "./schema.js";
import { migrations } from "./migrations.js";
import {
  SYMBOLS,
  type SavedSession,
  type LabState,
  type Candle,
  type Symbol,
} from "../../shared/src/index.js";
export async function openDatabase(path: string) {
  const require = createRequire(import.meta.url),
    SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  let sqlite = new SQL.Database(
    existsSync(path) ? readFileSync(path) : undefined,
  );
  let db = drizzle(sqlite, { schema });
  let closed = false;
  let lastSaved = 0;
  const flush = () => {
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(path + ".tmp", "w", 0o600);
    try {
      writeFileSync(fd, sqlite.export());
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(path + ".tmp", path);
    lastSaved = Date.now();
  };
  sqlite.run(
    "PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)",
  );
  for (const m of migrations) {
    const q = sqlite.exec(
      `SELECT version FROM schema_migrations WHERE version=${m.version}`,
    );
    if (!q.length) {
      sqlite.run("BEGIN");
      try {
        sqlite.run(m.sql);
        sqlite.run("INSERT INTO schema_migrations VALUES (?,?)", [
          m.version,
          Date.now(),
        ]);
        sqlite.run("COMMIT");
      } catch (e) {
        sqlite.run("ROLLBACK");
        throw e;
      }
    }
  }
  for (const symbol of SYMBOLS)
    db.insert(schema.assets)
      .values({ symbol, name: symbol.split("/")[0] })
      .onConflictDoNothing()
      .run();
  flush();
  function atomic(action: () => void) {
    if (closed) throw Error("Banco fechado");
    const before = sqlite.export();
    try {
      sqlite.run("BEGIN IMMEDIATE");
      action();
      sqlite.run("COMMIT");
      flush();
    } catch (e) {
      try {
        sqlite.run("ROLLBACK");
      } catch {}
      sqlite.close();
      sqlite = new SQL.Database(before);
      db = drizzle(sqlite, { schema });
      throw e;
    }
  }
  function saveState(state: LabState) {
    atomic(() => {
      db.insert(schema.checkpoints)
        .values({ id: "current", version: 2, payload: JSON.stringify(state) })
        .onConflictDoUpdate({
          target: schema.checkpoints.id,
          set: { version: 2, payload: JSON.stringify(state) },
        })
        .run();
      sqlite.run("INSERT OR IGNORE INTO experiments VALUES (?,?,?)", [
        state.sessionId,
        state.market.time,
        JSON.stringify(state.simulation),
      ]);
      sqlite.run("INSERT OR REPLACE INTO settings VALUES (?,?)", [
        "simulation",
        JSON.stringify({
          simulation: state.simulation,
          execution: state.trading.config,
        }),
      ]);
      const sid = state.sessionId;
      // Candles are append-only per experiment; old experiments remain available in SQLite.
      const existing = new Map<string, number>();
      for (const row of sqlite.exec(
        "SELECT symbol,MAX(time) FROM candles WHERE session_id=? GROUP BY symbol",
        [sid],
      )[0]?.values ?? [])
        existing.set(String(row[0]), Number(row[1]));
      const stmt = sqlite.prepare(
        "INSERT OR IGNORE INTO candles VALUES (?,?,?,?,?,?,?,?)",
      );
      try {
        for (const q of state.market.quotes)
          for (const c of q.candles)
            if (c.time > (existing.get(q.symbol) ?? 0))
              stmt.run([
                sid,
                q.symbol,
                c.time,
                c.open,
                c.high,
                c.low,
                c.close,
                c.volume,
              ]);
      } finally {
        stmt.free();
      }
      for (const a of state.trading.accounts)
        sqlite.run("INSERT OR REPLACE INTO virtual_accounts VALUES (?,?,?,?)", [
          sid,
          a.id,
          a.cash,
          JSON.stringify(a),
        ]);
      const entities: [string, { id: string; accountId: string }[]][] = [
        ["executions", state.trading.executions],
        ["closed_positions", state.trading.closed],
        ["agents", state.agents],
      ];
      for (const [table, rows] of entities)
        for (const row of rows)
          sqlite.run(`INSERT OR REPLACE INTO ${table} VALUES (?,?,?,?)`, [
            sid,
            row.id,
            row.accountId,
            JSON.stringify(row),
          ]);
      sqlite.run("DELETE FROM positions WHERE session_id=?", [sid]);
      for (const p of state.trading.positions)
        sqlite.run("INSERT INTO positions VALUES (?,?,?,?)", [
          sid,
          p.id,
          p.accountId,
          JSON.stringify(p),
        ]);
      for (const o of state.trading.orders)
        sqlite.run("INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?)", [
          sid,
          o.id,
          o.accountId,
          o.status,
          JSON.stringify(o),
        ]);
      for (const e of state.market.events)
        sqlite.run("INSERT OR IGNORE INTO market_events VALUES (?,?,?,?)", [
          sid,
          e.id,
          e.time,
          JSON.stringify(e),
        ]);
      for (const a of state.agents)
        for (const h of a.history)
          sqlite.run("INSERT OR IGNORE INTO agent_history VALUES (?,?,?,?)", [
            sid,
            a.id,
            h.id,
            JSON.stringify(h),
          ]);
      for (const p of state.equity)
        sqlite.run("INSERT OR REPLACE INTO equity_curve VALUES (?,?,?,?)", [
          sid,
          p.accountId,
          p.time,
          JSON.stringify(p),
        ]);
      for (const b of state.backtests)
        sqlite.run("INSERT OR REPLACE INTO backtest_results VALUES (?,?,?)", [
          sid,
          b.id,
          JSON.stringify(b),
        ]);
      for (const a of state.audit)
        sqlite.run("INSERT OR IGNORE INTO admin_logs VALUES (?,?,?,?)", [
          a.id,
          sid,
          a.time,
          JSON.stringify(a),
        ]);
    });
  }
  return {
    path,
    get lastSaved() {
      return lastSaved;
    },
    schemaVersion: 2,
    load() {
      const row = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "default"))
        .get();
      return row ? (JSON.parse(row.state) as SavedSession) : null;
    },
    save(session: SavedSession) {
      atomic(() => {
        db.insert(schema.sessions)
          .values({
            id: "default",
            seed: session.seed,
            state: JSON.stringify(session),
          })
          .onConflictDoUpdate({
            target: schema.sessions.id,
            set: { seed: session.seed, state: JSON.stringify(session) },
          })
          .run();
      });
    },
    loadState() {
      const row = db
        .select()
        .from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, "current"))
        .get();
      if (!row) return null;
      const state = JSON.parse(row.payload) as LabState;
      if (
        state.version !== 2 ||
        !state.market ||
        !state.trading ||
        !state.sessionId
      )
        throw Error("Checkpoint incompatível ou corrompido");
      return state;
    },
    saveState,
    candles(
      sessionId: string,
      symbol: Symbol,
      start = 0,
      end = Number.MAX_SAFE_INTEGER,
      limit = 20000,
    ): Candle[] {
      const stmt = sqlite.prepare(
        "SELECT time,open,high,low,close,volume FROM (SELECT time,open,high,low,close,volume FROM candles WHERE session_id=? AND symbol=? AND time>=? AND time<=? ORDER BY time DESC LIMIT ?) ORDER BY time",
      );
      try {
        stmt.bind([sessionId, symbol, start, end, limit]);
        const rows: Candle[] = [];
        while (stmt.step()) {
          const r = stmt.get();
          rows.push({
            time: Number(r[0]),
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5]),
          });
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    close() {
      if (!closed) {
        flush();
        sqlite.close();
        closed = true;
      }
    },
  };
}
export type Repository = Awaited<ReturnType<typeof openDatabase>>;
