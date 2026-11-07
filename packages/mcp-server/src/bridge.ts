import net from "node:net";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { Reply } from "../../shared/src/index.js";
import { MCP_TOOLS } from "../../shared/src/commands.js";
import type { LabService } from "../../core/src/index.js";
const discoverySchema = z
  .object({
    endpoint: z.string().min(1).max(300),
    token: z.string().length(64),
    pid: z.number().int().positive(),
    version: z.literal(1),
  })
  .strict();
const requestSchema = z
  .object({
    token: z.string().length(64),
    sessionId: z.string().min(1).max(100),
    tool: z.string().min(1).max(100),
    args: z.unknown().optional(),
  })
  .strict();
export function bridgeEndpoint(
  directory: string,
  pid = process.pid,
  platform: NodeJS.Platform = process.platform,
) {
  const hash = createHash("sha256")
    .update(directory)
    .digest("hex")
    .slice(0, 12);
  return platform === "win32"
    ? String.raw`\\.\pipe\market-lab-${hash}-${pid}`
    : path.join(os.tmpdir(), `ml-${hash}-${pid}.sock`);
}
export async function startBridge(
  service: LabService,
  directory: string,
  command: string,
  args: string[],
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const configPath = path.join(directory, "mcp-instance.json"),
    token = randomBytes(32).toString("hex"),
    endpoint = bridgeEndpoint(directory);
  const clients = new Map<string, number>();
  const logs: { time: number; message: string }[] = [];
  const log = (message: string) => {
    logs.push({ time: Date.now(), message });
    if (logs.length > 100) logs.shift();
  };
  const status = () => {
    const now = Date.now();
    for (const [id, seen] of clients)
      if (now - seen > 30000) clients.delete(id);
    service.mcpStatus = {
      enabled: true,
      transport: "stdio",
      protocol: LATEST_PROTOCOL_VERSION,
      connections: clients.size,
      lastSeen: clients.size ? Math.max(...clients.values()) : null,
      tools: MCP_TOOLS,
      configPath,
      configuration: {
        mcpServers: {
          "market-lab": { command, args: [...args, "--discovery", configPath] },
        },
      },
      logs: [...logs],
    };
  };
  const server = net.createServer((socket) => {
    let data = "",
      processed = false;
    socket.setTimeout(15000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      if (processed) return;
      data += chunk.toString();
      if (Buffer.byteLength(data) > 1048576) {
        socket.destroy();
        return;
      }
      if (!data.includes("\n")) return;
      processed = true;
      let reply: Reply;
      try {
        const req = requestSchema.parse(JSON.parse(data.split("\n")[0]));
        const received = Buffer.from(req.token),
          expected = Buffer.from(token);
        if (
          received.length !== expected.length ||
          !timingSafeEqual(received, expected)
        )
          throw Error("Autenticação local inválida");
        if (req.tool === "__hello") {
          clients.set(req.sessionId, Date.now());
          reply = {
            ok: true,
            data: { available: true, protocol: LATEST_PROTOCOL_VERSION },
          };
        } else if (req.tool === "__bye") {
          clients.delete(req.sessionId);
          reply = { ok: true, data: null };
        } else {
          if (!MCP_TOOLS.includes(req.tool as (typeof MCP_TOOLS)[number]))
            throw Error("Ferramenta MCP não permitida");
          clients.set(req.sessionId, Date.now());
          reply = {
            ok: true,
            data: service.execute(req.tool, req.args ?? {}, "mcp"),
          };
        }
        status();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha local";
        log(message);
        status();
        reply = { ok: false, error: { code: "LOCAL_REQUEST", message } };
      }
      socket.end(JSON.stringify(reply) + "\n");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => resolve());
  });
  if (process.platform !== "win32") chmodSync(endpoint, 0o600);
  writeFileSync(
    configPath,
    JSON.stringify({ endpoint, token, pid: process.pid, version: 1 }),
    { mode: 0o600 },
  );
  if (process.platform !== "win32") chmodSync(configPath, 0o600);
  log("Instância local pronta. Aguardando clientes STDIO.");
  status();
  const timer = setInterval(status, 5000);
  timer.unref();
  let closed = false;
  return {
    configPath,
    status,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      server.close();
      try {
        unlinkSync(configPath);
      } catch {}
      if (process.platform !== "win32")
        try {
          unlinkSync(endpoint);
        } catch {}
    },
  };
}
export async function bridgeRequest(
  discoveryPath: string,
  sessionId: string,
  tool: string,
  args: unknown = {},
): Promise<Reply> {
  let discovery: z.infer<typeof discoverySchema>;
  try {
    discovery = discoverySchema.parse(
      JSON.parse(readFileSync(discoveryPath, "utf8")),
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message:
          "Market Lab indisponível. Abra o aplicativo local e copie a configuração MCP do painel Conexões MCP.",
      },
    };
  }
  return new Promise((resolve) => {
    let data = "",
      done = false;
    const finish = (r: Reply) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    const socket = net.createConnection(discovery.endpoint, () =>
      socket.write(
        JSON.stringify({ token: discovery.token, sessionId, tool, args }) +
          "\n",
      ),
    );
    socket.setTimeout(15000, () =>
      finish({
        ok: false,
        error: {
          code: "TIMEOUT",
          message: "A instância local não respondeu a tempo.",
        },
      }),
    );
    socket.on("error", () =>
      finish({
        ok: false,
        error: {
          code: "UNAVAILABLE",
          message:
            "Instância local fechada ou indisponível. Abra o Market Lab.",
        },
      }),
    );
    socket.on("data", (chunk) => {
      data += chunk.toString();
      if (Buffer.byteLength(data) > 33554432) {
        finish({
          ok: false,
          error: {
            code: "SIZE",
            message: "Resposta muito grande; reduza o período ou limite.",
          },
        });
        return;
      }
      if (data.includes("\n"))
        try {
          const raw = JSON.parse(data.split("\n")[0]) as Reply;
          if (typeof raw.ok !== "boolean") throw Error();
          finish(raw);
        } catch {
          finish({
            ok: false,
            error: { code: "PROTOCOL", message: "Resposta local inválida." },
          });
        }
    });
    socket.on("end", () => {
      if (!done)
        finish({
          ok: false,
          error: {
            code: "PROTOCOL",
            message: "Conexão encerrada sem resposta.",
          },
        });
    });
  });
}
