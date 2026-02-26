import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { readFile } from './tools/readFile.js';
import { searchCode } from './tools/searchCode.js';
import { listFiles } from './tools/listFiles.js';
import { getContext } from './tools/getContext.js';

const CONTEXT_DIR = path.resolve(__dirname, '../../context');

// Discriminated union of all events the agent can emit — consumed by WS and Telegram transports
export type AgentEvent =
  | { type: 'text_chunk'; content: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_done'; tool: string; result: string }
  | { type: 'complete'; usage: { input: number; output: number } }
  | { type: 'error'; message: string };

// Load TurboIAM brain as system prompt context
function loadSystemPrompt(): string {
  const claudeMdPath = path.join(CONTEXT_DIR, 'CLAUDE.md');
  let turboIamContext = '';

  if (fs.existsSync(claudeMdPath)) {
    turboIamContext = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  return `You are UpcoreCodeTestDeploy Agent, an expert in the TurboIAM codebase.

You help developers write production-ready code that follows TurboIAM patterns and conventions. You know the full stack: NestJS backend, React + Vite frontend, Prisma + PostgreSQL, Tailwind CSS v4, Okta SSO integration, and multi-tenant RBAC architecture.

## TurboIAM Codebase Context
${turboIamContext}

## Code Generation Rules
- Always follow TurboIAM patterns exactly (multi-tenant, RBAC, encryption)
- Use UPPERCASE_UNDERSCORE role format: SUPER_ADMIN, GRC_ADMIN, APP_ADMIN, SSO_ADMIN, AUDITOR, DELEGATE
- Always include enterpriseId filter in every database query — never return cross-tenant data
- Never return raw Okta secrets via API (they are AES-256-GCM encrypted)
- Follow the existing module structure: service → controller → module → app.module registration
- Use the exact color tokens and component APIs from the design system

## Tool Usage Strategy
1. Start with get_context('ROOT') for broad questions about patterns or architecture
2. Use get_context('API_REFERENCE') to check existing endpoints before adding new ones
3. Use get_context('DATA_MODEL') to understand Prisma models and relationships
4. Use get_context('DESIGN_SYSTEM') for UI component props and color tokens
5. Use search_code to find specific patterns, imports, or examples across files
6. Use read_file only when you need full file contents not covered by the brain files
7. Use list_files to discover what's available in the knowledge base

Generate complete, production-ready code. Do not add placeholders or TODOs unless absolutely necessary. Follow the patterns you observe in the codebase exactly.`;
}

// Tool definitions for the Anthropic API
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
];

type ToolName = 'read_file' | 'search_code' | 'list_files' | 'get_context';

const TOOL_HANDLERS: Record<ToolName, (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>> = {
  read_file: readFile.handler as (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>,
  search_code: searchCode.handler as (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>,
  list_files: listFiles.handler as (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>,
  get_context: getContext.handler as (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>,
};

export async function runAgent(
  userMessage: string,
  conversationHistory: Anthropic.Messages.MessageParam[],
  onEvent: (event: AgentEvent) => void,
  abortSignal: AbortSignal,
): Promise<Anthropic.Messages.MessageParam[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.Messages.MessageParam[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const MAX_TURNS = 15;
  let turns = 0;

  while (turns < MAX_TURNS) {
    if (abortSignal.aborted) break;
    turns++;

    // Stream the response
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
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
          // Accumulate tool input JSON
          const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
          if (lastTool) {
            (lastTool as { _rawInput?: string })._rawInput =
              ((lastTool as { _rawInput?: string })._rawInput ?? '') + event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_stop') {
        // Parse accumulated tool input
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

        // Build content blocks for history
        assistantContent = finalMsg.content;

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
          // Execute tools and continue
          messages.push({ role: 'assistant', content: assistantContent });

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue;
            if (abortSignal.aborted) break;

            const handler = TOOL_HANDLERS[block.name as ToolName];
            let resultText = '';

            if (handler) {
              try {
                const result = await handler(block.input as Record<string, unknown>);
                resultText = result.content[0]?.text ?? '';
              } catch (err) {
                resultText = `Error executing tool: ${(err as Error).message}`;
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

  // Max turns reached
  onEvent({ type: 'error', message: 'Max turns reached. Please start a new conversation.' });
  return messages;
}
