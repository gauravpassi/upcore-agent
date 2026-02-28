import { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, ToolEvent, AttachedImage } from '../types';

// In Electron production the frontend is served by the Express server on the same port,
// so derive the WS URL from window.location to always use the correct port.
const WS_URL = import.meta.env.VITE_WS_URL ??
  `ws://${window.location.host}/ws`;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface WsMessage {
  type: 'text_chunk' | 'tool_start' | 'tool_done' | 'complete' | 'error' | 'heartbeat' | 'needs_continue';
  content?: string;
  tool?: string;
  result?: string;
  message?: string;
  usage?: { input: number; output: number };
  // heartbeat fields
  elapsed?: number;
  // needs_continue fields
  summary?: string;
}

// 60s — safe because the server now sends a streaming heartbeat every 5s
// during the Claude API stream (even while generating large tool inputs),
// so we'd only hit this if the connection is genuinely dead for a full minute.
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000;

export function useAgent(token: string | null, onAuthError: () => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // Heartbeat status: shown in the UI while a tool is running a long operation
  const [heartbeatStatus, setHeartbeatStatus] = useState<{ tool: string; elapsed: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we're in an auto-continue sequence (suppress user-visible "phase complete" noise)
  const autoContinueRef = useRef(false);

  // ── Inactivity timer — resets streaming state if server goes silent ───────
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      // No streaming event for 30s — connection likely dead
      setIsStreaming(false);
      setHeartbeatStatus(null);
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'agent' && last.isStreaming) {
          msgs[msgs.length - 1] = { ...last, isStreaming: false };
        }
        msgs.push({
          id: generateId(),
          role: 'agent',
          content: '⚠️ **Connection timed out** — the agent stopped responding. Please start a new message or refresh if the issue persists.',
          timestamp: new Date(),
        });
        return msgs;
      });
    }, STREAM_INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer]);

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
      setHeartbeatStatus(null);
      clearInactivityTimer();
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

      // Any event from server resets the inactivity timer
      resetInactivityTimer();

      switch (data.type) {
        case 'text_chunk': {
          // Show "Generating..." status during text streaming
          setHeartbeatStatus({ tool: 'Generating response...', elapsed: 0 });
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
          // Show the tool name immediately in the status bar (don't wait for 10s heartbeat)
          setHeartbeatStatus({ tool: data.tool ?? 'running...', elapsed: 0 });
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
          // Brief "Processing..." between tools — replaced immediately by next tool_start or text_chunk
          setHeartbeatStatus({ tool: 'Processing...', elapsed: 0 });
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

        case 'heartbeat': {
          // Update elapsed seconds on the existing tool status (tool name already set by tool_start)
          setHeartbeatStatus((prev) => ({
            tool: prev?.tool ?? data.message ?? 'working...',
            elapsed: data.elapsed ?? 0,
          }));
          break;
        }

        case 'needs_continue': {
          // Phase complete — start a fresh phase automatically
          clearInactivityTimer();
          setIsStreaming(false);
          setHeartbeatStatus(null);

          // Close out the current streaming message
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'agent' && last.isStreaming) {
              msgs[msgs.length - 1] = { ...last, isStreaming: false };
            }
            // Add a subtle phase transition indicator
            msgs.push({
              id: generateId(),
              role: 'agent',
              content: `🔄 **Phase complete** — ${data.summary ?? 'Starting next phase...'}\n\n_Continuing automatically..._`,
              timestamp: new Date(),
            });
            return msgs;
          });

          // Auto-continue after a brief pause so the UI can render
          autoContinueRef.current = true;
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              setIsStreaming(true);
              setHeartbeatStatus({ tool: 'Thinking...', elapsed: 0 });
              resetInactivityTimer();
              wsRef.current.send(JSON.stringify({ type: 'continue' }));
            }
            autoContinueRef.current = false;
          }, 1200);
          break;
        }

        case 'complete': {
          clearInactivityTimer();
          setIsStreaming(false);
          setHeartbeatStatus(null);
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
          clearInactivityTimer();
          setIsStreaming(false);
          setHeartbeatStatus(null);
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
  }, [token, onAuthError, resetInactivityTimer, clearInactivityTimer]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    shouldReconnectRef.current = true;
    if (token) connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearInactivityTimer();
      wsRef.current?.close();
    };
  }, [token, connect, clearInactivityTimer]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(
    (content: string, images: AttachedImage[] = []) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isStreaming) return;

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'user',
          content,
          images: images.length > 0 ? images : undefined,
          timestamp: new Date(),
        },
      ]);

      setIsStreaming(true);
      setHeartbeatStatus({ tool: 'Thinking...', elapsed: 0 });
      resetInactivityTimer();

      // Send images as lightweight objects (strip previewUrl — not needed server-side)
      const payload = {
        type: 'message',
        content,
        images: images.length > 0
          ? images.map(({ data, mediaType, name }) => ({ data, mediaType, name }))
          : undefined,
      };
      wsRef.current.send(JSON.stringify(payload));
    },
    [isStreaming, resetInactivityTimer],
  );

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'cancel' }));
    clearInactivityTimer();
    setIsStreaming(false);
    setHeartbeatStatus(null);
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'agent' && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, isStreaming: false };
      }
      return msgs;
    });
  }, [clearInactivityTimer]);

  return { messages, isStreaming, isConnected, heartbeatStatus, send, cancel };
}
