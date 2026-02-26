# UpcoreCodeTestDeploy Agent — Project Brain (Root)

> Auto-loaded by Claude. Read this INSTEAD of exploring files from scratch.

## What This Is
A hosted Claude Agent SDK app that lets developers chat with an AI that knows the full TurboIAM codebase. Developer opens a URL, types a task, gets production-ready code following TurboIAM patterns.

## Stack
- **Agent**: `@anthropic-ai/sdk` (raw streaming API), model `claude-sonnet-4-5`, manual agentic loop
- **Server**: Node.js + Express + `ws` (WebSocket), port 3000
- **Frontend**: React 18 + Vite + Tailwind CSS v4 — deployed on **Vercel**
- **Backend**: Express + Anthropic SDK — deployed on **Railway**
- **Deploy split**: Frontend → Vercel (CDN, free), Backend → Railway (~$5/mo, persistent WebSocket)

## Repo
Same GitHub repo as TurboIAM: `github.com/gauravpassi/turbo-claude`
This lives at `turbo-claude/upcore-agent/` — committed and pushed alongside the main app.

## Directory Structure
```
turbo-claude/
├── turbo-backend/           TurboIAM NestJS API
├── turbo-frontend/          TurboIAM React app
└── upcore-agent/            ← This project
    ├── server/                  Express + Agent SDK backend (→ Railway)
    ├── frontend/                React chat UI (→ Vercel)
    ├── context/                 TurboIAM brain files (read-only copy)
    └── CLAUDE.md                ← This file
├── server/                  Express + Agent SDK backend
│   ├── src/
│   │   ├── index.ts         Entry: Express + WebSocket server setup
│   │   ├── agent.ts         Claude Agent SDK, tools, system prompt
│   │   └── tools/
│   │       ├── readFile.ts  Read file from context/ folder
│   │       ├── searchCode.ts Grep search across context files
│   │       ├── listFiles.ts  List available context files
│   │       └── getContext.ts Return named brain file instantly
│   ├── package.json
│   └── CLAUDE.md            Server-specific brain →
├── frontend/                React chat UI
│   ├── src/
│   │   ├── main.tsx         App entry
│   │   ├── App.tsx          Chat layout (sidebar + main)
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx  Message history + streaming
│   │   │   ├── InputBar.tsx    Text input + send button
│   │   │   ├── Message.tsx     User / agent message bubble
│   │   │   └── ToolBadge.tsx   Inline tool call indicator
│   │   └── hooks/
│   │       └── useAgent.ts  WebSocket connection + streaming state
│   ├── package.json
│   └── CLAUDE.md            Frontend-specific brain →
├── context/                 TurboIAM brain files (read-only, agent's knowledge base)
│   ├── CLAUDE.md            Root TurboIAM context
│   ├── API_REFERENCE.md     All TurboIAM endpoints
│   ├── DATA_MODEL.md        All Prisma models
│   └── DESIGN_SYSTEM.md     Colors, components, props
├── railway.json             Deploy config
├── .env.example
└── CLAUDE.md                ← This file
```

## Key Architecture Decisions
- **WebSocket for streaming**: Server streams agent text chunks + tool events to frontend in real-time
- **JWT auth (login → token → persist)**:
  - User enters password on login page → `POST /api/auth/login` → server returns signed JWT (24h expiry)
  - JWT stored in `localStorage` key `upcore_token`
  - WS connects with `?token=<jwt>` — server verifies JWT on upgrade, no raw password ever sent over WS
  - On page refresh → token re-read from localStorage → skip login if valid
  - On 401 (expired/invalid) → clear token → redirect to login page
- **Context is static**: TurboIAM brain files copied into `context/` folder at build time — agent reads from there, NOT live repo
- **No file write access**: Agent is read-only (no write_file tool) — generates code in chat only
- **Rate limiting**: `POST /api/auth/login` → 5 attempts/15min per IP; WS → 10 messages/min per connection
- **System prompt**: Full `context/CLAUDE.md` content embedded at agent init, not re-read per message

## WebSocket Message Protocol
```typescript
// Client → Server
{ type: 'message', content: string }
{ type: 'cancel' }

// Server → Client (streamed)
{ type: 'text_chunk', content: string }        // partial text token
{ type: 'tool_start', tool: string }           // e.g., "read_file"
{ type: 'tool_done', tool: string, result: string }
{ type: 'complete', usage: { input: number, output: number } }
{ type: 'error', message: string }
```

## Adding a New Tool
1. Create `server/src/tools/<toolName>.ts` — export `{ name, description, schema, handler }`
2. Import and add to `tools[]` array in `server/src/agent.ts`
3. Add to `allowedTools` array in agent options
4. Update `server/CLAUDE.md` tools table
5. Update this file if the tool changes overall architecture

## Run Commands
```bash
# Server (Railway)
cd server && npm install && npm run dev     # dev with tsx, port 3000

# Frontend (Vercel)
cd frontend && npm install && npm run dev   # Vite dev server, port 5174

# Deploy Backend → Railway
# Connect repo in Railway dashboard → set env vars → auto-deploys on push to main
# Railway build: npm run build, start: npm start

# Deploy Frontend → Vercel
cd frontend && vercel --prod                # set VITE_WS_URL + VITE_API_URL in Vercel dashboard
```

## Environment Variables

### Server (set in Railway dashboard)
```
ANTHROPIC_API_KEY=sk-ant-...               # Claude API key (required)
AGENT_PASSWORD=<strong-password>           # Login password shown to developers (required)
AGENT_JWT_SECRET=<random-32-char-string>   # Signs/verifies JWTs — generate: openssl rand -hex 32
PORT=3000                                  # Railway sets this automatically
NODE_ENV=production
```

### Frontend (set in Vercel dashboard)
```
VITE_WS_URL=wss://your-app.railway.app/ws  # Railway backend WebSocket URL (required)
```

## Deploy Architecture
```
User Browser
    ↓  HTTPS
Vercel CDN  (frontend static files — React app)
    ↓  WSS (WebSocket Secure)
Railway Server  (Express + Agent SDK — persistent, stateful)
    ↓  HTTPS
Anthropic API  (Claude claude-sonnet-4-5)
```
**Why split?** Vercel can't run persistent WebSocket servers (serverless). Railway keeps the WS connection alive for streaming agent responses.

## Sprint Status
- Sprint 1: ⏳ Agent core + tools + WebSocket server
- Sprint 2: ⏳ Chat UI (streaming, tool badges, code blocks)
- Sprint 3: ⏳ Railway deploy + auth
- Sprint 4: ⏳ Polish (conversation history, copy code, context selector)

## Brain File Maintenance
After any session where you modify this project, check:
- Added/changed tool → update `server/CLAUDE.md` (tools table)
- Added WS message type → update this file (protocol section)
- Added frontend component → update `frontend/CLAUDE.md` (components table)
- Changed deploy config → update this file (run commands / env vars)

Do this BEFORE ending the session, even if the user didn't ask.
