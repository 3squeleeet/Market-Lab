import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { openDatabase } from "../packages/database/src/index.js";
import { LabService } from "../packages/core/src/index.js";
import { startBridge } from "../packages/mcp-server/src/bridge.js";
import { TradingError } from "../packages/trading-engine/src/index.js";
import type { Reply } from "../packages/shared/src/index.js";
import { ZodError } from "zod";
import { SYMBOLS, type Symbol } from "../packages/shared/src/index.js";
import { assertJSON } from "../packages/shared/src/validation.js";
import { SimulationClock } from "../packages/time-controller/src/index.js";
const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.includes("--mcp")) {
  const index = process.argv.indexOf("--discovery");
  const discovery = process.argv[index + 1];
  if (index < 0 || !discovery) {
    process.stderr.write("Use a configuração exibida em Conexões MCP.\n");
    app.exit(1);
  } else {
    await import("../packages/mcp-server/src/index.js")
      .then((m) => m.startMCP(discovery))
      .catch((e) => {
        process.stderr.write(String(e));
        app.exit(1);
      });
  }
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let service: LabService;
  let db: Awaited<ReturnType<typeof openDatabase>>;
  let bridge: Awaited<ReturnType<typeof startBridge>>;
  let win: BrowserWindow | null = null;
  let timer: ReturnType<typeof setInterval>;
  let quitting = false;
  const reply = (fn: () => unknown): Reply => {
    try {
      const data = fn();
      assertJSON(data);
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        error: {
          code:
            e instanceof TradingError
              ? e.code
              : e instanceof ZodError
                ? "VALIDATION"
                : "LOCAL_ERROR",
          message:
            e instanceof ZodError
              ? e.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("; ")
              : e instanceof Error
                ? e.message
                : "Falha desconhecida",
        },
      };
    }
  };
  const authorized = (e: Electron.IpcMainInvokeEvent) => {
    if (
      e.sender !== win?.webContents ||
      e.senderFrame !== win.webContents.mainFrame
    )
      throw Error("Origem IPC inválida");
  };
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
    win.webContents.on("will-attach-webview", (e) => e.preventDefault());
    if (!app.isPackaged && process.argv.includes("--dev"))
      void win.loadURL("http://localhost:5173");
    else void win.loadFile(path.join(here, "../../dist/index.html"));
    win.on("closed", () => (win = null));
  }
  app
    .whenReady()
    .then(async () => {
      const directory = app.getPath("userData");
      db = await openDatabase(path.join(directory, "market-lab.sqlite"));
      service = new LabService(db);
      const mcpArgs = [
        ...(app.isPackaged ? ["--mcp"] : [app.getAppPath(), "--mcp"]),
        ...(process.platform === "linux" ? ["--headless"] : []),
        `--user-data-dir=${path.join(directory, "mcp-runtime")}`,
      ];
      bridge = await startBridge(service, directory, process.execPath, mcpArgs);
      ipcMain.handle("lab:view", (e, symbol: unknown) =>
        reply(() => {
          authorized(e);
          if (symbol !== undefined && !SYMBOLS.includes(symbol as Symbol))
            throw Error("Ativo inválido");
          return service.view(symbol as Symbol | undefined);
        }),
      );
      ipcMain.handle("lab:invoke", (e, name: unknown, args: unknown) =>
        reply(() => {
          authorized(e);
          if (quitting) throw Error("Aplicativo encerrando");
          if (typeof name !== "string") throw Error("Comando inválido");
          return service.execute(name, args, "ui");
        }),
      );
      let previous = performance.now();
      const clock = new SimulationClock();
      timer = setInterval(() => {
        const now = performance.now(),
          elapsed = now - previous;
        previous = now;
        clock.running = service.state.simulation.running;
        clock.speed = service.state.simulation.speed;
        clock.tickMs = service.state.simulation.tickMs;
        const ticks = clock.consume(elapsed, 250);
        if (ticks > 0) {
          try {
            service.advance(ticks);
          } catch (e) {
            service.state.simulation.running = false;
            dialog.showErrorBox(
              "Simulação pausada: falha de persistência",
              e instanceof Error ? e.message : String(e),
            );
          }
        }
      }, 250);
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((e) => {
      dialog.showErrorBox("Não foi possível abrir o Market Lab", String(e));
      app.quit();
    });
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    clearInterval(timer);
    bridge?.close();
  });
  app.on("will-quit", () => {
    try {
      service?.commit();
      db?.close();
    } catch (e) {
      console.error(e);
    }
  });
}
