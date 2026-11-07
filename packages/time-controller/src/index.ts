export const SPEEDS = [1, 2, 5, 10, 50] as const;
export class SimulationClock {
  running = true;
  speed = 1;
  private accumulated = 0;
  constructor(public tickMs = 1000) {
    if (tickMs <= 0) throw Error('Intervalo inválido');
  }
  consume(elapsedMs: number, maximumTicks = Infinity): number {
    if (!this.running) return 0;
    if (!Number.isFinite(elapsedMs) || this.tickMs <= 0 || !Number.isFinite(this.speed)) throw Error('Relógio inválido');
    this.accumulated += Math.max(0, elapsedMs) * this.speed;
    const ticks = Math.min(maximumTicks, Math.floor(this.accumulated / this.tickMs));
    this.accumulated -= ticks * this.tickMs;
    return ticks;
  }
  advance(elapsedMs: number, step: () => void) {
    const ticks = this.consume(elapsedMs);
    for (let i = 0; i < ticks; i++) step();
  }
}
