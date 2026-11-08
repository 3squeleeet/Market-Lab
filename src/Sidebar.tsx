import {
  Newspaper,
  LayoutDashboard,
  ChartNoAxesCombined,
  ArrowLeftRight,
  Bot,
  BriefcaseBusiness,
  ChartPie,
  Unplug,
  Settings,
  FlaskConical,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { useLab } from "./store";
const nav = [
  ["Visão geral", LayoutDashboard],
  ["Mercados", ChartNoAxesCombined],
  ["Notícias", Newspaper],
  ["Trading", ArrowLeftRight],
  ["Agentes de IA", Bot],
  ["Portfólio", BriefcaseBusiness],
  ["Análises", ChartPie],
  ["Conexões MCP", Unplug],
  ["Configurações", Settings],
] as const;
export function Sidebar() {
  const s = useLab();
  return (
    <aside>
      <a className="brand" onClick={() => s.setPage("Visão geral")}>
        <span className="brand-icon">
          <FlaskConical size={23} />
        </span>
        market<span className="brand-light">lab</span>
        <sup>0.2.1</sup>
      </a>
      <div className="workspace">
        <span className="avatar">ML</span>
        <div>
          Workspace local<small>Ambiente de pesquisa</small>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {nav.map(([name, Icon]) => (
          <button
            key={name}
            className={s.page === name ? "selected" : ""}
            onClick={() => s.setPage(name)}
          >
            <Icon size={18} />
            {name}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sandbox">
          <FlaskConical size={18} />
          <strong>Seu laboratório. Sem risco.</strong>
          <p>
            Mercados sintéticos.
            <br />
            Possibilidades reais de pesquisa.
          </p>
          <span>
            100% SIMULADO <ArrowUpRight size={13} />
          </span>
        </div>
        <div className="user">
          <span className="avatar">P</span>
          <div>
            Pesquisador<small>Conta virtual local</small>
          </div>
          <Settings size={16} />
        </div>
      </div>
    </aside>
  );
}
