import { useState } from "react";
import { useLab, run } from "./store";
import { money, date } from "./demo";
import { DataTable } from "./components/DataTable";
export function PositionPanels({ accountId = "main" }: { accountId?: string }) {
  const d = useLab((s) => s.data!),
    portfolio =
      accountId === "main"
        ? d.portfolio
        : d.agents.find((a) => a.accountId === accountId)?.portfolio;
  const [risk, setRisk] = useState<{ symbol: string; kind: string } | null>(
      null,
    ),
    [level, setLevel] = useState(""),
    [mode, setMode] = useState("price");
  const executions = d.executions
    .filter((e) => e.accountId === accountId)
    .slice(-10)
    .reverse();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Posições abertas · {portfolio?.positions.length ?? 0}</h2>
          <span className="tag">SALDO VIRTUAL</span>
        </div>
        <DataTable
          headers={[
            "Ativo",
            "Quantidade",
            "Entrada média",
            "Preço atual",
            "Valor / exposição",
            "P&L não realizado",
            "Proteções",
            "Ações",
          ]}
          rows={(portfolio?.positions ?? []).map((p) => [
            `${p.symbol} · ${p.direction === "short" ? "SHORT" : "LONG"}`,
            p.quantity.toPrecision(8),
            money(p.averagePrice),
            money(p.currentPrice),
            `${money(p.value)} / ${p.exposurePercent.toFixed(1)}%`,
            <span className={p.unrealized >= 0 ? "positive" : "negative"}>
              {money(p.unrealized)}
            </span>,
            `SL ${p.stopLoss === null ? "—" : money(p.stopLoss)} · TP ${p.takeProfit === null ? "—" : money(p.takeProfit)}`,
            <div className="inline-actions">
              <button
                onClick={() => {
                  setRisk({ symbol: p.symbol, kind: "set_stop_loss" });
                  setLevel("");
                }}
              >
                Stop
              </button>
              <button
                onClick={() => {
                  setRisk({ symbol: p.symbol, kind: "set_take_profit" });
                  setLevel("");
                }}
              >
                Alvo
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Encerrar ${p.symbol} a mercado?`))
                    void run("close_position", { accountId, symbol: p.symbol });
                }}
              >
                Fechar
              </button>
            </div>,
          ])}
        />
      </section>
      {risk && (
        <form
          className="panel form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await run(risk.kind, {
              accountId,
              symbol: risk.symbol,
              ...(mode === "percent"
                ? { percent: Number(level) }
                : { price: Number(level) }),
            });
            if (result) setRisk(null);
          }}
        >
          <h2>
            {risk.kind === "set_stop_loss" ? "Stop-loss" : "Take-profit"} ·{" "}
            {risk.symbol}
          </h2>
          <label>
            Modo
            <select
              aria-label="Modo"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="price">Preço absoluto</option>
              <option value="percent">Percentual da entrada</option>
            </select>
          </label>
          <label>
            Nível
            <input
              required
              type="number"
              step="any"
              min="0.00000001"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          </label>
          <button className="primary">Salvar proteção</button>
          <button
            type="button"
            onClick={async () => {
              await run(risk.kind, {
                accountId,
                symbol: risk.symbol,
                price: null,
              });
              setRisk(null);
            }}
          >
            Remover proteção
          </button>
          <button type="button" onClick={() => setRisk(null)}>
            Voltar
          </button>
        </form>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Execuções recentes</h2>
          <span>{executions.length} últimas</span>
        </div>
        <DataTable
          headers={[
            "Horário simulado",
            "Ativo",
            "Lado",
            "Quantidade",
            "Preço",
            "Taxa",
            "Slippage",
          ]}
          rows={executions.map((e) => [
            date(e.time),
            e.symbol,
            e.side === "buy" ? "Compra" : "Venda",
            e.quantity.toPrecision(8),
            money(e.price),
            money(e.fee),
            money(e.slippage),
          ])}
        />
      </section>
    </>
  );
}
