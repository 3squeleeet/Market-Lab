export const SPEEDS = [1, 2, 5, 10, 50] as const;
export class SimulationClock {
  running = true;
  speed = 1;
  private accumulated = 0;
  constructor(public tickMs = 1000) {
    if (tickMs <= 0) throw Error("Intervalo inválido");
  }
  advance(elapsedMs: number, step: () => void) {
    if (!this.running) return;
    this.accumulated += Math.max(0, elapsedMs) * this.speed;
    while (this.accumulated >= this.tickMs) {
      step();
      this.accumulated -= this.tickMs;
    }
  }
}
