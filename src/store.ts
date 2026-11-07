import { create } from "zustand";
import type { DesktopAPI, LabView, Symbol } from "../packages/shared/src/index";
declare global {
  interface Window {
    marketLab?: DesktopAPI;
  }
}
interface State {
  data: LabView | null;
  ready: boolean;
  error: string;
  pending: number;
  page: string;
  symbol: string;
  interval: number;
  revision: number;
  setPage: (page: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: number) => void;
}
export const useLab = create<State>((set) => ({
  data: null,
  ready: false,
  error: "",
  pending: 0,
  page: "Visão geral",
  symbol: "BTC/USD",
  interval: 15,
  revision: 0,
  setPage: (page) => {
    set({ page });
    window.scrollTo(0, 0);
  },
  setSymbol: (symbol) => set({ symbol }),
  setInterval: (interval) => {
    set({ interval });
    void run("update_configuration", { chartInterval: String(interval) });
  },
}));
let refreshing = false;
export async function refresh() {
  if (refreshing || !window.marketLab) return;
  refreshing = true;
  try {
    const reply = await window.marketLab.view(
      useLab.getState().symbol as Symbol,
    );
    if (!reply.ok) throw Error(reply.error.message);
    if (
      !reply.data ||
      !Array.isArray(reply.data.market?.quotes) ||
      reply.data.portfolio?.equity === undefined
    )
      throw Error("Resposta de estado inválida");
    useLab.setState((s) => ({
      data: reply.data,
      interval: s.ready ? s.interval : reply.data.simulation.chartInterval,
      ready: true,
      revision: s.revision + 1,
    }));
  } catch (e) {
    useLab.setState({
      ready: true,
      error: e instanceof Error ? e.message : "Falha ao consultar o backend",
    });
  } finally {
    refreshing = false;
  }
}
export async function run<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T | undefined> {
  useLab.setState((s) => ({ pending: s.pending + 1, error: "" }));
  try {
    if (!window.marketLab)
      throw Error("Abra o aplicativo Electron para usar os serviços locais.");
    const reply = await window.marketLab.invoke(name, args);
    if (!reply.ok) throw Error(reply.error.message);
    await refresh();
    return reply.data as T;
  } catch (e) {
    useLab.setState({
      error: e instanceof Error ? e.message : "Operação recusada",
    });
    return undefined;
  } finally {
    useLab.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
  }
}
export function initialize() {
  if (!window.marketLab) {
    useLab.setState({
      ready: true,
      error:
        "O backend local está disponível no aplicativo Electron. Execute npm run dev:desktop ou abra o executável do Market Lab.",
    });
    return () => {};
  }
  void refresh();
  const timer = setInterval(() => void refresh(), 500);
  return () => clearInterval(timer);
}
