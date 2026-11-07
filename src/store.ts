import { create } from "zustand";
import { MarketEngine } from "../packages/market-engine/src/index";
import { SimulationClock } from "../packages/time-controller/src/index";
import type { DesktopAPI, SavedSession } from "../packages/shared/src/index";
declare global {
  interface Window {
    marketLab?: DesktopAPI;
  }
}
export let engine = new MarketEngine(42);
export const clock = new SimulationClock();
for (let i = 0; i < 3600; i++) engine.step();
interface State {
  revision: number;
  ready: boolean;
  error: string;
  page: string;
  symbol: string;
  interval: number;
  running: boolean;
  speed: number;
  seed: number;
  volatility: number;
  setPage: (page: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: number) => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  reset: (seed: number, volatility: number) => void;
  refresh: () => void;
}
export const useLab = create<State>((set) => ({
  revision: 0,
  ready: false,
  error: "",
  page: "Visão geral",
  symbol: "BTC/USD",
  interval: 15,
  running: true,
  speed: 1,
  seed: 42,
  volatility: 1,
  setPage: (page) => set({ page }),
  setSymbol: (symbol) => set({ symbol }),
  setInterval: (interval) => set({ interval }),
  toggle: () => {
    clock.running = !clock.running;
    set({ running: clock.running });
  },
  setSpeed: (speed) => {
    clock.speed = speed;
    set({ speed });
  },
  reset: (seed, volatility) => {
    engine = new MarketEngine(seed, volatility);
    for (let i = 0; i < 3600; i++) engine.step();
    set((s) => ({ seed, volatility, revision: s.revision + 1 }));
  },
  refresh: () => set((s) => ({ revision: s.revision + 1 })),
}));
function snapshot(): SavedSession {
  return {
    version: 1,
    seed: engine.seed,
    ticks: engine.ticks,
    speed: clock.speed,
    volatility: engine.volatility,
    running: clock.running,
  };
}
export async function persist() {
  try {
    const s = snapshot();
    if (window.marketLab) await window.marketLab.save(s);
    else localStorage.setItem("market-lab-session", JSON.stringify(s));
  } catch {
    useLab.setState({
      error: "Não foi possível salvar a sessão. Verifique o armazenamento.",
    });
  }
}
export async function initialize() {
  try {
    const raw = window.marketLab
      ? await window.marketLab.load()
      : JSON.parse(localStorage.getItem("market-lab-session") || "null");
    if (raw) {
      if (
        raw.version !== 1 ||
        !Number.isSafeInteger(raw.ticks) ||
        raw.ticks < 0 ||
        raw.ticks > 10000000 ||
        !Number.isSafeInteger(raw.seed) ||
        !Number.isFinite(raw.volatility) ||
        raw.volatility < 0.1 ||
        raw.volatility > 5 ||
        ![1, 2, 5, 10, 50].includes(raw.speed)
      )
        throw Error("Sessão inválida");
      engine = new MarketEngine(raw.seed, raw.volatility);
      for (let i = 0; i < raw.ticks; i++) engine.step();
      clock.speed = raw.speed;
      clock.running = raw.running;
      useLab.setState({
        speed: raw.speed,
        running: raw.running,
        seed: raw.seed,
        volatility: raw.volatility,
      });
    }
  } catch {
    useLab.setState({
      error:
        "A sessão salva não pôde ser restaurada. Uma nova simulação foi iniciada.",
    });
  }
  useLab.setState({ ready: true });
}
