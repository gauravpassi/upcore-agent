import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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
  // Warn (not fail) if git tools env vars are missing — agent still works read-only
  if (!process.env.GITHUB_TOKEN || !process.env.TURBO_REPO_URL) {
    console.warn('[UpcoreAgent] ⚠️  GITHUB_TOKEN or TURBO_REPO_URL not set — write/push tools disabled');
  }
}

validateEnv();

// ─── TurboIAM Repo Clone / Pull ─────────────────────────────────────────────
/**
 * At startup, clone the turbo-claude repo (or pull if already cloned).
 * The repo is used by read_repo_file, write_file, run_command, and git_push tools.
 */
async function initTurboRepo(): Promise<void> {
  // In Electron mode, the user's local project dir is used directly — no clone needed
  if (process.env.ELECTRON === 'true') {
    const projectDir = process.env.TURBO_PROJECT_DIR;
    console.log(`[UpcoreAgent] Electron mode — using local project dir: ${projectDir || '(not set yet)'}`);
    if (projectDir) syncContextFromRepo(projectDir);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repoUrl = process.env.TURBO_REPO_URL;
  const repoDir = process.env.TURBO_REPO_DIR ?? '/tmp/turbo-claude';

  if (!token || !repoUrl) {
    console.log('[UpcoreAgent] Skipping repo clone — GITHUB_TOKEN or TURBO_REPO_URL not set');
    return;
  }

  const authUrl = repoUrl.replace('https://', `https://${token}@`);
  const execOpts = {
    encoding: 'utf-8' as const,
    stdio: 'pipe' as const,
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  };

  try {
    if (fs.existsSync(path.join(repoDir, '.git'))) {
      // Repo already cloned — pull latest
      console.log(`[UpcoreAgent] Pulling latest turbo-claude repo at ${repoDir}...`);
      execSync('git pull origin main --rebase', { ...execOpts, cwd: repoDir });
      console.log('[UpcoreAgent] ✅ Repo pulled successfully');
    } else {
      // Fresh clone
      console.log(`[UpcoreAgent] Cloning turbo-claude repo to ${repoDir}...`);
      fs.mkdirSync(repoDir, { recursive: true });
      execSync(`git clone "${authUrl}" "${repoDir}"`, execOpts);
      console.log('[UpcoreAgent] ✅ Repo cloned successfully');
    }

    // Sync context (brain) files from the cloned repo
    syncContextFromRepo(repoDir);
  } catch (err) {
    console.error('[UpcoreAgent] ❌ Failed to clone/pull repo:', (err as Error).message);
    // Non-fatal — server still starts, write tools will return errors
  }
}

/**
 * Copy brain (CLAUDE.md / docs) files from the turbo-claude repo into
 * the agent's context/ folder so the agent always has the latest docs.
 */
function syncContextFromRepo(repoDir: string): void {
  const contextDir = path.resolve(__dirname, '../../context');
  const filesToSync = [
    { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
    { src: 'turbo-backend/CLAUDE.md', dest: 'BACKEND_CLAUDE.md' },
    { src: 'turbo-frontend/CLAUDE.md', dest: 'FRONTEND_CLAUDE.md' },
    { src: 'turbo-backend/docs/API_REFERENCE.md', dest: 'API_REFERENCE.md' },
    { src: 'turbo-backend/docs/DATA_MODEL.md', dest: 'DATA_MODEL.md' },
    { src: 'turbo-frontend/docs/DESIGN_SYSTEM.md', dest: 'DESIGN_SYSTEM.md' },
  ];

  let synced = 0;
  for (const { src, dest } of filesToSync) {
    const srcPath = path.join(repoDir, src);
    const destPath = path.join(contextDir, dest);
    if (fs.existsSync(srcPath)) {
      try {
        fs.mkdirSync(contextDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        synced++;
      } catch {
        // Non-fatal
      }
    }
  }
  console.log(`[UpcoreAgent] Synced ${synced}/${filesToSync.length} context files from repo`);
}

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

    interface WsIncomingImage {
      data: string;
      mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      name: string;
    }

    let parsed: { type: string; content?: string; images?: WsIncomingImage[] };
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
      const hasText = parsed.content?.trim();
      const hasImages = parsed.images && parsed.images.length > 0;

      if (!hasText && !hasImages) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message must have text or at least one image' }));
        return;
      }

      // Cancel any in-progress request
      state.abortController?.abort();
      state.abortController = new AbortController();

      try {
        state.conversationHistory = await runAgent(
          parsed.content ?? '',
          parsed.images,
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
// Clone/pull turbo-claude repo first, then start the server
initTurboRepo().finally(() => {
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
});

export { app, server };
