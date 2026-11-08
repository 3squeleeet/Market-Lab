import { useState } from "react";
import { Newspaper, Send, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useLab, run } from "../store";
import { date } from "../demo";
export function NewsFeed({ compact = false }: { compact?: boolean }) {
  const s = useLab(),
    news = s.data!.news ?? [];
  return (
    <section className="panel news-feed">
      <div className="panel-heading">
        <h2>
          <Newspaper size={16} /> Radar de notícias
        </h2>
        <span className="tag">TEXTO PÚBLICO · MERCADO SINTÉTICO</span>
      </div>
      {news.length ? (
        [...news]
          .reverse()
          .slice(0, compact ? 3 : 30)
          .map((n) => (
            <article className="news-item" key={n.id}>
              <span className="news-dot" />
              <div>
                <small>{date(n.time)}</small>
                <p>{n.text}</p>
              </div>
            </article>
          ))
      ) : (
        <div className="empty-row">
          Seu radar está pronto. Publique a primeira notícia para iniciar um
          cenário.
        </div>
      )}
      {compact && (
        <button className="news-link" onClick={() => s.setPage("Notícias")}>
          Abrir central de notícias <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}
export function News() {
  const s = useLab(),
    [text, setText] = useState(""),
    [symbol, setSymbol] = useState(s.symbol),
    [direction, setDirection] = useState("up"),
    [percent, setPercent] = useState("5"),
    [sent, setSent] = useState(false),
    [delay, setDelay] = useState("0"),
    [duration, setDuration] = useState("0");
  return (
    <>
      <div className="news-editor-grid">
        <form
          className="panel news-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !window.confirm(
                "Publicar a notícia com a programação escolhida? Ordens e proteções podem ser executadas quando o impacto ocorrer.",
              )
            )
              return;
            const result = await run("publish_news", {
              text,
              symbol,
              percent: Number(percent) * (direction === "down" ? -1 : 1),
              delaySeconds: Number(delay),
              durationSeconds: Number(duration),
            });
            if (result) {
              setText("");
              setSent(true);
            }
          }}
        >
          <div className="panel-heading">
            <h2>
              <Newspaper size={16} /> Criar cenário de notícia
            </h2>
            <span className="tag">CONTROLE DO USUÁRIO</span>
          </div>
          <div className="news-fields">
            <label>
              Texto que o Claude vai ler
              <textarea
                required
                maxLength={10000}
                rows={7}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSent(false);
                }}
                placeholder="Escreva um anúncio, rumor ou acontecimento do seu mercado…"
              />
            </label>
            <div className="news-impact">
              <label>
                Gráfico / ativo
                <select
                  aria-label="Gráfico / ativo"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                >
                  {s.data!.market.quotes.map((q) => (
                    <option key={q.symbol}>{q.symbol}</option>
                  ))}
                </select>
              </label>
              <label>
                Direção
                <select
                  aria-label="Direção"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="up">Para cima ↑</option>
                  <option value="down">Para baixo ↓</option>
                </select>
              </label>
              <label>
                Impacto (%)
                <input
                  required
                  type="number"
                  min="0.01"
                  max={direction === "down" ? 99 : 1000}
                  step="0.01"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </label>
            </div>
            <div className="news-impact">
              <label>
                Aplicar após (segundos simulados)
                <input
                  required
                  type="number"
                  min="0"
                  max="604800"
                  step="1"
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                />
              </label>
              <label>
                Duração do movimento (segundos)
                <input
                  required
                  type="number"
                  min="0"
                  max="86400"
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </label>
            </div>
            <p>
              0 = imediato. A pausa interrompe a contagem; a velocidade da
              simulação acelera os prazos. Atraso, duração e percentual não são
              enviados ao Claude.
            </p>
            <div className="private-impact">
              {direction === "up" ? (
                <ArrowUpRight size={18} />
              ) : (
                <ArrowDownRight size={18} />
              )}
              <span>
                {symbol} · {direction === "up" ? "+" : "−"}
                {percent}%
                <small>
                  Configuração privada. O Claude recebe o texto, sem esse
                  ajuste.
                </small>
              </span>
            </div>
            <button className="primary" disabled={s.pending > 0}>
              <Send size={15} /> Publicar notícia e aplicar impacto
            </button>
            {sent && (
              <p role="status" className="positive">
                Notícia publicada. O impacto segue a programação escolhida.
              </p>
            )}
          </div>
        </form>
        <section className="panel news-explainer">
          <span className="eyebrow">EXPERIMENTOS COM INFORMAÇÃO</span>
          <h2>
            Você cria o cenário.
            <br />O Claude interpreta.
          </h2>
          <p>
            O texto entra no radar público. O ativo escolhido recebe a variação
            percentual no prazo definido. Movimentos graduais somam o impacto
            escolhido às oscilações naturais do mercado.
          </p>
          <p>
            O impacto configurado fica no log administrativo, que o MCP não pode
            consultar. O Claude pode observar os preços e tirar as próprias
            conclusões.
          </p>
          <div className="news-example">
            <span>01</span> Escreva a notícia
            <br />
            <span>02</span> Escolha o gráfico e o impacto
            <br />
            <span>03</span> Veja como o Claude reage
          </div>
        </section>
      </div>
      <section className="panel settings">
        <h2>Programação privada dos impactos</h2>
        {(s.data!.newsSchedule ?? []).length ? (
          (s.data!.newsSchedule ?? [])
            .slice()
            .reverse()
            .map((plan) => (
              <p key={plan.newsId}>
                <strong>
                  {plan.symbol} · {plan.percent > 0 ? "+" : ""}
                  {plan.percent}%
                </strong>{" "}
                ·{" "}
                {plan.status === "completed"
                  ? "Concluído"
                  : plan.status === "active"
                    ? `Em andamento (${plan.appliedSteps}/${plan.totalSteps}s)`
                    : `Aguardando ${Math.max(0, plan.startTime - s.data!.market.time)}s`}{" "}
                · duração {plan.durationSeconds}s
              </p>
            ))
        ) : (
          <p>Nenhum impacto programado.</p>
        )}
        <p>
          Este painel e os parâmetros não são expostos pelas ferramentas MCP.
        </p>
      </section>
      <NewsFeed />
    </>
  );
}
