import { useState } from "react";
import { useLab, run } from "../store";
import { money, date } from "../demo";
import { DataTable } from "../components/DataTable";
import { PositionPanels } from "../PositionPanels";
export function Trading() {
  const s = useLab(),
    d = s.data!;
  const [accountId, setAccount] = useState("main"),
    [side, setSide] = useState("buy"),
    [type, setType] = useState("market"),
    [quantity, setQuantity] = useState("0.01"),
    [limit, setLimit] = useState(""),
    [sl, setSl] = useState(""),
    [tp, setTp] = useState(""),
    [riskMode, setRiskMode] = useState("price"),
    [confirm, setConfirm] = useState(false),
    [requestId, setRequestId] = useState(""),
    [submitted, setSubmitted] = useState("");
  const q = d.market.quotes.find((q) => q.symbol === s.symbol)!,
    pf =
      accountId === "main"
        ? d.portfolio
        : d.agents.find((a) => a.accountId === accountId)!.portfolio;
  const estimate =
    Number(quantity) *
    (type === "limit"
      ? Number(limit)
      : side === "buy"
        ? q.ask * (1 + d.config.slippageBps / 10000)
        : q.bid * (1 - d.config.slippageBps / 10000));
  const orders = d.orders.filter((o) => o.accountId === accountId);
  async function submit() {
    const reference = type === "limit" ? Number(limit) : q.price;
    const params: Record<string, unknown> = {
      accountId,
      requestId,
      symbol: s.symbol,
      side,
      quantity: Number(quantity),
      ...(type === "limit" ? { price: Number(limit) } : {}),
      ...(side === "buy" && sl
        ? {
            stopLoss:
              riskMode === "percent"
                ? reference * (1 - Number(sl) / 100)
                : Number(sl),
          }
        : {}),
      ...(side === "buy" && tp
        ? {
            takeProfit:
              riskMode === "percent"
                ? reference * (1 + Number(tp) / 100)
                : Number(tp),
          }
        : {}),
    };
    const result = await run<{ id: string; status: string }>(
      type === "market" ? "place_market_order" : "place_limit_order",
      params,
    );
    setConfirm(false);
    if (result)
      setSubmitted(
        `Ordem ${result.id}: ${result.status === "filled" ? "executada" : "pendente"}`,
      );
  }
  return (
    <>
      <section className="panel order-ticket">
        <div className="panel-heading">
          <h2>Nova ordem simulada · {s.symbol}</h2>
          <span>{money(pf.available)} disponível</span>
        </div>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setRequestId(crypto.randomUUID());
            setConfirm(true);
            setSubmitted("");
          }}
        >
          <label>
            Conta
            <select
              aria-label="Conta"
              value={accountId}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="main">Conta principal</option>
              {d.agents.map((a) => (
                <option key={a.id} value={a.accountId}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
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
            Lado
            <select
              aria-label="Lado"
              value={side}
              onChange={(e) => setSide(e.target.value)}
            >
              <option value="buy">Compra</option>
              <option value="sell">Venda</option>
            </select>
          </label>
          <label>
            Tipo
            <select
              aria-label="Tipo"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="market">Mercado</option>
              <option value="limit">Limitada</option>
            </select>
          </label>
          <label>
            Quantidade
            <input
              required
              type="number"
              min="0.00000001"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {type === "limit" && (
            <label>
              Preço limite
              <input
                required
                type="number"
                min="0.00000001"
                step="any"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
          )}
          {side === "buy" && (
            <>
              <label>
                Proteções
                <select
                  aria-label="Proteções"
                  value={riskMode}
                  onChange={(e) => setRiskMode(e.target.value)}
                >
                  <option value="price">Preço absoluto</option>
                  <option value="percent">Percentual da entrada</option>
                </select>
              </label>
              <label>
                Stop-loss (opcional)
                <input
                  type="number"
                  min="0.00000001"
                  step="any"
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                />
              </label>
              <label>
                Take-profit (opcional)
                <input
                  type="number"
                  min="0.00000001"
                  step="any"
                  value={tp}
                  onChange={(e) => setTp(e.target.value)}
                />
              </label>
            </>
          )}
          <div className="costs">
            <strong>
              Estimativa: {money(Number.isFinite(estimate) ? estimate : 0)}
            </strong>
            <p>
              Taxa{" "}
              {money(
                ((Number.isFinite(estimate) ? estimate : 0) * d.config.feeBps) /
                  10000,
              )}{" "}
              · {d.config.feeBps} bps · slippage {d.config.slippageBps} bps
            </p>
            <p>Ordens a mercado usam o bid/ask do instante da confirmação.</p>
          </div>
          <button className="primary" disabled={s.pending > 0}>
            Revisar ordem
          </button>
        </form>
        {confirm && (
          <div
            className="confirmation"
            role="dialog"
            aria-label="Confirmar ordem"
          >
            <strong>
              Confirmar {side === "buy" ? "compra" : "venda"} de {quantity}{" "}
              {s.symbol}?
            </strong>
            <p>
              Operação exclusivamente virtual; custos finais calculados pelo
              backend.
            </p>
            <button
              className="primary"
              disabled={s.pending > 0}
              onClick={() => void submit()}
            >
              Confirmar ordem
            </button>
            <button onClick={() => setConfirm(false)}>Voltar</button>
          </div>
        )}
        {submitted && <div className="notice">{submitted}</div>}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Ordens abertas</h2>
        </div>
        <DataTable
          headers={[
            "ID",
            "Ativo",
            "Lado",
            "Quantidade",
            "Limite",
            "Reserva",
            "Ação",
          ]}
          rows={orders
            .filter((o) => o.status === "pending")
            .map((o) => [
              o.id,
              o.symbol,
              o.side,
              o.quantity,
              money(o.requestedPrice!),
              o.side === "buy"
                ? money(
                    o.quantity *
                      o.requestedPrice! *
                      (1 + d.config.feeBps / 10000),
                  )
                : "Quantidade reservada",
              <button
                className="table-button"
                onClick={() =>
                  void run("cancel_order", { accountId, orderId: o.id })
                }
              >
                Cancelar
              </button>,
            ])}
        />
      </section>
      <PositionPanels accountId={accountId} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Histórico de ordens</h2>
        </div>
        <DataTable
          headers={[
            "ID / horário",
            "Ativo",
            "Tipo / lado",
            "Qtd.",
            "Solicitado",
            "Executado",
            "Status",
            "Motivo",
          ]}
          rows={[...orders]
            .reverse()
            .map((o) => [
              `${o.id} · ${date(o.createdAt)}`,
              o.symbol,
              `${o.type} / ${o.side}`,
              o.quantity,
              o.requestedPrice === null ? "Mercado" : money(o.requestedPrice),
              o.executedPrice === null ? "—" : money(o.executedPrice),
              o.status,
              o.reason ?? "—",
            ])}
        />
      </section>
    </>
  );
}
