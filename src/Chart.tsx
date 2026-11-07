import { useEffect, useRef } from "react";
import {
  createChart,
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
      previous.current = "";
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const q = state.market.quotes.find((q) => q.symbol === symbol)!;
    const data = aggregate(q.candles, interval);
    candles.current?.setData(data.map((d) => ({ ...d, time: d.time as Time })));
    volume.current?.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? "#20483f" : "#4a2c35",
      })),
    );
    const key =
      symbol + interval + (q.candles.length > 240 ? "full" : "recent");
    if (previous.current !== key) {
      chart.current?.timeScale().fitContent();
      previous.current = key;
    }
  }, [symbol, interval, revision]);
  return <div className="chart" ref={el} />;
}
