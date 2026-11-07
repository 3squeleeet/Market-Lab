export interface Agent {
  id: string;
  name: string;
  status: "stopped" | "running";
}
export interface AgentManager {
  list(): Promise<Agent[]>;
  stop(id: string): Promise<void>;
}
