import { useState } from "react";
import { useLab, run } from "../store";
import { money, date } from "../demo";
import { DataTable } from "../components/DataTable";
import { LinePlot } from "../components/LinePlot";
export function Analytics() {
  const s = useLab(),
    d = s.data!,
    m = d.metrics;
  const [strategy, setStrategy] = useState("buy_hold"),
    [capital, setCapital] = useState("10000"),
    [fee, setFee] = useState(String(d.config.feeBps)),
    [slippage, setSlippage] = useState(String(d.config.slippageBps)),
    [start, setStart] = useState(
      String(d.market.quotes[0].candles[0]?.time ?? d.market.time - 3600),
    ),
    [end, setEnd] = useState(String(d.market.time)),
    [experiment, setExperiment] = useState("");
  const result =
    d.backtests.find((b) => b.id === experiment) ?? d.backtests.at(-1);
  return (
    <>
      <section className="panel settings">
        <h2>Desempenho da conta principal</h2>
        <p>
          Resultados calculados a partir das execuções persistidas. Operação =
          cada fechamento parcial ou total.
        </p>
        <div className="metric-grid">
          {[
            ["P&L total", money(m.totalPnl)],
            ["Retorno", m.returnPercent.toFixed(2) + "%"],
            ["Vitórias", m.winRate.toFixed(2) + "%"],
            ["Perdas", m.lossRate.toFixed(2) + "%"],
            ["Drawdown máximo", m.maxDrawdown.toFixed(2) + "%"],
            ["Lucro médio", money(m.averageProfit)],
            ["Prejuízo médio", money(m.averageLoss)],
            ["Melhor operação", money(m.bestTrade)],
            ["Pior operação", money(m.worstTrade)],
            ["Fechamentos", m.totalTrades],
            ["Volume negociado", money(m.volume)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <LinePlot
          values={d.equity.map((p) => p.equity)}
          label="Histórico de patrimônio"
        />
        <LinePlot
          values={d.equity.map((p) => p.realized)}
          label="Resultado realizado acumulado"
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Desempenho por ativo</h2>
        </div>
        <DataTable
          headers={[
            "Ativo",
            "P&L realizado",
            "Não realizado",
            "Volume",
            "Fechamentos",
          ]}
          rows={m.byAsset.map((a) => [
            a.symbol,
            money(a.realized),
            money(a.unrealized),
            money(a.volume),
            a.trades,
          ])}
        />
      </section>
      <form
        className="panel form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const b = await run<{ id: string }>("run_backtest", {
            symbol: s.symbol,
            start: Number(start),
            end: Number(end),
            capital: Number(capital),
            feeBps: Number(fee),
            slippageBps: Number(slippage),
            strategy,
          });
          if (b) setExperiment(b.id);
        }}
      >
        <h2>Backtesting isolado · candles do SQLite</h2>
        <label>
          Ativo
          <select
            aria-label="Ativo"
            value={s.symbol}
            onChange={(e) => s.setSymbol(e.target.value)}
          >
            {d.market.quotes.map((q) => (
              <option key={q.symbol}>{q.symbol}</option>
            ))}
          </select>
        </label>
        <label>
          Início (segundos UTC simulados)
          <input
            required
            type="number"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Fim (segundos UTC simulados)
          <input
            required
            type="number"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Capital inicial
          <input
            required
            type="number"
            min="1"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
        </label>
        <label>
          Taxa (bps)
          <input
            required
            type="number"
            min="0"
            max="1000"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
        <label>
          Slippage (bps)
          <input
            required
            type="number"
            min="0"
            max="500"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
          />
        </label>
        <label>
          Estratégia
          <select
            aria-label="Estratégia"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            <option value="buy_hold">Buy and Hold</option>
            <option value="sma">SMA 10/30</option>
            <option value="rsi">RSI 14 (30/70)</option>
          </select>
        </label>
        <button className="primary" disabled={s.pending > 0}>
          Executar backtest
        </button>
        <p>
          Decisão no candle anterior; execução na abertura seguinte. De 32 até
          199.999 candles por experimento.
        </p>
      </form>
      {d.backtests.length > 0 && (
        <section className="panel settings">
          <h2>Experimentos salvos</h2>
          <label>
            Resultado
            <select
              aria-label="Resultado"
              value={result?.id ?? ""}
              onChange={(e) => setExperiment(e.target.value)}
            >
              {d.backtests.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.config.strategy} · {b.config.symbol} · {date(b.createdAt)}
                </option>
              ))}
            </select>
          </label>
          {result && (
            <>
              <p>
                Capital: {money(result.config.capital)} · Patrimônio final:{" "}
                {money(result.finalEquity)} · Retorno:{" "}
                {result.metrics.returnPercent.toFixed(2)}% · Drawdown:{" "}
                {result.metrics.maxDrawdown.toFixed(2)}% · Fechamentos:{" "}
                {result.metrics.totalTrades}
              </p>
              <LinePlot
                values={result.equity.map((p) => p.equity)}
                label="Patrimônio do backtest"
              />
              <DataTable
                headers={["Horário", "Lado", "Quantidade", "Preço", "Taxa"]}
                rows={result.executions.map((e) => [
                  date(e.time),
                  e.side,
                  e.quantity.toPrecision(8),
                  money(e.price),
                  money(e.fee),
                ])}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
