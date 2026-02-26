# UpcoreAgent — Server Brain

> Read this INSTEAD of scanning source files. Update when tools, routes, or agent config change.
<!-- AUTO-MAINTENANCE: Update this file when... -->
<!-- - Adding/removing/changing a tool -->
<!-- - Changing WebSocket message protocol -->
<!-- - Adding new HTTP routes -->
<!-- - Changing agent model, maxTurns, or system prompt structure -->

## Entry Point (`src/index.ts`)
- Creates Express app + HTTP server + WebSocket server (`ws`) on same port
- `GET /` → serves `../frontend/dist/index.html` (static)
- `GET /health` → `{ status: "ok", uptime: Xs }`
- `POST /api/auth/login` → verifies password, returns signed JWT (see Auth section below)
- `GET /ws` → WebSocket upgrade — verifies `?token=<jwt>` query param before accepting
- Rate limit on login: 5 attempts / 15 min per IP (via `express-rate-limit`)
- Rate limit on WS messages: 10 messages / min per connection (tracked in-memory per socket)

## Agent Config (`src/agent.ts`)
Uses `@anthropic-ai/sdk` directly (raw streaming API) with a manual agentic loop:
```typescript
client.messages.stream({
  model: 'claude-sonnet-4-5',
  max_tokens: 8192,
  system: loadSystemPrompt(),   // persona + TurboIAM context/CLAUDE.md content
  tools: TOOLS,                  // read_file, search_code, list_files, get_context
  messages,                      // full conversation history
})
// MAX_TURNS = 15 — loop until end_turn or max turns reached
// Conversation history maintained per WS connection (in-memory)
```

## System Prompt Structure
1. Agent persona: "You are UpcoreCodeTestDeploy Agent, an expert in the TurboIAM codebase..."
2. Full content of `../context/CLAUDE.md` (stack, patterns, constraints)
3. Instruction: "When generating code, always follow TurboIAM patterns. Use UPPERCASE_UNDERSCORE roles. Always include enterpriseId in DB queries. Never return encrypted secrets."
4. Tool guidance: "Use get_context first for broad questions. Use read_file for specific files. Use search_code to find existing patterns."

## Tools Table
<!-- AUTO-MAINTENANCE: Update when tools change -->
| Tool | Description | Input | Returns |
|------|-------------|-------|---------|
| `read_file` | Read a file from context/ folder | `{ path: string }` | File contents as text |
| `search_code` | Search for a pattern across context files | `{ pattern: string, file?: string }` | Matching lines with line numbers |
| `list_files` | List all files available in context/ | none | Array of filenames |
| `get_context` | Get a named brain file instantly | `{ name: 'API_REFERENCE' \| 'DATA_MODEL' \| 'DESIGN_SYSTEM' \| 'ROOT' }` | Full file contents |

## Tool File Pattern (`src/tools/<name>.ts`)
```typescript
import { z } from 'zod';

export const toolName = {
  name: 'tool_name',
  description: 'What this tool does',
  schema: z.object({ param: z.string().describe('...') }),
  handler: async (args: { param: string }) => {
    try {
      const result = '...';
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
```

## Auth Flow (`src/auth.ts`)
```typescript
// POST /api/auth/login
// Request:  { password: string }
// Response: { token: string }  (JWT, 24h expiry)
// Error:    401 { message: "Invalid password" }

// JWT payload: { sub: 'agent-user', iat, exp }
// Signed with AGENT_JWT_SECRET (HS256)
// Verified on every WS upgrade request

// Login rate limit: 5 req / 15 min per IP
// Wrong password: always respond in ~200ms (constant time, prevents timing attacks)
```

## WebSocket Session Flow
```
1. User logs in: POST /api/auth/login { password } → { token }
2. Client stores token in localStorage
3. Client connects: ws://host/ws?token=<jwt>
4. Server verifies JWT on upgrade → rejects 401 if invalid/expired
5. Client sends: { type: 'message', content: 'Build the Users page...' }
6. Server starts agent query (async generator)
7. For each agent event:
   - stream_event + text_delta → { type: 'text_chunk', content: '...' }
   - tool_use start         → { type: 'tool_start', tool: 'read_file' }
   - tool_use result        → { type: 'tool_done', tool: 'read_file', result: '...' }
   - result (final)         → { type: 'complete', usage: { input, output } }
8. Client can send { type: 'cancel' } → server calls generator.return()
9. JWT expires after 24h → next WS connect returns 401 → frontend redirects to login
```

## Context Files (read-only)
| File | Key `name` for get_context | Contents |
|------|---------------------------|----------|
| `context/CLAUDE.md` | `ROOT` | Stack, patterns, sprint status |
| `context/API_REFERENCE.md` | `API_REFERENCE` | All endpoints + shapes |
| `context/DATA_MODEL.md` | `DATA_MODEL` | All Prisma models |
| `context/DESIGN_SYSTEM.md` | `DESIGN_SYSTEM` | Colors, components, props |

## Key Packages
```json
{
  "@anthropic-ai/sdk": "^0.39.0",   // Raw Anthropic SDK for streaming
  "express": "^4.18",
  "ws": "^8.16",
  "jsonwebtoken": "^9",              // sign + verify JWTs
  "express-rate-limit": "^7",        // login brute-force protection
  "zod": "^3.22",
  "cors": "^2.8",
  "helmet": "^7",
  "dotenv": "^16",
  "tsx": "^4.7"                      // Dev runner (ts-node replacement)
}
```

## Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...               # Claude API key
AGENT_PASSWORD=<strong-password>           # Single shared login password
AGENT_JWT_SECRET=<random-32-char-string>   # JWT signing key (openssl rand -hex 32)
PORT=3000
NODE_ENV=production
```

## Key File Locations
- `src/index.ts` — Express + WS setup, rate limiting, static serving
- `src/auth.ts` — `POST /api/auth/login` handler + JWT sign/verify helpers
- `src/agent.ts` — Agent SDK setup, system prompt, tool registration, streaming loop
- `src/tools/` — One file per tool
- `../context/` — Brain files the agent reads from

## Error Handling Rules
- Tool handlers NEVER throw — always catch and return error as text content
- WS handler catches all agent errors → sends `{ type: 'error', message }` to client
- Expired/invalid JWT on WS upgrade → HTTP 401 (client clears token + redirects to login)
- Wrong login password → 401 `{ message: "Invalid password" }` (after ~200ms constant delay)
- Agent `maxTurns` exceeded → SDK returns result with `subtype: 'max_turns'` → send as error
