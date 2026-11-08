import { chromium } from "@playwright/test";
import { openDatabase } from "../dist-electron/packages/database/src/index.js";
import { LabService } from "../dist-electron/packages/core/src/index.js";
import { SimulationClock } from "../dist-electron/packages/time-controller/src/index.js";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "market-lab-browser-"));
const db = await openDatabase(join(dir, "lab.sqlite")),
  service = new LabService(db);
const clock = new SimulationClock();
let last = performance.now();
const timer = setInterval(() => {
  const now = performance.now();
  clock.running = service.state.simulation.running;
  clock.speed = service.state.simulation.speed;
  clock.tickMs = service.state.simulation.tickMs;
  const ticks = clock.consume(now - last, 100);
  last = now;
  if (ticks) service.advance(ticks);
}, 250);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1510, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__labView", (symbol, options) => ({
    ok: true,
    data: service.view(symbol, options),
  }));
  await page.exposeFunction("__labInvoke", (name, args) => {
    try {
      return { ok: true, data: service.execute(name, args) };
    } catch (e) {
      return { ok: false, error: { code: "LOCAL_ERROR", message: e.message } };
    }
  });
  await page.addInitScript(() => {
    window.marketLab = {
      view: (symbol, options) => window.__labView(symbol, options),
      invoke: (name, args) => window.__labInvoke(name, args),
    };
  });
  await page.goto("http://localhost:5173");
  await page.getByText("Sessão carregada", { exact: false }).waitFor();
  assert.ok((await page.locator("canvas").count()) > 0);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("button", { name: "Retomar", exact: true }).waitFor();
  const time = service.market.time;
  await page.waitForTimeout(1200);
  assert.equal(service.market.time, time);
  await page.getByRole("button", { name: "50x", exact: true }).click();
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.waitForTimeout(1500);
  assert.ok(service.market.time > time + 20);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByLabel("Ativo", { exact: true }).selectOption("ETH/USD");
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await page.waitForTimeout(700);
  assert.equal(service.state.simulation.chartInterval, 300);
  for (const name of [
    "Mercados",
    "Trading",
    "Agentes de IA",
    "Portfólio",
    "Análises",
    "Conexões MCP",
    "Configurações",
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name, exact: true })
      .click();
    await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
  }
  await page
    .locator("nav")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  mkdirSync("output", { recursive: true });
  await page.screenshot({ path: "output/browser-0.2.0.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Browser: interface conectada ao serviço SQLite real, gráfico, navegação, pausa e 50x OK",
  );
} finally {
  clearInterval(timer);
  await browser.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
