import { useLab } from "../store";
import { money } from "../demo";
export function AccountSummary() {
  const p = useLab((s) => s.data!.portfolio);
  return (
    <div className="stats">
      {[
        [
          "Saldo disponível",
          money(p.available),
          `${money(p.reserved)} reservado`,
        ],
        [
          "Patrimônio total",
          money(p.equity),
          `${p.returnPercent.toFixed(2)}% retorno ajustado a aportes`,
        ],
        [
          "P&L não realizado",
          money(p.unrealized),
          `${p.positions.length} posições abertas`,
        ],
        [
          "P&L realizado",
          money(p.realized),
          "Taxas de entrada e saída incluídas",
        ],
      ].map(([label, value, detail]) => (
        <div className="stat" key={label}>
          <div>{label}</div>
          <strong
            className={
              label.includes("P&L")
                ? String(value).startsWith("-")
                  ? "negative"
                  : "positive"
                : undefined
            }
          >
            {value}
          </strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  );
}
