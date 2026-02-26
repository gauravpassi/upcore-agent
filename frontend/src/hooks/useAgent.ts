import { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, ToolEvent } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000/ws';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface WsMessage {
  type: 'text_chunk' | 'tool_start' | 'tool_done' | 'complete' | 'error';
  content?: string;
  tool?: string;
  result?: string;
  message?: string;
  usage?: { input: number; output: number };
}

export function useAgent(token: string | null, onAuthError: () => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      setIsStreaming(false);
      wsRef.current = null;

      // 4001 = JWT auth failed
      if (event.code === 4001 || event.code === 1008) {
        onAuthError();
        return;
      }

      // Reconnect with exponential backoff
      if (shouldReconnectRef.current && retriesRef.current < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, retriesRef.current);
        retriesRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror — let it handle reconnect
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let data: WsMessage;
      try {
        data = JSON.parse(event.data) as WsMessage;
      } catch {
        return;
      }

      switch (data.type) {
        case 'text_chunk': {
          const chunk = data.content ?? '';
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'agent' && last.isStreaming) {
              msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
            } else {
              // Start a new agent message
              msgs.push({
                id: generateId(),
                role: 'agent',
                content: chunk,
                toolEvents: [],
                timestamp: new Date(),
                isStreaming: true,
              });
            }
            return msgs;
          });
          break;
        }

        case 'tool_start': {
          const newEvent: ToolEvent = {
            id: generateId(),
            tool: data.tool ?? '',
            status: 'running',
          };
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'agent') {
              msgs[msgs.length - 1] = {
                ...last,
                toolEvents: [...(last.toolEvents ?? []), newEvent],
              };
            } else {
              // No agent message yet — create one with tool event
              msgs.push({
                id: generateId(),
                role: 'agent',
                content: '',
                toolEvents: [newEvent],
                timestamp: new Date(),
                isStreaming: true,
              });
            }
            return msgs;
          });
          break;
        }

        case 'tool_done': {
          const toolName = data.tool ?? '';
          const result = data.result;
          setMessages((prev) => {
            const msgs = [...prev];
            // Find the last agent message with a running tool of this name
            for (let i = msgs.length - 1; i >= 0; i--) {
              const msg = msgs[i];
              if (msg.role === 'agent' && msg.toolEvents) {
                const idx = msg.toolEvents.findIndex(
                  (e) => e.tool === toolName && e.status === 'running',
                );
                if (idx !== -1) {
                  const updatedEvents = [...msg.toolEvents];
                  updatedEvents[idx] = { ...updatedEvents[idx], status: 'done', result };
                  msgs[i] = { ...msg, toolEvents: updatedEvents };
                  break;
                }
              }
            }
            return msgs;
          });
          break;
        }

        case 'complete': {
          setIsStreaming(false);
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'agent') {
              msgs[msgs.length - 1] = { ...last, isStreaming: false };
            }
            return msgs;
          });
          break;
        }

        case 'error': {
          setIsStreaming(false);
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'agent' && last.isStreaming) {
              // Mark current message as done
              msgs[msgs.length - 1] = { ...last, isStreaming: false };
            }
            // Append error message
            msgs.push({
              id: generateId(),
              role: 'agent',
              content: `⚠️ **Error:** ${data.message ?? 'An unexpected error occurred.'}`,
              timestamp: new Date(),
            });
            return msgs;
          });
          break;
        }
      }
    };
  }, [token, onAuthError]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    shouldReconnectRef.current = true;
    if (token) connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [token, connect]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isStreaming) return;

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'user',
          content,
          timestamp: new Date(),
        },
      ]);

      setIsStreaming(true);
      wsRef.current.send(JSON.stringify({ type: 'message', content }));
    },
    [isStreaming],
  );

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'cancel' }));
    setIsStreaming(false);
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'agent' && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, isStreaming: false };
      }
      return msgs;
    });
  }, []);

  return { messages, isStreaming, isConnected, send, cancel };
}
