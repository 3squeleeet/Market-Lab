export interface MCPConnection {
  id: string;
  name: string;
  connected: boolean;
}
export interface MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}
