import { Activity } from "lucide-react";
import { useLab } from "./store";
import { Chart } from "./Chart";
import { price } from "./demo";
export function MarketTerminal() {
  const s = useLab();
  const engine = s.data!.market;
  const q = engine.quotes.find((q) => q.symbol === s.symbol)!;
  const change = (q.price / q.initial - 1) * 100;
  return (
    <div className="terminal-grid">
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div className="chart-title">
            <span className="coin btc">₿</span>
            <select
              aria-label="Ativo"
              value={s.symbol}
              onChange={(e) => s.setSymbol(e.target.value)}
            >
              {engine.quotes.map((q) => (
                <option key={q.symbol}>{q.symbol}</option>
              ))}
            </select>
            <span className="tag">SINTÉTICO</span>
          </div>
          <span className="market-open">
            <i /> Mercado ativo
          </span>
        </div>
        <div className="quote">
          <strong>{price(q.price)}</strong>
          <span className={change >= 0 ? "positive" : "negative"}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}% <small>na sessão</small>
          </span>
          <div className="quote-meta">
            <span>
              Compra <b>{price(q.bid)}</b>
            </span>
            <span>
              Venda <b>{price(q.ask)}</b>
            </span>
            <span>
              Volume <b>{q.volume.toFixed(2)}</b>
            </span>
          </div>
        </div>
        <div className="chart-toolbar">
          <div>
            {[1, 5, 15, 30, 60, 300, 900, 3600].map((n) => (
              <button
                key={n}
                className={s.interval === n ? "active" : ""}
                onClick={() => s.setInterval(n)}
              >
                {n < 60 ? n + "s" : n < 3600 ? n / 60 + "m" : "1h"}
              </button>
            ))}
          </div>
          <span>
            <Activity size={13} /> OHLCV
          </span>
        </div>
        <Chart />
        <div className="chart-footer">
          <span>Motor sintético · seed {s.data!.market.seed}</span>
          <span>TradingView Lightweight Charts™</span>
        </div>
      </section>
      <section className="panel markets">
        <div className="panel-heading">
          <h2>Mercados</h2>
          <span className="tag">8 ATIVOS</span>
        </div>
        <div className="table-head">
          <span>Ativo / preço</span>
          <span>Δ sessão</span>
        </div>
        {engine.quotes.map((a, i) => {
          const c = (a.price / a.initial - 1) * 100;
          return (
            <button
              className={
                "market-row " + (s.symbol === a.symbol ? "chosen" : "")
              }
              key={a.symbol}
              onClick={() => s.setSymbol(a.symbol)}
            >
              <span className={"coin coin-" + i}>
                {["₿", "Ξ", "◎", "⬡", "✕", "Ð", "₳", "▲"][i]}
              </span>
              <span className="asset-name">
                {a.symbol.split("/")[0]}
                <small>
                  {price(a.price)} <span>USD</span>
                </small>
              </span>
              <span className={c >= 0 ? "positive" : "negative"}>
                <svg viewBox="0 0 64 22">
                  <polyline
                    points={a.candles
                      .slice(-120)
                      .filter((_, j) => j % 6 === 0)
                      .slice(-20)
                      .map(
                        (d, j, arr) =>
                          `${j * 3.3},${20 - ((d.close - Math.min(...arr.map((x) => x.close))) / (Math.max(...arr.map((x) => x.close)) - Math.min(...arr.map((x) => x.close)) || 1)) * 18}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                {c >= 0 ? "+" : ""}
                {c.toFixed(2)}%
              </span>
            </button>
          );
        })}
        <div className="market-caption">
          <i /> Preços gerados localmente
        </div>
      </section>
    </div>
  );
}
