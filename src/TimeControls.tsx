import { Activity, Pause, Play, RotateCcw } from "lucide-react";
import { useLab, run } from "./store";
import { date } from "./demo";
export function TimeControls() {
  const s = useLab(),
    data = s.data!;
  return (
    <div className="time-bar">
      <span className="time-icon">
        <Activity size={18} />
      </span>
      <div>
        <strong>Controle da simulação</strong>
        <small>
          {data.simulation.frozen
            ? "Mercado congelado"
            : "Relógio independente · ticks determinísticos"}
        </small>
      </div>
      <button
        className="pause"
        disabled={s.pending > 0}
        onClick={() =>
          void run(
            data.simulation.running ? "pause_simulation" : "resume_simulation",
          )
        }
      >
        {data.simulation.running ? <Pause size={14} /> : <Play size={14} />}{" "}
        {data.simulation.running ? "Pausar" : "Retomar"}
      </button>
      <div className="speeds">
        {[1, 2, 5, 10, 50].map((n) => (
          <button
            key={n}
            disabled={s.pending > 0}
            className={data.simulation.speed === n ? "active" : ""}
            onClick={() => void run("set_simulation_speed", { speed: n })}
          >
            {n}x
          </button>
        ))}
      </div>
      <div className="sim-time">
        <small>TEMPO SIMULADO</small>
        <strong>{date(data.market.time)}</strong>
      </div>
      <button
        title="Reiniciar experimento"
        className="reset"
        disabled={s.pending > 0}
        onClick={() => {
          if (
            window.confirm(
              "Arquivar a sessão atual e reiniciar todas as contas com a mesma seed? O histórico antigo fica no SQLite.",
            )
          )
            void run("admin_intervene", {
              confirmed: true,
              action: "reset",
              value: data.market.seed,
            });
        }}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
