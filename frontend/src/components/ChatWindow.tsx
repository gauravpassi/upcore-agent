import { useEffect, useRef } from 'react';
import { Message } from './Message';
import type { Message as MessageType } from '../types';

interface ChatWindowProps {
  messages: MessageType[];
  isStreaming: boolean;
}

export function ChatWindow({ messages, isStreaming }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const showTypingIndicator =
    isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-[800px] mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full pt-20 text-center">
            <div className="w-16 h-16 bg-[#EEF2FF] rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">🧠</span>
            </div>
            <h2 className="text-lg font-semibold text-[#111827] mb-2">
              UpcoreCodeTestDeploy Agent
            </h2>
            <p className="text-sm text-[#6B7280] max-w-md leading-relaxed">
              Ask me anything about the TurboIAM codebase. I can generate production-ready code
              following TurboIAM patterns, explain architecture decisions, or help debug issues.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {STARTER_PROMPTS.map((prompt) => (
                <div
                  key={prompt}
                  className="text-left px-3 py-2.5 bg-white border border-[#E9EAEB] rounded-lg text-sm text-[#374151] hover:border-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer transition-colors"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {/* Typing indicator — shown while waiting for first token */}
        {showTypingIndicator && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border border-[#E9EAEB] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <span className="typing-dot w-2 h-2 bg-[#9CA3AF] rounded-full" />
                <span className="typing-dot w-2 h-2 bg-[#9CA3AF] rounded-full" />
                <span className="typing-dot w-2 h-2 bg-[#9CA3AF] rounded-full" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const STARTER_PROMPTS = [
  '📋 Show me the full API endpoint list',
  '🏗️ How do I add a new NestJS module?',
  '🎨 What are the design system colors?',
  '🗄️ Explain the Prisma data model',
];
