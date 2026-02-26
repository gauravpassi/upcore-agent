# UpcoreAgent — Frontend Brain

> Read this INSTEAD of scanning component files. Update when components or UI patterns change.
<!-- AUTO-MAINTENANCE: Update this file when... -->
<!-- - Adding/removing components -->
<!-- - Changing WebSocket message handling -->
<!-- - Adding new UI states or interactions -->
<!-- - Changing color tokens or layout dimensions -->

## App Structure (`src/`)
```
App.tsx              Root: checks auth → renders <LoginPage> or <ChatLayout>
pages/
  LoginPage.tsx      Centered login form (password input + submit)
  ChatLayout.tsx     Full app: sidebar + header + chat panel
components/
  ChatWindow.tsx     Scrollable message history, auto-scroll to bottom
  InputBar.tsx       Textarea + send button + char count
  Message.tsx        Single message bubble (user | agent | tool event)
  ToolBadge.tsx      Inline tool call pill: "🔍 Searching..." / "✓ read_file"
  CodeBlock.tsx      Syntax-highlighted code with copy button
hooks/
  useAuth.ts         Login call, JWT storage, token validation, logout
  useAgent.ts        WebSocket lifecycle + streaming state (uses JWT from useAuth)
```

## Component Quick-Ref
<!-- AUTO-MAINTENANCE: Update when components or props change -->

### `<ChatWindow messages={Message[]} isStreaming={bool} />`
- Renders list of `<Message>` components
- Auto-scrolls on new content via `useEffect` + `scrollIntoView`
- Shows typing indicator (3 pulsing dots) when `isStreaming && lastMessage.role === 'user'`

### `<Message message={Message} />`
```typescript
type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;          // markdown text
  toolEvents?: ToolEvent[]; // tool calls within this agent turn
  timestamp: Date;
  isStreaming?: boolean;     // true while agent is mid-response
}
```
- User: right-aligned, bg `#4F46E5`, white text
- Agent: left-aligned, bg `#F9FAFB`, border `#E9EAEB`, markdown rendered
- Code blocks inside agent messages rendered via `<CodeBlock>`

### `<ToolBadge event={ToolEvent} />`
```typescript
type ToolEvent = {
  tool: string;             // e.g., 'read_file'
  status: 'running' | 'done';
  result?: string;          // shown on hover/expand
}
```
- `running`: amber pill with spinner — `🔍 read_file...`
- `done`: green pill — `✓ read_file`
- Click to expand/collapse tool result

### `<InputBar onSend={fn} disabled={bool} />`
- Textarea, Enter to send, Shift+Enter for newline
- "Cancel" button appears while `isStreaming`
- Char count shown at 500+ chars

### `<CodeBlock code={string} language={string} />`
- Syntax highlighting via `highlight.js` (lightweight)
- Copy to clipboard button (top-right), shows "Copied!" for 2s
- Language badge top-left

## Deploy: Vercel
- `vercel.json` in `frontend/` root — no special config needed for Vite SPA
- Set `VITE_WS_URL=wss://your-app.railway.app/ws` in Vercel project env vars
- Auto-deploys on push to `main` branch (connect GitHub repo in Vercel dashboard)
- SPA routing: `vercel.json` must include `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`

## `useAgent` Hook
```typescript
const { messages, isStreaming, send, cancel } = useAgent(token);
// token comes from useAuth() — pass null to skip connection

// Internals:
// - Opens WS on mount: import.meta.env.VITE_WS_URL + '?token=' + token
//   Dev: ws://localhost:3000/ws | Prod: wss://your-app.railway.app/ws
// - On WS close with code 4001 (401) → calls onAuthError() → triggers logout
// - send(text): appends user message, sends { type: 'message', content: text }
// - Handles incoming:
//     text_chunk   → appends to last agent message (streaming)
//     tool_start   → adds ToolEvent{ status: 'running' } to last agent message
//     tool_done    → updates matching ToolEvent to status: 'done'
//     complete     → sets isStreaming = false, logs usage
//     error        → shows error toast, sets isStreaming = false
// - cancel(): sends { type: 'cancel' }, sets isStreaming = false
// - Reconnects on disconnect (exponential backoff, max 3 retries)
```

## Color Tokens
| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#4F46E5` | User message bg, send button, links |
| Primary hover | `#4338CA` | Button hover |
| Primary bg | `#EEF2FF` | Selected state, tool badge bg |
| Success | `#16A34A` | Tool done badge |
| Warning | `#D97706` | Tool running badge |
| Error | `#DC2626` | Error messages |
| Text primary | `#111827` | Agent message text |
| Text muted | `#6B7280` | Timestamps, metadata |
| Border | `#E9EAEB` | Message bubbles, input border |
| BG page | `#F3F4F6` | App background |
| BG surface | `#FFFFFF` | Chat panel, sidebar |

## Layout
- Sidebar: `240px` wide — agent name, conversation history list (future), settings icon
- Main panel: fills remaining width
- Header: `56px` — "UpcoreCodeTestDeploy Agent" title + status dot (green=connected)
- Input bar: fixed bottom, `80px` height
- Message area: scrollable, fills between header and input bar
- Max content width: `800px` centered in main panel

## Auth Flow (`useAuth` hook + `LoginPage`)

### Login Flow
```
1. App loads → reads localStorage key `upcore_token`
2. If token missing or expired (check exp claim) → render <LoginPage>
3. LoginPage: user enters password → POST /api/auth/login { password }
   - Success → store JWT in localStorage `upcore_token` → render <ChatLayout>
   - Fail    → show inline error "Invalid password", shake animation
4. ChatLayout mounts → useAgent opens WS with token in query param
5. If WS returns 401 (token expired mid-session) → clearToken() → back to <LoginPage>
```

### `useAuth` Hook
```typescript
const { token, login, logout, isLoading, error } = useAuth();

// login(password: string): POSTs to VITE_API_URL + '/auth/login'
//   → on 200: saves token to localStorage, updates state
//   → on 401: sets error = "Invalid password"
// logout(): removes token from localStorage, resets state
// token: string | null — null means not logged in
// isLoading: true while POST is in flight
```

### JWT Stored In
- `localStorage` key: `upcore_token`
- Value: raw JWT string (e.g. `eyJhbGc...`)
- Expiry check: decode payload client-side, compare `exp` to `Date.now()/1000`
- Never stored in sessionStorage or cookies

### `LoginPage` UI
- Centered card, same indigo design as TurboIAM login
- Single password input (type="password") + "Sign In" button
- Shows spinner while loading, error message on failure
- No username field — single shared password for all developers

## Key Packages
```json
{
  "react": "^18",
  "react-dom": "^18",
  "highlight.js": "^11",    // code syntax highlighting
  "react-markdown": "^9",   // render agent markdown responses
  "tailwindcss": "^4"
}
```

## How to Add a New Component
1. Create `src/components/<Name>.tsx`
2. Export named component
3. Import where needed
4. Update this file (components quick-ref section)
