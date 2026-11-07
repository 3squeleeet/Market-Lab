import { ArrowLeftRight } from "lucide-react";
import { engine, useLab } from "./store";
import { positions, money } from "./demo";
export function PositionPanels() {
  const s = useLab();
  const prices = Object.fromEntries(
    engine.quotes.map((q) => [q.symbol, q.price]),
  );
  return (
    <div className="lower-grid">
      <section className="panel positions">
        <div className="panel-heading">
          <h2>
            Posições ativas <span className="count">3</span>
          </h2>
          <span className="tag">DEMONSTRAÇÃO</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Quantidade</th>
              <th>Entrada</th>
              <th>Preço atual</th>
              <th>P&L não realizado</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const pl = p.quantity * (prices[p.symbol] - p.entry);
              return (
                <tr key={p.symbol}>
                  <td>
                    <strong>{p.symbol}</strong>
                    <span className="long">LONG</span>
                  </td>
                  <td>{p.quantity}</td>
                  <td>{money(p.entry)}</td>
                  <td>{money(prices[p.symbol])}</td>
                  <td className={pl >= 0 ? "positive" : "negative"}>
                    {pl >= 0 ? "+" : ""}
                    {money(pl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="panel trades">
        <div className="panel-heading">
          <h2>Operações recentes</h2>
          <ArrowLeftRight size={15} />
        </div>
        <div className="empty">
          <ArrowLeftRight size={23} />
          <strong>Pronto para o primeiro experimento</strong>
          <p>
            Nenhuma operação executada nesta sessão.
            <br />
            Execução de ordens prevista para a versão 0.2.
          </p>
        </div>
      </section>
    </div>
  );
}
