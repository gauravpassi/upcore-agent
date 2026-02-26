export interface ToolEvent {
  id: string;
  tool: string;
  status: 'running' | 'done';
  result?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  toolEvents?: ToolEvent[];
  timestamp: Date;
  isStreaming?: boolean;
}
