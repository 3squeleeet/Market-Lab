import { startMCP } from "./index.js";
const index = process.argv.indexOf("--discovery");
const discovery = index >= 0 ? process.argv[index + 1] : undefined;
if (!discovery) {
  process.stderr.write(
    "Informe --discovery com o caminho exibido no painel Conexões MCP do aplicativo.\n",
  );
  process.exitCode = 1;
} else
  startMCP(discovery).catch((e) => {
    process.stderr.write(
      `Falha MCP: ${e instanceof Error ? e.message : "erro desconhecido"}\n`,
    );
    process.exitCode = 1;
  });
