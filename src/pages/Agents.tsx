import { useState } from "react";
import { useLab, run } from "../store";
import { SYMBOLS } from "../../packages/shared/src/index";
import { money, date } from "../demo";
import { DataTable } from "../components/DataTable";
export function Agents() {
  const s = useLab(),
    d = s.data!;
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [assets, setAssets] = useState<string[]>(["BTC/USD"]),
    [capital, setCapital] = useState("10000"),
    [exposure, setExposure] = useState("50"),
    [strategy, setStrategy] = useState("sma"),
    [selected, setSelected] = useState(""),
    [editing, setEditing] = useState("");
  const active = d.agents.find((a) => a.id === selected);
  return (
    <>
      <form
        className="panel form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const a = await run<{ id: string }>(
            editing ? "update_agent" : "create_agent",
            {
              ...(editing
                ? { agentId: editing }
                : { capital: Number(capital) }),
              name,
              description,
              assets,
              maxExposure: Number(exposure) / 100,
              strategy,
            },
          );
          if (a) {
            setSelected(a.id);
            setName("");
            setEditing("");
          }
        }}
      >
        <h2>{editing ? "Editar agente" : "Criar agente · conta isolada"}</h2>
        <label>
          Nome
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Descrição
          <input
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Capital virtual
          <input
            required
            disabled={!!editing}
            type="number"
            min="1"
            max="1000000000"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
        </label>
        <label>
          Exposição máxima (%)
          <input
            required
            type="number"
            min="1"
            max="100"
            value={exposure}
            onChange={(e) => setExposure(e.target.value)}
          />
        </label>
        <label>
          Estratégia
          <select
            aria-label="Estratégia"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            <option value="sma">Cruzamento SMA 10/30</option>
            <option value="rsi">RSI 14 (30/70)</option>
            <option value="buy_hold">Buy and Hold</option>
            <option value="external">Externo via MCP / manual</option>
          </select>
        </label>
        <fieldset>
          <legend>Ativos autorizados</legend>
          {SYMBOLS.map((symbol) => (
            <label className="check" key={symbol}>
              <input
                type="checkbox"
                checked={assets.includes(symbol)}
                onChange={(e) =>
                  setAssets(
                    e.target.checked
                      ? [...assets, symbol]
                      : assets.filter((x) => x !== symbol),
                  )
                }
              />
              {symbol}
            </label>
          ))}
        </fieldset>
        <button
          className="primary"
          disabled={s.pending > 0 || assets.length === 0}
        >
          {editing ? "Salvar agente" : "Criar agente"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing("");
              setName("");
            }}
          >
            Cancelar edição
          </button>
        )}
      </form>
      <section className="panel">
        <div className="panel-heading">
          <h2>Comparação de agentes</h2>
          <span>Decisões locais a cada 15 segundos simulados</span>
        </div>
        <DataTable
          headers={[
            "Nome / controle",
            "Estratégia",
            "Estado",
            "Patrimônio",
            "P&L / retorno",
            "Exposição máxima",
            "Ações",
          ]}
          rows={d.agents.map((a) => [
            <button onClick={() => setSelected(a.id)}>
              {a.name} · {a.owner === "mcp" ? "MCP" : "Local"}
            </button>,
            a.strategy,
            a.status,
            money(a.portfolio.equity),
            `${money(a.metrics.totalPnl)} / ${a.metrics.returnPercent.toFixed(2)}%`,
            `${a.maxExposure * 100}%`,
            <div className="inline-actions">
              <button onClick={() => setSelected(a.id)}>Detalhes</button>
              {a.status !== "stopped" && (
                <button
                  onClick={() => {
                    setEditing(a.id);
                    setSelected(a.id);
                    setName(a.name);
                    setDescription(a.description);
                    setAssets(a.assets);
                    setCapital(String(a.capital));
                    setExposure(String(a.maxExposure * 100));
                    setStrategy(a.strategy);
                  }}
                >
                  Editar
                </button>
              )}
              {a.status !== "stopped" && (
                <>
                  <button
                    onClick={() =>
                      void run(
                        a.status === "running" ? "pause_agent" : "resume_agent",
                        { agentId: a.id },
                      )
                    }
                  >
                    {a.status === "running" ? "Pausar" : "Retomar"}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Encerrar agente, cancelar ordens e liquidar posições?",
                        )
                      )
                        void run("stop_agent", { agentId: a.id });
                    }}
                  >
                    Encerrar
                  </button>
                </>
              )}
            </div>,
          ])}
        />
      </section>
      {active && (
        <>
          <section className="panel settings">
            <h2>{active.name}</h2>
            <p>{active.description}</p>
            <p>
              Ativos: {active.assets.join(", ")} · Saldo:{" "}
              {money(active.portfolio.available)} · Posições:{" "}
              {active.portfolio.positions.length}
            </p>
            <p>
              Drawdown: {active.metrics.maxDrawdown.toFixed(2)}% · Taxa de
              vitórias: {active.metrics.winRate.toFixed(2)}% · Volume:{" "}
              {money(active.metrics.volume)}
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Decisões · {active.name}</h2>
            </div>
            <DataTable
              headers={["Horário", "Ação", "Motivo", "Ordem"]}
              rows={[...active.history]
                .reverse()
                .map((h) => [
                  date(h.time),
                  h.action,
                  h.reason,
                  h.orderId ?? "—",
                ])}
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Operações do agente</h2>
            </div>
            <DataTable
              headers={[
                "Horário",
                "Ativo",
                "Lado",
                "Quantidade",
                "Preço",
                "Taxa",
              ]}
              rows={d.executions
                .filter((e) => e.accountId === active.accountId)
                .reverse()
                .map((e) => [
                  date(e.time),
                  e.symbol,
                  e.side,
                  e.quantity,
                  money(e.price),
                  money(e.fee),
                ])}
            />
          </section>
        </>
      )}
    </>
  );
}
