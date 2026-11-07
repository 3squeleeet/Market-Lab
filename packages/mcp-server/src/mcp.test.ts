import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openDatabase } from "../../database/src/index";
import { LabService } from "../../core/src/index";
import { startBridge, bridgeRequest } from "./bridge";
import { MCP_TOOLS } from "../../shared/src/commands";
it("SDK oficial negocia STDIO, valida ferramentas e opera o estado real da instância", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lab-mcp-"));
  const db = await openDatabase(join(dir, "lab.sqlite")),
    lab = new LabService(db);
  lab.state.simulation.running = false;
  const bridge = await startBridge(lab, dir, process.execPath, [
    "dist-electron/packages/mcp-server/src/cli.js",
  ]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve("dist-electron/packages/mcp-server/src/cli.js"),
      "--discovery",
      bridge.configPath,
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "integration-test", version: "1" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual(
      [...MCP_TOOLS].sort(),
    );
    expect(listed.tools.some((t) => t.name === "admin_intervene")).toBe(false);
    const r = await client.callTool({
      name: "get_asset_price",
      arguments: { symbol: "BTC/USD" },
    });
    expect(r.isError).toBe(false);
    const response = r.structuredContent as {
      ok: boolean;
      data: { price: number };
    };
    expect(response.data.price).toBe(lab.market.quotes[0].price);
    const invalid = await client.callTool({
      name: "place_market_order",
      arguments: {
        requestId: "invalid",
        symbol: "BTC/USD",
        side: "buy",
        quantity: -1,
      },
    });
    expect(invalid.isError).toBe(true);
    const trade = await client.callTool({
      name: "place_market_order",
      arguments: {
        requestId: "ok",
        symbol: "BTC/USD",
        side: "buy",
        quantity: 0.01,
      },
    });
    expect(trade.isError).toBe(false);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result)).toBe(false);
      return (result.structuredContent as { data: unknown }).data;
    };
    const btc = lab.market.quotes[0];
    for (const [name, args] of [
      ["get_market_overview", {}],
      ["get_market_candles", { symbol: "BTC/USD", limit: 10 }],
      ["get_order_book", { symbol: "BTC/USD", depth: 5 }],
      ["get_market_regime", {}],
      ["get_market_events", {}],
      ["get_account_balance", {}],
      ["get_portfolio", {}],
      ["get_open_positions", {}],
      ["get_trade_history", {}],
      ["get_order_history", {}],
      ["list_agents", {}],
      ["get_agent_performance", { agentId: "external" }],
      ["get_agent_history", { agentId: "external" }],
      ["get_simulation_status", {}],
      ["get_simulation_configuration", {}],
      ["get_performance_metrics", {}],
      ["get_asset_performance", { symbol: "BTC/USD" }],
      ["get_equity_curve", {}],
      ["get_backtest_results", {}],
    ] as [string, Record<string, unknown>][])
      await call(name, args);
    await call("set_stop_loss", { symbol: "BTC/USD", percent: 10 });
    await call("set_take_profit", { symbol: "BTC/USD", percent: 20 });
    const pending = (await call("place_limit_order", {
      requestId: "limit-sdk",
      symbol: "BTC/USD",
      side: "buy",
      quantity: 0.001,
      price: btc.price * 0.5,
    })) as { id: string };
    await call("cancel_order", { orderId: pending.id });
    const agent = (await call("create_agent", {
      name: "SDK agent",
      assets: ["ETH/USD"],
      capital: 1000,
      maxExposure: 0.5,
      strategy: "external",
    })) as { id: string };
    await call("pause_agent", { agentId: agent.id });
    await call("resume_agent", { agentId: agent.id });
    await call("pause_simulation");
    await call("set_simulation_speed", { speed: 50 });
    await call("resume_simulation");
    await call("run_backtest", {
      symbol: "BTC/USD",
      start: 1735689601,
      end: 1735693200,
      capital: 1000,
      feeBps: 10,
      slippageBps: 2,
      strategy: "buy_hold",
    });

    expect(lab.trading.position("external", "BTC/USD")?.quantity).toBe(0.01);
    expect(
      lab.trading.state.positions.some((p) => p.accountId === "main"),
    ).toBe(false);
    const denied = await client.callTool({
      name: "get_portfolio",
      arguments: { accountId: "main" },
    });
    expect(denied.isError).toBe(true);
    expect(lab.mcpStatus?.connections).toBeGreaterThan(0);
    await call("close_position", { symbol: "BTC/USD" });
    expect(lab.trading.position("external", "BTC/USD")).toBeUndefined();
    await client.close();
    bridge.close();
    const unavailable = await bridgeRequest(
      bridge.configPath,
      "test",
      "get_market_overview",
    );
    expect(unavailable.ok).toBe(false);
  } finally {
    await client.close();
    bridge.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("servidor STDIO permanece honesto quando o aplicativo está fechado", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve("dist-electron/packages/mcp-server/src/cli.js"),
      "--discovery",
      join(tmpdir(), "missing-market-lab-instance.json"),
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "offline-test", version: "1" });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "get_market_overview",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("UNAVAILABLE");
  } finally {
    await client.close();
  }
});
