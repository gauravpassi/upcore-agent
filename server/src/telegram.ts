import TelegramBot from 'node-telegram-bot-api';
import type Anthropic from '@anthropic-ai/sdk';
import { runAgent } from './agent.js';
import type { AgentEvent } from './agent.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const EDIT_INTERVAL_MS = 1500;     // max 1 Telegram edit per 1.5 s (rate limit safety)
const TELEGRAM_MAX_CHARS = 4096;   // Telegram message length limit
const TG_MESSAGE_LIMIT = 10;
const TG_MESSAGE_WINDOW_MS = 60 * 1000;

// ─── Chat session state ───────────────────────────────────────────────────────
interface TelegramChatState {
  conversationHistory: Anthropic.Messages.MessageParam[];
  abortController: AbortController | null;
  messageCount: number;
  windowStart: number;
}

const chatStates = new Map<number, TelegramChatState>();

function getOrCreateState(chatId: number): TelegramChatState {
  if (!chatStates.has(chatId)) {
    chatStates.set(chatId, {
      conversationHistory: [],
      abortController: null,
      messageCount: 0,
      windowStart: Date.now(),
    });
  }
  return chatStates.get(chatId)!;
}

// ─── Security ─────────────────────────────────────────────────────────────────
function isAllowed(chatId: number): boolean {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '';
  const allowed = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return allowed.includes(chatId);
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
function checkRateLimit(state: TelegramChatState): boolean {
  const now = Date.now();
  if (now - state.windowStart > TG_MESSAGE_WINDOW_MS) {
    state.messageCount = 0;
    state.windowStart = now;
  }
  state.messageCount++;
  return state.messageCount <= TG_MESSAGE_LIMIT;
}

// ─── TelegramMessageWriter ────────────────────────────────────────────────────
// Handles live streaming updates to a Telegram message via throttled edits.
// Claude emits dozens of text_chunk events per second; this coalesces them into
// at most one Telegram API call per 1.5 s to stay within rate limits.
class TelegramMessageWriter {
  private bot: TelegramBot;
  private chatId: number;

  private buffer = '';           // full accumulated text so far
  private messageId: number | null = null;
  private messagePageIndex = 0;  // how many full 4096-char pages have been sent

  private lastEditTime = 0;
  private editTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bot: TelegramBot, chatId: number) {
    this.bot = bot;
    this.chatId = chatId;
  }

  appendText(chunk: string): void {
    this.buffer += chunk;
    this.scheduleFlush();
  }

  appendToolStart(name: string): void {
    this.buffer += `\n\`🔧 ${name}...\``;
    this.scheduleFlush();
  }

  appendToolDone(name: string): void {
    // Replace the running indicator with a done marker
    this.buffer = this.buffer.replace(
      new RegExp(`\`🔧 ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\.\\.\`$`),
      `\`✅ ${name}\``,
    );
    this.scheduleFlush();
  }

  async finalize(): Promise<void> {
    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }
    await this.flush();
  }

  // ── internal ──────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.editTimer) return; // already scheduled
    const now = Date.now();
    const delay = Math.max(0, EDIT_INTERVAL_MS - (now - this.lastEditTime));
    this.editTimer = setTimeout(() => {
      this.editTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (!this.buffer) return;

    // Determine the slice for the current page
    const pageStart = this.messagePageIndex * TELEGRAM_MAX_CHARS;
    const currentPage = this.buffer.slice(pageStart, pageStart + TELEGRAM_MAX_CHARS);
    if (!currentPage) return;

    await this.sendOrEdit(currentPage);
    this.lastEditTime = Date.now();

    // If the buffer has overflowed into the next page, start a new message
    if (this.buffer.length > (this.messagePageIndex + 1) * TELEGRAM_MAX_CHARS) {
      this.messagePageIndex++;
      this.messageId = null; // next flush will send a new message
      this.scheduleFlush();
    }
  }

  private async sendOrEdit(text: string): Promise<void> {
    try {
      if (this.messageId === null) {
        const sent = await this.bot.sendMessage(this.chatId, text, {
          parse_mode: 'Markdown',
        });
        this.messageId = sent.message_id;
      } else {
        await this.bot.editMessageText(text, {
          chat_id: this.chatId,
          message_id: this.messageId,
          parse_mode: 'Markdown',
        });
      }
    } catch (err) {
      const msg = (err as Error).message ?? '';

      // Telegram returns 400 when content hasn't changed — silently ignore
      if (msg.includes('message is not modified')) return;

      // Markdown parse error — retry as plain text
      if (msg.includes("can't parse entities") || msg.includes('Bad Request')) {
        try {
          if (this.messageId === null) {
            const sent = await this.bot.sendMessage(this.chatId, text);
            this.messageId = sent.message_id;
          } else {
            await this.bot.editMessageText(text, {
              chat_id: this.chatId,
              message_id: this.messageId,
            });
          }
        } catch {
          // If even plain text fails, give up silently — don't crash the agent
        }
        return;
      }

      console.error('[Telegram] Edit error:', msg);
    }
  }
}

