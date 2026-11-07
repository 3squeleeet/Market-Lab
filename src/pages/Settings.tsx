import { useState } from "react";
import { useLab, run } from "../store";
import { date } from "../demo";
import { DataTable } from "../components/DataTable";
export function Settings() {
  const s = useLab(),
    d = s.data!;
  const [vol, setVol] = useState(String(d.market.volatility)),
    [fee, setFee] = useState(String(d.config.feeBps)),
    [slip, setSlip] = useState(String(d.config.slippageBps)),
    [spread, setSpread] = useState(String(d.config.spreadBps)),
    [tick, setTick] = useState(String(d.simulation.tickMs)),
    [improve, setImprove] = useState(d.config.limitPriceImprovement),
    [action, setAction] = useState("price"),
    [value, setValue] = useState(""),
    [event, setEvent] = useState("volatility");
  return (
    <>
      <form
        className="panel form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void run("update_configuration", {
            volatility: Number(vol),
            feeBps: Number(fee),
            slippageBps: Number(slip),
            spreadBps: Number(spread),
            tickMs: Number(tick),
            limitPriceImprovement: improve,
          });
        }}
      >
        <h2>Configuração da simulação</h2>
        <p>
          Seed atual: {d.market.seed}. Altere no painel de desenvolvimento para
          iniciar outro experimento.
        </p>
        <label>
          Volatilidade
          <input
            required
            type="number"
            min="0.1"
            max="5"
            step="0.1"
            value={vol}
            onChange={(e) => setVol(e.target.value)}
          />
        </label>
        <label>
          Taxa de negociação (bps)
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
            value={slip}
            onChange={(e) => setSlip(e.target.value)}
          />
        </label>
        <label>
          Spread base (bps)
          <input
            required
            type="number"
            min="0"
            max="500"
            step="0.1"
            value={spread}
            onChange={(e) => setSpread(e.target.value)}
          />
        </label>
        <label>
          Intervalo por tick (ms reais a 1x)
          <input
            required
            type="number"
            min="100"
            max="10000"
            step="100"
            value={tick}
            onChange={(e) => setTick(e.target.value)}
          />
        </label>
        <label>
          Regra de execução limitada
          <select
            aria-label="Regra de execução limitada"
            value={String(improve)}
            onChange={(e) => setImprove(e.target.value === "true")}
          >
            <option value="true">Melhorar preço quando possível</option>
            <option value="false">Executar exatamente no limite</option>
          </select>
        </label>
        <button className="primary" disabled={s.pending > 0}>
          Salvar configurações
        </button>
        <p>
          Preferência visual: tema escuro. Velocidade e pausa ficam no controle
          de tempo. Mudanças são auditadas e persistidas.
        </p>
      </form>
      <section className="panel settings">
        <h2>Persistência local</h2>
        <p>
          SQLite · migrations v{d.database.schemaVersion} · salvamento
          transacional automático
        </p>
        <code>{d.database.path}</code>
        <p>
          Último salvamento:{" "}
          {new Date(d.database.lastSaved).toLocaleString("pt-BR")}
        </p>
      </section>
      <form
        className="panel form-grid admin-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            window.confirm(
              "Aplicar intervenção administrativa? Ela afeta a simulação e será registrada no log. Reiniciar/alterar seed arquiva a sessão e zera as contas do novo experimento.",
            )
          )
            void run("admin_intervene", {
              confirmed: true,
              action,
              ...(["freeze", "resume", "event"].includes(action)
                ? {}
                : { value: Number(value) }),
              ...(action === "price" ? { symbol: s.symbol } : {}),
              ...(action === "event" ? { event } : {}),
            });
        }}
      >
        <h2>Painel de desenvolvimento · somente interface local</h2>
        <label>
          Intervenção
          <select
            aria-label="Intervenção"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setValue("");
            }}
          >
            <option value="price">Alterar preço sintético</option>
            <option value="balance">Alterar saldo da conta principal</option>
            <option value="volatility">Alterar volatilidade</option>
            <option value="regime">
              Forçar regime (0 lateral, 1 alta, 2 estresse)
            </option>
            <option value="freeze">Congelar mercado</option>
            <option value="resume">Retomar mercado</option>
            <option value="event">Gerar evento sintético</option>
            <option value="advance">Avançar relógio (1–10.000 segundos)</option>
            <option value="reset">Reiniciar experimento com seed</option>
            <option value="seed">Alterar seed e reiniciar</option>
          </select>
        </label>
        {action === "price" && (
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
        )}
        {action === "event" ? (
          <label>
            Evento
            <select
              aria-label="Evento"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="volatility">Pico de volatilidade</option>
              <option value="crash">Queda repentina</option>
              <option value="rally">Alta forte</option>
              <option value="quiet">Baixa atividade</option>
              <option value="regime">Transição de regime</option>
            </select>
          </label>
        ) : (
          !["freeze", "resume"].includes(action) && (
            <label>
              Valor
              <input
                required
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )
        )}
        <button className="primary" disabled={s.pending > 0}>
          Revisar intervenção
        </button>
      </form>
      <section className="panel">
        <div className="panel-heading">
          <h2>Log administrativo e alterações</h2>
        </div>
        <DataTable
          headers={["Horário", "Origem", "Ação", "Detalhes"]}
          rows={[...d.audit]
            .reverse()
            .map((a) => [
              date(a.time),
              a.actor,
              a.action,
              <code>{JSON.stringify(a.details)}</code>,
            ])}
        />
      </section>
    </>
  );
}
