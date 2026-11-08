import { _electron as electron } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = mkdtempSync(join(tmpdir(), "market-lab-desktop-"));
const extra = JSON.parse(process.env.ELECTRON_TEST_ARGS || "[]");
const executablePath = process.env.MARKET_LAB_EXECUTABLE;
const args = [
  ...(executablePath ? [] : [process.env.MARKET_LAB_APP || "."]),
  `--user-data-dir=${profile}`,
  ...extra,
];
let app, client;
const errors = [];
try {
  app = await electron.launch({
    args,
    ...(executablePath ? { executablePath } : {}),
  });
  let page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page
    .getByText("Sessão carregada", { exact: false })
    .waitFor({ timeout: 60000 });
  const invoke = async (name, args = {}) => {
    const r = await page.evaluate(
      async ({ name, args }) => window.marketLab.invoke(name, args),
      { name, args },
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.data;
  };
  await invoke("pause_simulation");
  let view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.equal(view.portfolio.positions.length, 0);
  assert.equal(view.portfolio.equity, 100000);
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.sandbox, true);
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.ok((await page.locator("canvas").count()) > 0);
  for (const name of [
    "Mercados",
    "Notícias",
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
    .getByRole("button", { name: "Trading", exact: true })
    .click();
  await page.getByLabel("Quantidade", { exact: true }).fill("0.01");
  await page
    .getByRole("button", { name: "Revisar ordem", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar ordem", exact: true })
    .click();
  await page.getByText(/Ordem order-.*executada/).waitFor();
  view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.equal(view.portfolio.positions[0].quantity, 0.01);
  assert.ok(view.portfolio.account.cash < 100000);
  await page.getByLabel("Tipo", { exact: true }).selectOption("limit");
  await page
    .getByLabel("Preço limite", { exact: true })
    .fill(String(view.market.quotes[0].price * 0.5));
  await page
    .getByRole("button", { name: "Revisar ordem", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar ordem", exact: true })
    .click();
  await page.getByText(/Ordem order-.*pendente/).waitFor();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByLabel("Modo", { exact: true }).selectOption("percent");
  await page.getByLabel("Nível", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Salvar proteção", exact: true })
    .click();
  view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.ok(view.portfolio.positions[0].stopLoss > 0);

  await page
    .locator("nav")
    .getByRole("button", { name: "Agentes de IA", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Agente de teste");
  await page.getByLabel("Estratégia", { exact: true }).selectOption("buy_hold");
  await page.getByRole("button", { name: "Criar agente", exact: true }).click();
  await page
    .getByRole("button", { name: "Agente de teste · Local", exact: true })
    .waitFor();
  await invoke("admin_intervene", {
    confirmed: true,
    action: "advance",
    value: 20,
  });
  view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.equal(view.agents[0].portfolio.positions.length, 1);
  await page
    .locator("nav")
    .getByRole("button", { name: "Análises", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Executar backtest", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Experimentos salvos", exact: true })
    .waitFor();
  await page
    .locator("nav")
    .getByRole("button", { name: "Notícias", exact: true })
    .click();
  await page
    .getByLabel("Texto que o Claude vai ler", { exact: true })
    .fill("Nova legislação favorece pagamentos digitais.");
  await page.getByLabel("Impacto (%)", { exact: true }).fill("2.5");
  await page
    .getByRole("button", {
      name: "Publicar notícia e aplicar impacto",
      exact: true,
    })
    .click();
  await page
    .getByText("Notícia publicada. O impacto segue a programação escolhida.", {
      exact: true,
    })
    .waitFor();
  // Teste STDIO usando o próprio executável Electron, usando o runtime Node embutido e o servidor distribuído.
  view = (await page.evaluate(() => window.marketLab.view())).data;
  const config = view.mcp.configuration.mcpServers["market-lab"];
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    stderr: "pipe",
    env: {
      ...config.env,
      ...Object.fromEntries(
        [
          "XDG_CACHE_HOME",
          "XDG_CONFIG_HOME",
          "DISPLAY",
          "DBUS_SESSION_BUS_ADDRESS",
          "GSETTINGS_BACKEND",
          "NO_AT_BRIDGE",
        ]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]]),
      ),
    },
  });
  if (process.env.DEBUG_MCP)
    transport.stderr?.on("data", (d) => process.stderr.write(d));
  client = new Client({ name: "desktop-e2e", version: "1" });
  await client.connect(transport);
  const newsResult = await client.callTool({
    name: "get_market_news",
    arguments: {},
  });
  assert.equal(newsResult.isError, false);
  const feed = newsResult.structuredContent.data;
  assert.equal(feed[0].text, "Nova legislação favorece pagamentos digitais.");
  assert.deepEqual(Object.keys(feed[0]), ["text"]);
  const tools = await client.listTools();
  assert.ok(tools.tools.length >= 35);
  const response = await client.callTool({
    name: "place_market_order",
    arguments: {
      requestId: "desktop-mcp",
      symbol: "ETH/USD",
      side: "buy",
      quantity: 0.1,
    },
  });
  assert.equal(response.isError, false, JSON.stringify(response));
  const short = await client.callTool({
    name: "open_short",
    arguments: { requestId: "e2e-short", symbol: "SOL/USD", quantity: 1 },
  });
  assert.equal(short.isError, false, JSON.stringify(short));
  const shared = (await page.evaluate(() => window.marketLab.view())).data;
  assert.equal(
    shared.portfolio.positions.find((p) => p.symbol === "SOL/USD").direction,
    "short",
  );

  view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.ok(view.portfolio.positions.some((p) => p.symbol === "ETH/USD"));
  await client.close();
  client = null;
  const orders = view.orders.length,
    sessionId = view.sessionId;
  await page
    .locator("nav")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await page.getByLabel("Ativo", { exact: true }).selectOption("SOL/USD");
  await page.waitForTimeout(900);
  mkdirSync("output", { recursive: true });
  await page.screenshot({
    path: "output/market-lab-0.2.1.png",
    fullPage: true,
  });
  await app.close();
  app = null;
  app = await electron.launch({
    args,
    ...(executablePath ? { executablePath } : {}),
  });
  page = await app.firstWindow();
  await page
    .getByText("Sessão carregada", { exact: false })
    .waitFor({ timeout: 60000 });
  view = (await page.evaluate(() => window.marketLab.view())).data;
  assert.equal(view.sessionId, sessionId);
  assert.equal(view.orders.length, orders);
  assert.equal(view.portfolio.positions[0].quantity, 0.01);
  assert.ok(view.backtests.length > 0);
  assert.equal(view.simulation.running, false);
  assert.deepEqual(errors, []);
  console.log(
    "Electron: oito páginas, ordens mercado/limite, agentes, backtest, MCP STDIO, isolamento e reinício OK",
  );
} finally {
  if (client) await client.close();
  if (app) await app.close();
  rmSync(profile, { recursive: true, force: true });
}
