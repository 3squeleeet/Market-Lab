import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { aggregate } from "../packages/market-engine/src/index";
import { useLab } from "./store";
export function Chart() {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const { symbol, interval, revision, data: state } = useLab();
  const previous = useRef("");
  const lastDrawn = useRef(0);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const entryLines = useRef<IPriceLine[]>([]);
  const quote = state?.market.quotes.find((q) => q.symbol === symbol);
  const lastCandle = quote?.candles.at(-1);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#101419" },
        textColor: "#727e8d",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a2027" },
        horzLines: { color: "#1a2027" },
      },
      rightPriceScale: { borderColor: "#252c34" },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 24,
        borderColor: "#252c34",
      },
      crosshair: { mode: 0 },
    });
    chart.current = c;
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: "#2dcc9b",
      downColor: "#ef7078",
      borderVisible: false,
      wickUpColor: "#2dcc9b",
      wickDownColor: "#ef7078",
    });
    markers.current = createSeriesMarkers(candles.current, []);
    candles.current
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });
    volume.current = c.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    volume.current
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    return () => {
      c.remove();
      chart.current = null;
      markers.current = null;
      entryLines.current = [];
      previous.current = "";
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const q = state.market.quotes.find((q) => q.symbol === symbol)!;
    const data = aggregate(q.candles, interval);
    if (!data.length) return;
    const key =
      state.sessionId +
      symbol +
      interval +
      (q.candles.length > 240 ? "full" : "recent");
    if (previous.current !== key || data.at(-1)!.time < lastDrawn.current) {
      candles.current?.setData(
        data.map((d) => ({ ...d, time: d.time as Time })),
      );
      volume.current?.setData(
        data.map((d) => ({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? "#20483f" : "#4a2c35",
        })),
      );
      chart.current?.timeScale().fitContent();
      previous.current = key;
    } else
      for (const d of data.filter((d) => d.time >= lastDrawn.current)) {
        candles.current?.update({ ...d, time: d.time as Time });
        volume.current?.update({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? "#20483f" : "#4a2c35",
        });
      }
    lastDrawn.current = data.at(-1)?.time ?? 0;
  }, [
    symbol,
    interval,
    state?.sessionId,
    lastCandle?.time,
    lastCandle?.close,
    quote?.candles.length,
  ]);
  const executionKey = state?.executions.at(-1)?.id;
  const positionKey = state?.portfolio.positions
    .map((p) => `${p.id}:${p.averagePrice}:${p.quantity}`)
    .join("|");
  useEffect(() => {
    if (!state || !markers.current || !quote?.candles.length) return;
    const first = Math.floor(quote.candles[0].time / interval) * interval,
      last = Math.floor(quote.candles.at(-1)!.time / interval) * interval;
    const points = state.executions
      .filter((e) => e.accountId === "main" && e.symbol === symbol)
      .slice(-40)
      .map((e) => {
        const order = state.orders.find((o) => o.id === e.orderId),
          short = order?.positionSide === "short",
          opening = short ? e.side === "sell" : e.side === "buy",
          tag =
            order?.source === "mcp"
              ? "Claude"
              : order?.source === "agent"
                ? "Agente"
                : order?.source === "risk"
                  ? "Risco"
                  : "Manual";
        return {
          time: (Math.floor(e.time / interval) * interval) as Time,
          position:
            e.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          shape:
            e.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          color: opening ? (short ? "#ff7c8b" : "#57e0ad") : "#8ebdf9",
          text: `${tag} ${opening ? (short ? "SHORT" : "LONG") : "FECHA"} @ ${e.price < 1 ? e.price.toFixed(5) : e.price.toFixed(2)}`,
        };
      })
      .filter((m) => Number(m.time) >= first && Number(m.time) <= last)
      .sort((a, b) => Number(a.time) - Number(b.time));
    markers.current.setMarkers(points);
  }, [symbol, interval, executionKey, state?.sessionId, lastCandle?.time]);
  useEffect(() => {
    const series = candles.current;
    if (!series || !state) return;
    for (const line of entryLines.current) series.removePriceLine(line);
    entryLines.current = state.portfolio.positions
      .filter((p) => p.symbol === symbol)
      .map((p) =>
        series.createPriceLine({
          price: p.averagePrice,
          color: p.direction === "short" ? "#f9788d" : "#61dab0",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${p.direction === "short" ? "SHORT" : "LONG"} · entrada`,
        }),
      );
  }, [symbol, positionKey, state?.sessionId]);
  return <div className="chart" ref={el} />;
}
