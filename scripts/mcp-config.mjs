import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../dist-electron/packages/mcp-server/src/cli.js", import.meta.url),
);
const index = process.argv.indexOf("--discovery");
const discovery = index >= 0 ? process.argv[index + 1] : undefined;
if (!existsSync(script) || !discovery || !existsSync(discovery)) {
  process.stderr.write(
    "Compile com npm run build; abra o aplicativo e informe --discovery com o caminho real exibido em Conexões MCP.\n",
  );
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          "market-lab": {
            command: process.execPath,
            args: [
              realpathSync(script),
              "--discovery",
              realpathSync(discovery),
            ],
          },
        },
      },
      null,
      2,
    ),
  );
