import { useEffect, useState } from "react";
import { ArrowUpRight, FlaskConical, Bot, ExternalLink } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MarketTerminal } from "./MarketTerminal";
import { TimeControls } from "./TimeControls";
import { PositionPanels } from "./PositionPanels";
import { engine, clock, useLab, initialize, persist } from "./store";
import { unrealized } from "../packages/trading-engine/src/index";
import { positions, money } from "./demo";
export function App() {
  const s = useLab();
  const [seed, setSeed] = useState(42);
  const [vol, setVol] = useState(1);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval>;
    let saver: ReturnType<typeof setInterval>;
    initialize().then(() => {
      if (stopped) return;
      setSeed(engine.seed);
      setVol(engine.volatility);
      let last = performance.now();
      timer = setInterval(() => {
        const now = performance.now();
        const before = engine.ticks;
        clock.advance(now - last, () => engine.step());
        last = now;
        if (engine.ticks !== before) useLab.getState().refresh();
      }, 100);
      saver = setInterval(() => void persist(), 5000);
    });
    const save = () => void persist();
    window.addEventListener("beforeunload", save);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(saver);
      window.removeEventListener("beforeunload", save);
    };
  }, []);
  const prices = Object.fromEntries(
    engine.quotes.map((q) => [q.symbol, q.price]),
  );
  const pnl = unrealized(positions, prices);
  const cost = positions.reduce((a, p) => a + p.entry * p.quantity, 0);
  const cash = 100000 - cost;
  const main = ["Visão geral", "Mercados", "Trading"].includes(s.page);
  return (
    <div className="app">
      <Sidebar />
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{s.page}</b>
          </div>
          <div className="header-right">
            <span className="sim-badge">
              <i /> AMBIENTE SIMULADO
            </span>
            <span className="version">v0.1.0</span>
          </div>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <div className="eyebrow">MARKET LAB / TERMINAL</div>
              <h1>{s.page}</h1>
              <p>Explore o mercado. Teste ideias. Entenda os movimentos.</p>
            </div>
            <div className="session">
              <i /> Sessão #{String(s.seed).padStart(4, "0")} <span>•</span>{" "}
              <span>{s.running ? "Em execução" : "Pausada"}</span>
            </div>
          </div>
          {s.error && (
            <div role="alert" className="notice">
              {s.error}
            </div>
          )}
          <div className="notice">
            <FlaskConical size={14} />
            <span>
              Todos os preços, saldos e resultados são sintéticos. Nenhuma
              transação financeira real.
            </span>
            <span className="notice-label">SIMULAÇÃO</span>
          </div>
          {(main || s.page === "Portfólio") && (
            <div className="stats">
              {[
                [
                  "Saldo disponível",
                  money(cash),
                  "Capital virtual disponível",
                  "",
                ],
                [
                  "Patrimônio total",
                  money(100000 + pnl),
                  `${pnl >= 0 ? "+" : ""}${money(pnl)} desde o início`,
                  pnl >= 0 ? "positive" : "negative",
                ],
                [
                  "P&L não realizado",
                  money(pnl),
                  "3 posições de demonstração",
                  pnl >= 0 ? "positive" : "negative",
                ],
                ["P&L realizado", money(0), "Nenhuma operação executada", ""],
              ].map(([label, value, detail, color]) => (
                <div className="stat" key={label}>
                  <div>
                    {label}
                    <ArrowUpRight size={14} />
                  </div>
                  <strong className={color}>{value}</strong>
                  <small className={color}>{detail}</small>
                </div>
              ))}
            </div>
          )}
          {main ? (
            <>
              <MarketTerminal />
              <TimeControls />
            </>
          ) : null}
          {(main || s.page === "Portfólio") && <PositionPanels />}
          {s.page === "Trading" && (
            <div className="notice">
              O gráfico e as cotações estão ativos. Envio e execução de ordens
              ainda não estão disponíveis.
            </div>
          )}
          {s.page === "Configurações" && (
            <section className="panel settings">
              <h2>Configuração do experimento</h2>
              <p>
                Aplicar inicia uma nova trajetória determinística. As posições
                são dados de demonstração.
              </p>
              <label>
                Seed
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
              </label>
              <label>
                Volatilidade (0,1–5)
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={vol}
                  onChange={(e) => setVol(Number(e.target.value))}
                />
              </label>
              <button
                className="primary"
                disabled={
                  !Number.isSafeInteger(seed) ||
                  vol < 0.1 ||
                  vol > 5 ||
                  !Number.isFinite(vol)
                }
                onClick={() => {
                  s.reset(seed, vol);
                  void persist();
                }}
              >
                Aplicar e reiniciar
              </button>
              <p>
                Persistência:{" "}
                {window.marketLab
                  ? "SQLite local via Electron"
                  : "localStorage — prévia no navegador"}
                . Salvamento automático a cada 5 segundos.
              </p>
            </section>
          )}
          {s.page === "Análises" && (
            <section className="panel settings">
              <h2>Diagnóstico do mercado sintético</h2>
              <p>
                Regime atual: {["Lateral", "Alta", "Estresse"][engine.regime]}
              </p>
              <p>
                {engine.ticks.toLocaleString()} ticks gerados · fator comum{" "}
                {engine.factor.toFixed(4)} · volatilidade {s.volatility}x
              </p>
              <p>
                Retornos correlacionados, distribuição lognormal e OHLCV
                agregados pelo relógio da simulação.
              </p>
            </section>
          )}
          {["Agentes de IA", "Conexões MCP"].includes(s.page) && (
            <section className="panel placeholder">
              <Bot size={40} />
              <h2>{s.page}</h2>
              <p>
                Interfaces do módulo preparadas. Integração e execução ainda não
                implementadas nesta versão.
              </p>
              <span className="tag">PRÓXIMO MARCO</span>
            </section>
          )}
          <footer>
            <span>
              <i /> Motor operacional <span className="divider">|</span>{" "}
              Execução local <span className="divider">|</span>{" "}
              {s.ready ? "Sessão carregada" : "Carregando sessão…"}
            </span>
            <span>
              Feito para experimentar. Projetado para aprender.{" "}
              <ExternalLink size={12} />
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
