import { Activity, Pause, Play, RotateCcw } from "lucide-react";
import { engine, useLab, persist } from "./store";
export function TimeControls() {
  const s = useLab();
  return (
    <div className="time-bar">
      <span className="time-icon">
        <Activity size={18} />
      </span>
      <div>
        <strong>Controle da simulação</strong>
        <small>O tempo está nas suas mãos.</small>
      </div>
      <button
        className="pause"
        onClick={() => {
          s.toggle();
          void persist();
        }}
      >
        {s.running ? <Pause size={14} /> : <Play size={14} />}{" "}
        {s.running ? "Pausar" : "Retomar"}
      </button>
      <div className="speeds">
        {[1, 2, 5, 10, 50].map((n) => (
          <button
            key={n}
            className={s.speed === n ? "active" : ""}
            onClick={() => s.setSpeed(n)}
          >
            {n}x
          </button>
        ))}
      </div>
      <div className="sim-time">
        <small>TEMPO SIMULADO · UTC</small>
        <strong>
          {new Date(engine.time * 1000)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)}
        </strong>
      </div>
      <button
        title="Reiniciar a mesma sessão"
        className="reset"
        onClick={() => {
          s.reset(s.seed, s.volatility);
          void persist();
        }}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
