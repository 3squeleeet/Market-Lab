import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1510, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173");
await page.getByText("Sessão carregada", { exact: false }).waitFor();
await page.waitForTimeout(500);
assert.ok((await page.locator("canvas").count()) > 0);
await page.getByRole("button", { name: "Pausar", exact: true }).click();
const time = await page.locator(".sim-time strong").innerText();
await page.waitForTimeout(1200);
assert.equal(await page.locator(".sim-time strong").innerText(), time);
await page.getByRole("button", { name: "50x", exact: true }).click();
await page.getByRole("button", { name: "Retomar", exact: true }).click();
await page.waitForTimeout(1200);
assert.notEqual(await page.locator(".sim-time strong").innerText(), time);
await page.getByRole("button", { name: "Pausar", exact: true }).click();
await page.getByLabel("Ativo", { exact: true }).selectOption("ETH/USD");
await page.getByRole("button", { name: "5m", exact: true }).click();
for (const name of [
  "Mercados",
  "Trading",
  "Agentes de IA",
  "Portfólio",
  "Análises",
  "Conexões MCP",
  "Configurações",
]) {
  await page.locator("nav").getByRole("button", { name, exact: false }).click();
  await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
}
await page
  .locator("nav")
  .getByRole("button", { name: "Visão geral", exact: true })
  .click();
await page.waitForTimeout(5200);
const persisted = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("market-lab-session")),
);
assert.equal(persisted.speed, 50);
assert.equal(persisted.running, false);
await page.reload();
await page.getByText("Sessão carregada", { exact: false }).waitFor();
assert.equal(
  await page.getByRole("button", { name: "Retomar", exact: true }).count(),
  1,
);
await page.screenshot({ path: "output/market-lab.png", fullPage: true });
assert.deepEqual(errors, []);
console.log("Browser: gráfico, navegação, pausa, 50x e restauração OK");
await browser.close();
