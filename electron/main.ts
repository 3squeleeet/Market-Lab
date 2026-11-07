import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openDatabase } from "../packages/database/src/index.js";
import type { SavedSession } from "../packages/shared/src/index.js";
const here = path.dirname(fileURLToPath(import.meta.url));
let db: Awaited<ReturnType<typeof openDatabase>>;
let win: BrowserWindow | null = null;
function valid(s: unknown): s is SavedSession {
  const v = s as SavedSession;
  return (
    !!v &&
    v.version === 1 &&
    Number.isSafeInteger(v.seed) &&
    Number.isSafeInteger(v.ticks) &&
    v.ticks >= 0 &&
    v.ticks <= 10000000 &&
    [1, 2, 5, 10, 50].includes(v.speed) &&
    Number.isFinite(v.volatility) &&
    v.volatility >= 0.1 &&
    v.volatility <= 5 &&
    typeof v.running === "boolean"
  );
}
function createWindow() {
  win = new BrowserWindow({
    width: 1510,
    height: 980,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#0b0e11",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault();
  });
  if (!app.isPackaged && process.argv.includes("--dev"))
    win.loadURL("http://localhost:5173");
  else win.loadFile(path.join(here, "../../dist/index.html"));
  win.on("closed", () => (win = null));
}
app
  .whenReady()
  .then(async () => {
    db = await openDatabase(
      path.join(app.getPath("userData"), "market-lab.sqlite"),
    );
    ipcMain.handle("session:load", (e) => {
      if (e.sender !== win?.webContents) throw Error("Origem inválida");
      return db.load();
    });
    ipcMain.handle("session:save", (e, s: unknown) => {
      if (e.sender !== win?.webContents || !valid(s))
        throw Error("Sessão inválida");
      db.save(s);
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((e) => {
    console.error(e);
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => db?.close());
