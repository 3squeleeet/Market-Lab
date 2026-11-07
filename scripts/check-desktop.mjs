import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "market-lab-desktop-"));
const extra = JSON.parse(process.env.ELECTRON_TEST_ARGS || "[]");
const args = [".", `--user-data-dir=${profile}`, ...extra];
let app;
try {
  app = await electron.launch({ args });
  let page = await app.firstWindow();
  await page.getByText("Sessão carregada", { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.sandbox, true);
  await page
    .locator("nav")
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Seed", { exact: true }).fill("77");
  await page
    .getByRole("button", { name: "Aplicar e reiniciar", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("button", { name: "2x", exact: true }).click();
  await page.waitForTimeout(5500);
  const saved = await page.evaluate(() => window.marketLab.load());
  assert.equal(saved.seed, 77);
  assert.equal(saved.speed, 2);
  assert.equal(saved.running, false);
  await app.close();
  app = await electron.launch({ args });
  page = await app.firstWindow();
  await page.getByText("Sessão carregada", { exact: false }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Retomar", exact: true }).count(),
    1,
  );
  const restored = await page.evaluate(() => window.marketLab.load());
  assert.deepEqual(restored, saved);
  console.log(
    "Electron: isolamento, controles, IPC SQLite e restauração após reinício OK",
  );
} finally {
  if (app) await app.close();
  rmSync(profile, { recursive: true, force: true });
}
