import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import {
  schemas,
  MCP_TOOLS,
  descriptions,
  READ_ONLY,
} from "../../shared/src/commands.js";
import { bridgeRequest } from "./bridge.js";
export async function startMCP(discoveryPath: string) {
  const sessionId = randomUUID(),
    server = new McpServer(
      { name: "market-lab", version: "0.2.1" },
      {
        instructions:
          "Simulador local. Todos os preços, saldos e ordens são virtuais. O aplicativo deve estar aberto. Ordens e consultas usam a conta principal e seu patrimônio virtual por padrão. Contas de agentes continuam separadas. Ferramentas não administrativas, sem acesso a arquivos/comandos ou corretoras. Datas em segundos UTC do relógio sintético.",
      },
    );
  for (const name of MCP_TOOLS) {
    server.registerTool(
      name,
      {
        description:
          descriptions[name] ??
          `Market Lab local: ${name}. Opera exclusivamente no estado sintético da instância aberta; nunca usa dados de exchanges reais.`,
        inputSchema: schemas[name],
        annotations: {
          readOnlyHint: READ_ONLY.has(name),
          destructiveHint: !READ_ONLY.has(name),
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        const result = await bridgeRequest(
          discoveryPath,
          sessionId,
          name,
          args,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
          isError: !result.ok,
        };
      },
    );
  }
  await server.connect(new StdioServerTransport());
  await bridgeRequest(discoveryPath, sessionId, "__hello");
  const timer = setInterval(
    () => void bridgeRequest(discoveryPath, sessionId, "__hello"),
    10000,
  );
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    await bridgeRequest(discoveryPath, sessionId, "__bye");
    await server.close();
  };
  process.once("SIGINT", () => {
    void close().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void close().finally(() => process.exit(0));
  });
  process.stdin.once("end", () => {
    void close().finally(() => process.exit(0));
  });
  return { server, close };
}