// ─── Bot setup ────────────────────────────────────────────────────────────────
export function initTelegramBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const bot = new TelegramBot(token, { polling: true });

  bot.on('message', (msg) => {
    void handleMessage(bot, msg);
  });

  bot.on('polling_error', (err) => {
    console.error('[Telegram] Polling error:', err.message);
  });

  return bot;
}

async function handleMessage(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();

  // ── Security gate ──────────────────────────────────────────────────────────
  if (!isAllowed(chatId)) {
    await bot.sendMessage(
      chatId,
      '⛔ Access denied. This bot is private.\n\nYour chat ID is: `' + chatId + '`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const state = getOrCreateState(chatId);

  // ── Commands ───────────────────────────────────────────────────────────────
  if (text === '/start') {
    await bot.sendMessage(
      chatId,
      '*UpcoreCodeTestDeploy Agent* 🤖\n\n' +
      'Send me a coding task and I\'ll generate production-ready TurboIAM code with live streaming.\n\n' +
      '*Commands:*\n' +
      '/reset — clear conversation history\n' +
      '/cancel — abort the current request\n' +
      '/start — show this message',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  if (text === '/reset') {
    state.abortController?.abort();
    state.abortController = null;
    state.conversationHistory = [];
    await bot.sendMessage(chatId, '🔄 Conversation history cleared.');
    return;
  }

  if (text === '/cancel') {
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
      await bot.sendMessage(chatId, '⏹ Request cancelled.');
    } else {
      await bot.sendMessage(chatId, 'No active request to cancel.');
    }
    return;
  }

  // Ignore empty or command-like messages
  if (!text || text.startsWith('/')) return;

  // ── Rate limit ─────────────────────────────────────────────────────────────
  if (!checkRateLimit(state)) {
    await bot.sendMessage(chatId, '⏳ Rate limit reached (10 messages/min). Please wait.');
    return;
  }

  // ── Abort any in-flight request and start a new one ───────────────────────
  state.abortController?.abort();
  state.abortController = new AbortController();

  // Show typing indicator
  await bot.sendChatAction(chatId, 'typing');

  const writer = new TelegramMessageWriter(bot, chatId);

  try {
    state.conversationHistory = await runAgent(
      text,
      undefined, // no images in Telegram context
      state.conversationHistory,
      (event: AgentEvent) => {
        switch (event.type) {
          case 'text_chunk':
            writer.appendText(event.content);
            break;
          case 'tool_start':
            writer.appendToolStart(event.tool);
            break;
          case 'tool_done':
            writer.appendToolDone(event.tool);
            break;
          case 'complete':
            void writer.finalize().then(() => {
              void bot.sendMessage(
                chatId,
                `_Tokens used: ${event.usage.input} in · ${event.usage.output} out_`,
                { parse_mode: 'Markdown' },
              );
            });
            break;
          case 'error':
            void writer.finalize().then(() => {
              void bot.sendMessage(chatId, `❌ ${event.message}`);
            });
            break;
        }
      },
      state.abortController.signal,
    );
  } catch (err) {
    await writer.finalize();
    const errMsg = (err as Error).message ?? 'An unexpected error occurred';
    if (!errMsg.includes('aborted')) {
      await bot.sendMessage(chatId, `❌ Error: ${errMsg}`);
    }
  } finally {
    state.abortController = null;
  }
}
