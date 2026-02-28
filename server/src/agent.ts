import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { readFile } from './tools/readFile.js';
import { searchCode } from './tools/searchCode.js';
import { listFiles } from './tools/listFiles.js';
import { getContext } from './tools/getContext.js';
import { readRepoFile } from './tools/readRepoFile.js';
import { writeFile } from './tools/writeFile.js';
import { runCommand } from './tools/runCommand.js';
import { gitPush } from './tools/gitPush.js';
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from './tools/checkpoint.js';

const CONTEXT_DIR = path.resolve(__dirname, '../../context');

// ─── Event Types ─────────────────────────────────────────────────────────────
// Discriminated union of all events the agent can emit — consumed by WS and Telegram transports
export type AgentEvent =
  | { type: 'text_chunk'; content: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_done'; tool: string; result: string }
  | { type: 'heartbeat'; message: string; elapsed: number }
  | { type: 'needs_continue'; summary: string }
  | { type: 'complete'; usage: { input: number; output: number } }
  | { type: 'error'; message: string };

// ─── System Prompt ────────────────────────────────────────────────────────────
function loadSystemPrompt(): string {
  const claudeMdPath = path.join(CONTEXT_DIR, 'CLAUDE.md');
  let turboIamContext = '';

  if (fs.existsSync(claudeMdPath)) {
    turboIamContext = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  return `You are TURBOIAM-CODER, an autonomous software engineering agent for the TurboIAM platform.
You work in small, verifiable cycles and NEVER go silent. You always show visible progress.

Stack: NestJS + TypeScript backend | React 18 + Vite + Tailwind CSS v4 frontend | Prisma + PostgreSQL | Redis | Okta OIDC SSO | JWT RBAC

## TurboIAM Codebase Context
${turboIamContext}

═══════════════════════════════════════════════
CHECKPOINT PROTOCOL — MANDATORY, EVERY SESSION
═══════════════════════════════════════════════
1. SESSION START: Call load_checkpoint FIRST — always, every session, no exceptions.
   - Checkpoint found → resume from NEXT_STEP exactly. Skip completed steps.
   - No checkpoint → fresh task. Proceed with the user's request normally.

2. AFTER EACH MAJOR STEP: Call save_checkpoint to persist progress.
   - After reading/planning (PLAN phase complete)
   - After writing files (EXECUTE phase complete)
   - After TypeScript verification (VERIFY phase complete)
   - Before git_push

3. PHASE BOUNDARY — save and hand off when EITHER condition is true:
   - You have made 6+ tool calls in this phase, OR
   - The response is getting long (you're approaching context limits)
   Action: call save_checkpoint with exact nextStep, then STOP with "---PHASE COMPLETE---"
   The system will automatically start a new phase and continue from the checkpoint.

4. TASK COMPLETE: Call clear_checkpoint as the very LAST action after git_push succeeds.

═══════════════════════════════════════════════
CORE BEHAVIOR — READ THIS FIRST
═══════════════════════════════════════════════
- Work in continuous cycles: PLAN → EXECUTE → VERIFY → CHECKPOINT → NEXT
- NEVER attempt an entire task in one shot — always take the smallest safe step
- Stream progress every cycle using [1/5] markers
- NEVER say "I'll wait for you to run this" — always provide the next action immediately

═══════════════════════════════════════════════
TASK CONTRACT (output this at the start of every NEW task)
═══════════════════════════════════════════════
Output this block before writing any code:

**Goal:** (1–2 lines)
**Acceptance Criteria:** (testable, explicit)
**Files to touch:** (list)
**Definition of Done:** TypeScript passes + git_push succeeds + Railway/Vercel deploy triggered
**Stop Conditions:** (only list if human decision truly required, e.g. ambiguous business logic)

═══════════════════════════════════════════════
CYCLE FORMAT (use every cycle)
═══════════════════════════════════════════════

### [1/5] PLAN — Smallest Next Step
- Choose ONE small step executable right now
- If uncertain: read the file first before editing anything

### [2/5] EXECUTE — Concrete Actions
- Use tools: read_repo_file → write_file → run_command → git_push
- Write COMPLETE file contents — no truncation, no placeholders
- Minimal changes only — prefer targeted edits over full rewrites

### [3/5] VERIFY — Evidence
- Always run: run_command("npx tsc --noEmit", "turbo-backend") and/or "turbo-frontend"
- Report the exact command output (pass ✅ or error ❌)
- If tests exist: run_command("npm run test", "turbo-backend")

### [4/5] CHECKPOINT — What Changed
- Files touched (list each)
- What behavior changed
- What remains to do
- Call save_checkpoint with this info

### [5/5] NEXT — Continue Immediately
- State exactly what you will do in the very next cycle
- Start the next cycle without waiting

═══════════════════════════════════════════════
TURBOIAM CODE RULES (MANDATORY)
═══════════════════════════════════════════════
- Multi-tenant: EVERY DB query must filter by enterpriseId — never cross-tenant data
- Roles: ALWAYS use UPPERCASE_UNDERSCORE: SUPER_ADMIN, GRC_ADMIN, APP_ADMIN, SSO_ADMIN, AUDITOR, DELEGATE
- Secrets: NEVER return raw Okta clientSecret or apiToken via API (AES-256-GCM encrypted)
- Backend modules: service → controller → module → register in app.module.ts
- Frontend pages: create page → add to router/index.tsx → add to Sidebar.tsx → add to routes.ts
- Design system: use exact tokens (#4F46E5 primary, #111827 text, #E9EAEB border, etc.)
- Always use @Roles() + @UseGuards(JwtAuthGuard, RolesGuard) on protected endpoints

═══════════════════════════════════════════════
TOOL USAGE STRATEGY
═══════════════════════════════════════════════
Read (understand first):
  0. load_checkpoint()           — ALWAYS FIRST: check for unfinished work
  1. get_context('ROOT')         — architecture, patterns, sprint status
  2. get_context('API_REFERENCE')— existing endpoints (check before adding new)
  3. get_context('DATA_MODEL')   — Prisma models and relationships
  4. get_context('DESIGN_SYSTEM')— UI colors, component props
  5. search_code(pattern)        — find patterns across context files
  6. read_repo_file(path)        — read ACTUAL source files before editing

Write & Deploy:
  7. write_file(path, content)   — write complete file (no truncation)
  8. run_command("npx tsc --noEmit", "turbo-backend")   — verify backend TS
  9. run_command("npx tsc --noEmit", "turbo-frontend")  — verify frontend TS
  10. save_checkpoint(...)       — save progress before push
  11. git_push(message)          — commit + push → Railway + Vercel auto-deploy
  12. clear_checkpoint()         — ALWAYS LAST: clear checkpoint after successful deploy

═══════════════════════════════════════════════
ANTI-STUCK RECOVERY (auto-attempt, in order)
═══════════════════════════════════════════════
If blocked:
  1. Reduce scope — implement smallest working slice
  2. Read more — read_repo_file on related files, search_code for patterns
  3. Inspect errors — run_command to see exact error output
  After 3 attempts still blocked: ask ONE precise question to the human.

═══════════════════════════════════════════════
STREAMING STYLE
═══════════════════════════════════════════════
- Write short lines
- Use [1/5] PLAN, [2/5] EXECUTE etc. markers
- Emit progress after every tool call
- Never write walls of text before taking action — act first, explain briefly`;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: readFile.name,
    description: readFile.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative path to file inside context/ (e.g. "CLAUDE.md", "API_REFERENCE.md")' },
      },
      required: ['path'],
    },
  },
  {
    name: searchCode.name,
    description: searchCode.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Text pattern to search for (case-insensitive)' },
        file: { type: 'string', description: 'Optional: limit search to a specific file (e.g. "API_REFERENCE.md")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: listFiles.name,
    description: listFiles.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: getContext.name,
    description: getContext.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          enum: ['ROOT', 'API_REFERENCE', 'DATA_MODEL', 'DESIGN_SYSTEM'],
          description: 'Which brain file to retrieve',
        },
      },
      required: ['name'],
    },
  },
  {
    name: readRepoFile.name,
    description: readRepoFile.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root (e.g. "turbo-backend/src/modules/auth/auth.service.ts")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: writeFile.name,
    description: writeFile.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root (e.g. "turbo-backend/src/modules/foo/foo.service.ts")',
        },
        content: {
          type: 'string',
          description: 'Complete file content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: runCommand.name,
    description: runCommand.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to run (e.g. "npx tsc --noEmit", "npm run build", "git status")',
        },
        cwd: {
          type: 'string',
          description: 'Subdirectory relative to repo root (e.g. "turbo-backend", "turbo-frontend")',
        },
      },
      required: ['command'],
    },
  },
  {
    name: gitPush.name,
    description: gitPush.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Conventional commit message (e.g. "fix: resolve user list pagination bug")',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to stage. If omitted, stages all changed files.',
        },
      },
      required: ['message'],
    },
  },
  // ── Checkpoint tools ───────────────────────────────────────────────────────
  {
    name: saveCheckpoint.name,
    description: saveCheckpoint.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        goal: { type: 'string', description: 'What the overall task is trying to achieve' },
        acceptanceCriteria: { type: 'string', description: 'What "done" looks like (testable)' },
        filesTouched: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files modified so far',
        },
        completedSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Steps already completed in previous phases',
        },
        nextStep: { type: 'string', description: 'Exactly what the next phase should do first' },
        lastResult: { type: 'string', description: 'Output of the last command or verification' },
      },
      required: ['goal', 'acceptanceCriteria', 'filesTouched', 'completedSteps', 'nextStep'],
    },
  },
  {
    name: loadCheckpoint.name,
    description: loadCheckpoint.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: clearCheckpoint.name,
    description: clearCheckpoint.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

type ToolName =
  | 'read_file'
  | 'search_code'
  | 'list_files'
  | 'get_context'
  | 'read_repo_file'
  | 'write_file'
  | 'run_command'
  | 'git_push'
  | 'save_checkpoint'
  | 'load_checkpoint'
  | 'clear_checkpoint';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>;

const TOOL_HANDLERS: Record<ToolName, ToolHandler> = {
  read_file: readFile.handler as ToolHandler,
  search_code: searchCode.handler as ToolHandler,
  list_files: listFiles.handler as ToolHandler,
  get_context: getContext.handler as ToolHandler,
  read_repo_file: readRepoFile.handler as ToolHandler,
  write_file: writeFile.handler as ToolHandler,
  run_command: runCommand.handler as ToolHandler,
  git_push: gitPush.handler as ToolHandler,
  save_checkpoint: saveCheckpoint.handler as ToolHandler,
  load_checkpoint: loadCheckpoint.handler as ToolHandler,
  clear_checkpoint: clearCheckpoint.handler as ToolHandler,
};

interface IncomingImage {
  data: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  name: string;
}

// ─── Token budget thresholds ──────────────────────────────────────────────────
const TOKEN_WARN_THRESHOLD  = 90_000;   // emit text warning at this point
const TOKEN_CUTOFF_THRESHOLD = 110_000; // force checkpoint + needs_continue

// Max turns per phase — keeps each API conversation small
const MAX_TURNS_PER_PHASE = 12;

// Heartbeat interval: emit a "still alive" event every N ms during tool execution
const HEARTBEAT_INTERVAL_MS = 10_000;

// ─── Forced checkpoint save ───────────────────────────────────────────────────
/**
 * Called before emitting needs_continue (either token cutoff or max turns).
 * Makes a separate, minimal API call with tool_choice forced to save_checkpoint
 * so the agent writes its current state to disk before the phase ends.
 * This guarantees the next phase can always load_checkpoint and resume correctly.
 */
async function forceSaveCheckpoint(
  client: Anthropic,
  messages: Anthropic.Messages.MessageParam[],
  onEvent: (event: AgentEvent) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  if (abortSignal.aborted) return;

  onEvent({
    type: 'text_chunk',
    content: '\n\n📌 *Saving checkpoint before phase ends...*\n',
  });

  try {
    // Force the model to call save_checkpoint with everything it knows from context
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: loadSystemPrompt(),
      tools: TOOLS,
      tool_choice: { type: 'tool', name: 'save_checkpoint' },
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'PHASE END — MANDATORY ACTION: Call save_checkpoint right now with a full summary of:\n' +
            '- goal: the overall task\n' +
            '- acceptanceCriteria: what "done" means\n' +
            '- filesTouched: all files modified so far ([] if none)\n' +
            '- completedSteps: everything done so far as a list\n' +
            '- nextStep: EXACTLY what to do first in the next phase (be specific)\n' +
            '- lastResult: the last tool output or current status\n' +
            'Base this on the full conversation above. This is required to resume correctly.',
        },
      ],
    });

    // Execute the save_checkpoint tool call the model returned
    for (const block of response.content) {
      if (block.type !== 'tool_use' || block.name !== 'save_checkpoint') continue;
      onEvent({ type: 'tool_start', tool: 'save_checkpoint' });
      try {
        const result = await saveCheckpoint.handler(block.input as Parameters<typeof saveCheckpoint.handler>[0]);
        const text = result.content[0]?.text ?? '';
        onEvent({ type: 'tool_done', tool: 'save_checkpoint', result: text });
        onEvent({ type: 'text_chunk', content: `\n${text}\n` });
      } catch (err) {
        onEvent({
          type: 'text_chunk',
          content: `\n⚠️ Checkpoint save failed: ${(err as Error).message}\n`,
        });
      }
      break;
    }
  } catch (err) {
    // Non-fatal — log and continue; the phase will still hand off
    onEvent({
      type: 'text_chunk',
      content: `\n⚠️ Could not auto-save checkpoint: ${(err as Error).message}\n`,
    });
  }
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────
export async function runAgent(
  userMessage: string,
  images: IncomingImage[] | undefined,
  conversationHistory: Anthropic.Messages.MessageParam[],
  onEvent: (event: AgentEvent) => void,
  abortSignal: AbortSignal,
): Promise<Anthropic.Messages.MessageParam[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build user message content — images first, then text (Claude vision format)
  let userContent: Anthropic.Messages.MessageParam['content'];

  if (images && images.length > 0) {
    const parts: Anthropic.Messages.ContentBlockParam[] = [
      ...images.map((img): Anthropic.Messages.ImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      })),
    ];
    if (userMessage.trim()) {
      parts.push({ type: 'text', text: userMessage });
    }
    userContent = parts;
  } else {
    userContent = userMessage;
  }

  const messages: Anthropic.Messages.MessageParam[] = [
    ...conversationHistory,
    { role: 'user', content: userContent },
  ];

  let turns = 0;
  let cumulativeInputTokens = 0;

  while (turns < MAX_TURNS_PER_PHASE) {
    if (abortSignal.aborted) break;
    turns++;

    // Stream the response
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: loadSystemPrompt(),
      tools: TOOLS,
      messages,
    });

    let assistantContent: Anthropic.Messages.ContentBlock[] = [];
    let currentTextContent = '';
    const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

    // Process stream events
    for await (const event of stream) {
      if (abortSignal.aborted) break;

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          onEvent({ type: 'tool_start', tool: event.content_block.name });
          toolUseBlocks.push({ ...event.content_block, input: {} });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          currentTextContent += chunk;
          onEvent({ type: 'text_chunk', content: chunk });
        } else if (event.delta.type === 'input_json_delta') {
          const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
          if (lastTool) {
            (lastTool as { _rawInput?: string })._rawInput =
              ((lastTool as { _rawInput?: string })._rawInput ?? '') + event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_stop') {
        const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
        if (lastTool && (lastTool as { _rawInput?: string })._rawInput) {
          try {
            lastTool.input = JSON.parse((lastTool as { _rawInput?: string })._rawInput ?? '{}');
          } catch {
            lastTool.input = {};
          }
        }
      } else if (event.type === 'message_stop') {
        const finalMsg = await stream.finalMessage();
        assistantContent = finalMsg.content;

        // Track cumulative token usage
        cumulativeInputTokens += finalMsg.usage.input_tokens;

        // ── Token budget warning ──────────────────────────────────────────────
        if (cumulativeInputTokens > TOKEN_WARN_THRESHOLD && cumulativeInputTokens <= TOKEN_CUTOFF_THRESHOLD) {
          onEvent({
            type: 'text_chunk',
            content: `\n\n⚠️ *Context is getting large (${Math.round(cumulativeInputTokens / 1000)}k tokens) — saving checkpoint and continuing in a fresh phase soon...*\n`,
          });
        }

        // ── Token budget exceeded — force checkpoint save then hand off ─────────
        if (cumulativeInputTokens > TOKEN_CUTOFF_THRESHOLD) {
          const updatedMessages = [...messages, { role: 'assistant' as const, content: assistantContent }];
          await forceSaveCheckpoint(client, updatedMessages, onEvent, abortSignal);
          onEvent({
            type: 'needs_continue',
            summary: `Context reached ${Math.round(cumulativeInputTokens / 1000)}k tokens. Checkpoint saved. Continuing in a fresh phase with clean context.`,
          });
          return updatedMessages;
        }

        if (finalMsg.stop_reason === 'end_turn') {
          onEvent({
            type: 'complete',
            usage: { input: finalMsg.usage.input_tokens, output: finalMsg.usage.output_tokens },
          });
          return [
            ...messages,
            { role: 'assistant', content: assistantContent },
          ];
        }

        if (finalMsg.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: assistantContent });

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue;
            if (abortSignal.aborted) break;

            const handler = TOOL_HANDLERS[block.name as ToolName];
            let resultText = '';

            if (handler) {
              // ── Heartbeat during long-running tool calls ────────────────────
              const toolStartTime = Date.now();
              let heartbeatInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
                if (!abortSignal.aborted) {
                  const elapsed = Math.round((Date.now() - toolStartTime) / 1000);
                  onEvent({
                    type: 'heartbeat',
                    message: `${block.name} running...`,
                    elapsed,
                  });
                }
              }, HEARTBEAT_INTERVAL_MS);

              try {
                const result = await handler(block.input as Record<string, unknown>);
                resultText = result.content[0]?.text ?? '';
              } catch (err) {
                resultText = `Error executing tool: ${(err as Error).message}`;
              } finally {
                if (heartbeatInterval !== null) {
                  clearInterval(heartbeatInterval);
                  heartbeatInterval = null;
                }
              }
            } else {
              resultText = `Unknown tool: ${block.name}`;
            }

            onEvent({
              type: 'tool_done',
              tool: block.name,
              result: resultText.slice(0, 500),
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: resultText,
            });
          }

          messages.push({ role: 'user', content: toolResults });
          // Continue the loop for next turn
        } else {
          // max_tokens or other stop reason
          onEvent({
            type: 'complete',
            usage: { input: finalMsg.usage.input_tokens, output: finalMsg.usage.output_tokens },
          });
          return [...messages, { role: 'assistant', content: assistantContent }];
        }
      }
    }

    if (abortSignal.aborted) break;
    void currentTextContent; // suppress unused warning
  }

  // ── Max turns per phase reached ─────────────────────────────────────────────
  // Force save checkpoint THEN hand off — next phase will resume from it
  await forceSaveCheckpoint(client, messages, onEvent, abortSignal);
  onEvent({
    type: 'needs_continue',
    summary: `Phase limit (${MAX_TURNS_PER_PHASE} turns) reached. Checkpoint saved. Next phase will resume automatically.`,
  });
  return messages;
}
