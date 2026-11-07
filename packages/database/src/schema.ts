import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
  profileId: text("profile_id").references(() => profiles.id),
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
export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").references(() => sessions.id),
  time: integer("time").notNull(),
  payload: text("payload").notNull(),
});
