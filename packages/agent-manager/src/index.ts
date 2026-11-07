import type {
  Strategy,
  Candle,
  Agent,
  Decision,
} from "../../shared/src/index.js";
export function signal(
  strategy: Strategy,
  candles: Candle[],
  holding: boolean,
): "buy" | "sell" | "hold" {
  if (strategy === "external") return "hold";
  if (strategy === "buy_hold") return holding ? "hold" : "buy";
  if (candles.length < 31) return "hold";
  const close = candles.map((c) => c.close),
    mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
  if (strategy === "sma") {
    const prev = close.slice(0, -1),
      fast = mean(close.slice(-10)),
      slow = mean(close.slice(-30)),
      pf = mean(prev.slice(-10)),
      ps = mean(prev.slice(-30));
    return !holding && fast > slow && pf <= ps
      ? "buy"
      : holding && fast < slow && pf >= ps
        ? "sell"
        : "hold";
  }
  let gain = 0,
    loss = 0;
  for (let i = close.length - 14; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gain += Math.max(0, d);
    loss += Math.max(0, -d);
  }
  const rsi =
    gain + loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  return !holding && rsi < 30 ? "buy" : holding && rsi > 70 ? "sell" : "hold";
}
export function recordDecision(
  agent: Agent,
  time: number,
  action: string,
  reason: string,
  orderId?: string,
) {
  const d: Decision = {
    id: `${agent.id}-${time}-${agent.history.length}`,
    time,
    action,
    reason,
    ...(orderId ? { orderId } : {}),
  };
  agent.history.push(d);
}
