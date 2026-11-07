import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import * as schema from "./schema.js";
import type { SavedSession } from "../../shared/src/index.js";
export async function openDatabase(path: string) {
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  const sqlite = new SQL.Database(
    existsSync(path) ? readFileSync(path) : undefined,
  );
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,profile_id TEXT REFERENCES profiles(id),balance REAL NOT NULL);CREATE TABLE IF NOT EXISTS assets(symbol TEXT PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,seed INTEGER NOT NULL,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT REFERENCES sessions(id),time INTEGER NOT NULL,payload TEXT NOT NULL);INSERT OR IGNORE INTO profiles VALUES('local','Pesquisador');INSERT OR IGNORE INTO accounts VALUES('main','local',100000);`,
  );
  const db = drizzle(sqlite, { schema });
  for (const symbol of [
    "BTC/USD",
    "ETH/USD",
    "SOL/USD",
    "BNB/USD",
    "XRP/USD",
    "DOGE/USD",
    "ADA/USD",
    "AVAX/USD",
  ])
    db.insert(schema.assets)
      .values({ symbol, name: symbol.split("/")[0] })
      .onConflictDoNothing()
      .run();
  const flush = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + ".tmp", sqlite.export());
    renameSync(path + ".tmp", path);
  };
  flush();
  return {
    load() {
      const row = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "default"))
        .get();
      return row ? (JSON.parse(row.state) as SavedSession) : null;
    },
    save(session: SavedSession) {
      db.insert(schema.settings)
        .values({
          id: "simulation",
          value: JSON.stringify({
            volatility: session.volatility,
            speed: session.speed,
          }),
        })
        .onConflictDoUpdate({
          target: schema.settings.id,
          set: {
            value: JSON.stringify({
              volatility: session.volatility,
              speed: session.speed,
            }),
          },
        })
        .run();
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
      flush();
    },
    close() {
      flush();
      sqlite.close();
    },
  };
}
