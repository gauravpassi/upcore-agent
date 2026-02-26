# UpcoreCodeTestDeploy Agent — Project Brain (Root)

> Auto-loaded by Claude. Read this INSTEAD of exploring files from scratch.

## What This Is
A hosted Claude Agent SDK app that lets developers chat with an AI that knows the full TurboIAM codebase.
Developer types a task → agent reads existing code → writes the fix/feature → verifies TypeScript → pushes to GitHub → Railway + Vercel auto-deploy.

## Stack
- **Agent**: `@anthropic-ai/sdk` (raw streaming API), model `claude-sonnet-4-5`, manual agentic loop
- **Server**: Node.js + Express + `ws` (WebSocket), port 3000
- **Frontend**: React 18 + Vite + Tailwind CSS v4 — deployed on **Vercel**
- **Backend**: Express + Anthropic SDK — deployed on **Railway**
- **Deploy split**: Frontend → Vercel (CDN, free), Backend → Railway (~$5/mo, persistent WebSocket)

## Repo
`github.com/gauravpassi/upcore-agent` — standalone repo, separate from TurboIAM.

## Directory Structure
```
upcore-agent/
├── server/                  Express + Agent SDK backend (→ Railway)
│   ├── src/
│   │   ├── index.ts         Entry: Express + WebSocket server + repo clone on startup
│   │   ├── agent.ts         Claude Agent SDK, tools, system prompt
│   │   └── tools/
│   │       ├── readFile.ts      Read file from context/ folder
│   │       ├── searchCode.ts    Grep search across context files
│   │       ├── listFiles.ts     List available context files
│   │       ├── getContext.ts    Return named brain file instantly
│   │       ├── readRepoFile.ts  Read any file from live turbo-claude repo ← NEW
│   │       ├── writeFile.ts     Write/create files in turbo-claude repo  ← NEW
│   │       ├── runCommand.ts    Run safe shell commands in repo dir       ← NEW
│   │       └── gitPush.ts       git add + commit + push → auto-deploy    ← NEW
│   ├── package.json
│   └── CLAUDE.md            Server-specific brain →
├── frontend/                React chat UI (→ Vercel)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── InputBar.tsx
│   │   │   ├── Message.tsx
│   │   │   └── ToolBadge.tsx
│   │   └── hooks/
│   │       └── useAgent.ts
│   ├── package.json
│   └── CLAUDE.md
├── context/                 TurboIAM brain files (auto-synced from live repo on startup + after push)
│   ├── CLAUDE.md            Root TurboIAM context
│   ├── BACKEND_CLAUDE.md    Backend-specific context
│   ├── FRONTEND_CLAUDE.md   Frontend-specific context
│   ├── API_REFERENCE.md     All TurboIAM endpoints
│   ├── DATA_MODEL.md        All Prisma models
│   └── DESIGN_SYSTEM.md     Colors, components, props
├── railway.json             Deploy config
├── nixpacks.toml
└── CLAUDE.md                ← This file
```

## Key Architecture Decisions
- **WebSocket for streaming**: Server streams agent text chunks + tool events to frontend in real-time
- **JWT auth**: Password → JWT (24h) → WS connects with `?token=<jwt>`
- **Live repo access**: On startup, server clones `turbo-claude` repo to `TURBO_REPO_DIR` (default `/tmp/turbo-claude`)
- **Context auto-sync**: Brain files in `context/` are synced from live repo on startup AND after every `git_push`
- **Full code/push loop**: Agent reads live code → writes changes → verifies TS → pushes → Railway+Vercel auto-deploy
- **Rate limiting**: Login → 5 attempts/15min; WS → 10 messages/min

## Agent Tools (8 total)

| Tool | Purpose |
|---|---|
| `get_context` | Fast access to brain files (ROOT, API_REFERENCE, DATA_MODEL, DESIGN_SYSTEM) |
| `list_files` | List all files in context/ folder |
| `read_file` | Read a specific file from context/ folder |
| `search_code` | Grep search across context files |
| `read_repo_file` | Read any file from the live turbo-claude repo |
| `write_file` | Write/overwrite a file in the turbo-claude repo |
| `run_command` | Run safe commands (tsc, npm build, git status) in repo |
| `git_push` | Commit + push → triggers Railway + Vercel auto-deploy |

## Agent Workflow (Code + Deploy)
1. `get_context` / `read_repo_file` — understand existing code
2. `write_file` — implement the fix or feature
3. `run_command("npx tsc --noEmit", "turbo-backend")` — verify no TS errors
4. `run_command("npx tsc --noEmit", "turbo-frontend")` — verify frontend TS
5. `git_push` — commit + push → Railway and Vercel auto-deploy
6. Context files auto-synced after push

## WebSocket Message Protocol
```typescript
// Client → Server
{ type: 'message', content: string }
{ type: 'cancel' }

// Server → Client (streamed)
{ type: 'text_chunk', content: string }
{ type: 'tool_start', tool: string }
{ type: 'tool_done', tool: string, result: string }
{ type: 'complete', usage: { input: number, output: number } }
{ type: 'error', message: string }
```

## Environment Variables

### Server (Railway dashboard)
```
ANTHROPIC_API_KEY=sk-ant-...               # Claude API key (required)
AGENT_PASSWORD=<strong-password>           # Login password (required)
AGENT_JWT_SECRET=<random-32-char-string>   # openssl rand -hex 32 (required)
GITHUB_TOKEN=<github-pat>                  # Push to turbo-claude repo (required for write)
TURBO_REPO_URL=https://github.com/gauravpassi/turbo-claude  # Repo to clone (required for write)
TURBO_REPO_DIR=/tmp/turbo-claude           # Where to clone locally (optional, default /tmp/turbo-claude)
NODE_ENV=production
PORT=                                      # Set by Railway automatically
```

### Frontend (Vercel dashboard)
```
VITE_API_URL=https://<railway-url>/api
VITE_WS_URL=wss://<railway-url>/ws
```

## Deploy Architecture
```
Developer Browser
    ↓  HTTPS
Vercel CDN  (React chat UI)
    ↓  WSS
Railway Server  (Express + Agent SDK)
    ↓  reads/writes
/tmp/turbo-claude  (cloned turbo-claude repo)
    ↓  git push
GitHub → Railway auto-deploy (backend) + Vercel auto-deploy (frontend)
    ↓  HTTPS
Anthropic API  (claude-sonnet-4-5)
```

## Run Commands
```bash
# Server
cd server && npm install && npm run dev     # dev, port 3000

# Frontend
cd frontend && npm install && npm run dev   # Vite dev, port 5174
```

## Sprint Status
- Sprint 1: ✅ Agent core + tools + WebSocket server
- Sprint 2: ✅ Chat UI (streaming, tool badges, code blocks)
- Sprint 3: ✅ Railway deploy + auth
- Sprint 4: ✅ Write/push tools (read_repo_file, write_file, run_command, git_push)
- Sprint 5: ⏳ Polish (conversation history, copy code, context selector)

## Brain File Maintenance
After any session where you modify this project:
- Added/changed tool → update tools table above + `server/CLAUDE.md`
- Added WS message type → update protocol section
- Added frontend component → update `frontend/CLAUDE.md`
- Changed env vars → update Environment Variables section
- Changed deploy config → update Deploy Architecture section

Do this BEFORE ending the session, even if the user didn't ask.
