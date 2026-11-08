import { News, NewsFeed } from "./pages/News";
import { useEffect } from "react";
import { FlaskConical } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MarketTerminal } from "./MarketTerminal";
import { TimeControls } from "./TimeControls";
import { PositionPanels } from "./PositionPanels";
import { AccountSummary } from "./components/AccountSummary";
import { DataTable } from "./components/DataTable";
import { Trading } from "./pages/Trading";
import { Agents } from "./pages/Agents";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { MCP } from "./pages/MCP";
import { useLab, initialize } from "./store";
import { money, date } from "./demo";
export function App() {
  const s = useLab(),
    d = s.data;
  useEffect(() => initialize(), []);
  const chart = ["Visão geral", "Mercados", "Trading"].includes(s.page);
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
            <span className="version">v{d?.version ?? "0.2.0"}</span>
          </div>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <div className="eyebrow">MARKET LAB / TERMINAL LOCAL</div>
              <h1>{s.page}</h1>
              <p>
                Explore o mercado. Teste estratégias. Negocie exclusivamente com
                capital virtual.
              </p>
            </div>
            {d && (
              <div className="session">
                <i /> Seed {d.market.seed} ·{" "}
                {d.simulation.running ? "Em execução" : "Pausada"}
              </div>
            )}
          </div>
          <div className="notice">
            <FlaskConical size={14} />
            <span>
              Preços, saldos, ordens e resultados são sintéticos. Nenhuma
              transação financeira real.
            </span>
          </div>
          {s.error && (
            <div role="alert" className="notice error">
              {s.error}
              <button onClick={() => useLab.setState({ error: "" })}>
                Fechar aviso
              </button>
            </div>
          )}
          {!d ? (
            <section className="panel settings">
              <h2>
                {s.ready
                  ? "Backend local indisponível"
                  : "Carregando sessão persistida…"}
              </h2>
              <p>
                Abra o aplicativo Electron. O navegador isolado não executa uma
                segunda simulação.
              </p>
            </section>
          ) : (
            <>
              {["Visão geral", "Trading", "Portfólio"].includes(s.page) && (
                <AccountSummary />
              )}
              {chart && <MarketTerminal />}
              <TimeControls />
              {s.page === "Notícias" && <News />}
              {s.page === "Visão geral" && <NewsFeed compact />}
              {s.page === "Trading" && <Trading />}
              {["Visão geral", "Portfólio"].includes(s.page) && (
                <PositionPanels />
              )}
              {s.page === "Visão geral" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Eventos do mercado</h2>
                    <span>
                      Regime: {["lateral", "alta", "estresse"][d.market.regime]}
                    </span>
                  </div>
                  <DataTable
                    headers={["Horário simulado", "Tipo", "Descrição"]}
                    rows={[...d.market.events]
                      .reverse()
                      .slice(0, 20)
                      .map((e) => [date(e.time), e.kind, e.description])}
                  />
                </section>
              )}
              {s.page === "Mercados" && <MarketDetails />}
              {s.page === "Portfólio" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Histórico de fechamentos</h2>
                    <span>Valor investido: {money(d.portfolio.invested)}</span>
                  </div>
                  <DataTable
                    headers={[
                      "Ativo",
                      "Quantidade",
                      "Entrada",
                      "Saída",
                      "P&L líquido",
                      "Motivo",
                      "Fechamento",
                    ]}
                    rows={[...d.closed]
                      .filter((p) => p.accountId === "main")
                      .reverse()
                      .map((p) => [
                        p.symbol,
                        p.quantity,
                        money(p.entryPrice),
                        money(p.exitPrice),
                        money(p.pnl),
                        p.reason,
                        date(p.closedAt),
                      ])}
                  />
                </section>
              )}
              {s.page === "Agentes de IA" && <Agents />}
              {s.page === "Análises" && <Analytics />}
              {s.page === "Conexões MCP" && <MCP />}
              {s.page === "Configurações" && <Settings />}
            </>
          )}
          <footer>
            <span>
              <i /> {d ? "Backend local operacional" : "Aguardando backend"}{" "}
              <span className="divider">|</span> SQLite transacional{" "}
              <span className="divider">|</span>{" "}
              {d ? "Sessão carregada" : "Inicializando"}
            </span>
            <span>100% sintético · Sem serviços financeiros externos</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function MarketDetails() {
  const s = useLab(),
    q = s.data!.market.quotes.find((q) => q.symbol === s.symbol)!,
    closes = q.candles.map((c) => c.close);
  const mean = (v: number[]) =>
    v.length ? v.reduce((s, n) => s + n, 0) / v.length : 0;
  let gain = 0,
    loss = 0;
  for (let i = Math.max(1, closes.length - 14); i < closes.length; i++) {
    const x = closes[i] - closes[i - 1];
    gain += Math.max(0, x);
    loss += Math.max(0, -x);
  }
  return (
    <section className="panel settings">
      <h2>Indicadores sintéticos · {q.symbol}</h2>
      <p>
        SMA 10: {money(mean(closes.slice(-10)))} · SMA 30:{" "}
        {money(mean(closes.slice(-30)))} · RSI 14:{" "}
        {(gain + loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss)
        ).toFixed(2)}
      </p>
      <p>
        Spread atual: {money(q.ask - q.bid)} · Volume acumulado:{" "}
        {q.volume.toFixed(4)} · {q.candles.length} candles em memória, histórico
        completo no SQLite.
      </p>
    </section>
  );
}
