import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loginHandler, validateWsToken } from './auth.js';
import { runAgent } from './agent.js';
import type { AgentEvent } from './agent.js';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Env Validation ─────────────────────────────────────────────────────────
function validateEnv(): void {
  const required = ['ANTHROPIC_API_KEY', 'AGENT_PASSWORD', 'AGENT_JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if ((process.env.AGENT_JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('AGENT_JWT_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
  }
  // Telegram is optional — but if token is provided, allowed chat IDs must also be set
  if (process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_ALLOWED_CHAT_IDS) {
    throw new Error('TELEGRAM_ALLOWED_CHAT_IDS is required when TELEGRAM_BOT_TOKEN is set.');
  }
}

validateEnv();

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Express Setup ───────────────────────────────────────────────────────────
const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false, // SPA served from same origin
  }),
);

app.use(
  cors({
    // Allow all origins — auth is handled by password + JWT, not origin
    origin: '*',
    credentials: false,
  }),
);

app.use(express.json({ limit: '1mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again in 15 minutes' },
});

// ─── HTTP Routes ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.post('/api/auth/login', loginLimiter, loginHandler);

// Serve frontend static files (production)
// __dirname = server/dist/ → ../../frontend/dist = upcore-agent/frontend/dist
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(FRONTEND_DIST));

// SPA fallback
app.get('*', (_req, res) => {
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ message: 'Frontend not built. Run: cd frontend && npm run build' });
  }
});

// ─── HTTP + WebSocket Server ─────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Per-connection message rate limit (10 messages per minute)
const WS_MESSAGE_LIMIT = 10;
const WS_MESSAGE_WINDOW_MS = 60 * 1000;

interface ConnectionState {
  messageCount: number;
  windowStart: number;
  abortController: AbortController | null;
  conversationHistory: Anthropic.Messages.MessageParam[];
}

wss.on('connection', (ws: WebSocket) => {
  const state: ConnectionState = {
    messageCount: 0,
    windowStart: Date.now(),
    abortController: null,
    conversationHistory: [],
  };

  ws.on('message', async (raw: Buffer) => {
    // Rate limiting
    const now = Date.now();
    if (now - state.windowStart > WS_MESSAGE_WINDOW_MS) {
      state.messageCount = 0;
      state.windowStart = now;
    }
    state.messageCount++;

    if (state.messageCount > WS_MESSAGE_LIMIT) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded. Please wait before sending more messages.' }));
      return;
    }

    let parsed: { type: string; content?: string };
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      return;
    }

    if (parsed.type === 'cancel') {
      state.abortController?.abort();
      state.abortController = null;
      return;
    }

    if (parsed.type === 'message') {
      if (!parsed.content?.trim()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message content cannot be empty' }));
        return;
      }

      // Cancel any in-progress request
      state.abortController?.abort();
      state.abortController = new AbortController();

      try {
        state.conversationHistory = await runAgent(
          parsed.content,
          state.conversationHistory,
          (event: AgentEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(event));
            }
          },
          state.abortController.signal,
        );
      } catch (err) {
        const message = (err as Error).message ?? 'An unexpected error occurred';
        ws.send(JSON.stringify({ type: 'error', message }));
      } finally {
        state.abortController = null;
      }
    }
  });

  ws.on('close', () => {
    state.abortController?.abort();
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });
});

// ─── WebSocket Upgrade (JWT Auth) ────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token') ?? undefined;

  const payload = validateWsToken(token);
  if (!payload) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[UpcoreAgent] Server running on port ${PORT}`);
  console.log(`[UpcoreAgent] Environment: ${process.env.NODE_ENV ?? 'development'}`);

  // Telegram bot is optional — only starts if TELEGRAM_BOT_TOKEN is set
  if (process.env.TELEGRAM_BOT_TOKEN) {
    // Lazy import to avoid loading the module when Telegram is disabled
    import('./telegram.js').then(({ initTelegramBot }) => {
      initTelegramBot();
      console.log('[Telegram] Bot initialized and polling');
    }).catch((err: Error) => {
      console.error('[Telegram] Failed to initialize bot:', err.message);
    });
  }
});

export { app, server };
