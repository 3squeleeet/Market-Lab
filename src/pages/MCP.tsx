import { useState } from "react";
import { useLab } from "../store";
export function MCP() {
  const m = useLab((s) => s.data!.mcp),
    [copied, setCopied] = useState("");
  return (
    <section className="panel settings">
      <h2>MCP local · STDIO</h2>
      <p>
        {m?.enabled
          ? "Instância local pronta para receber comandos"
          : "Integração local indisponível"}
      </p>
      <p>
        Clientes STDIO ativos: {m?.connections ?? 0} · Protocolo:{" "}
        {m?.protocol ?? "—"}
      </p>
      <p>
        {m?.connections
          ? "Cliente conectado recentemente; heartbeat expira em 30 segundos."
          : "Nenhum cliente MCP conectado. Não há sessão ativa com Claude neste momento."}
      </p>
      {m && (
        <>
          <h3>Configuração real desta instalação</h3>
          <p>
            Mantenha o Market Lab aberto. Use o executável instalado ou a pasta
            extraída do aplicativo; caminhos de uma versão portátil
            autoextraível podem ser temporários.
          </p>
          <p>
            Arquivo de descoberta local (contém credencial; não compartilhe):
          </p>
          <code>{m.configPath}</code>
          <p>
            Mescle o JSON abaixo em claude_desktop_config.json. No Claude
            Desktop: Configurações → Desenvolvedor → Editar configuração.
            Reinicie o Claude após salvar.
          </p>
          <pre>{JSON.stringify(m.configuration, null, 2)}</pre>
          <button
            className="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(m.configuration, null, 2),
                );
                setCopied("Configuração copiada.");
              } catch {
                setCopied(
                  "Não foi possível copiar automaticamente. Selecione o JSON acima.",
                );
              }
            }}
          >
            Copiar configuração
          </button>
          <p role="status">{copied}</p>
          <h3>Claude Code</h3>
          <p>
            Use <code>claude mcp add-json market-lab</code> seguido do objeto{" "}
            <code>market-lab</code> acima como argumento JSON. Os caminhos já
            refletem esta máquina.
          </p>
          <h3>Ferramentas disponíveis ({m.tools.length})</h3>
          <div className="tool-list">
            {m.tools.map((t) => (
              <code key={t}>{t}</code>
            ))}
          </div>
          <h3>Logs da integração</h3>
          {m.logs.length ? (
            m.logs.map((l, i) => (
              <p key={i}>
                {new Date(l.time).toLocaleTimeString("pt-BR")} · {l.message}
              </p>
            ))
          ) : (
            <p>Nenhuma ocorrência.</p>
          )}
          <p>
            O Claude opera na sua conta principal e no mesmo patrimônio virtual exibido no terminal. Não há ferramentas
            administrativas, acesso arbitrário a arquivos, comandos de terminal
            ou integrações financeiras reais.
          </p>
        </>
      )}
    </section>
  );
}
