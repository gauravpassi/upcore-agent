import { useState, useRef, useCallback, KeyboardEvent } from 'react';

interface InputBarProps {
  onSend: (content: string) => void;
  onCancel: () => void;
  disabled: boolean;
  isStreaming: boolean;
}

const MAX_CHARS = 4000;
const CHAR_WARNING_THRESHOLD = 500;

export function InputBar({ onSend, onCancel, disabled, isStreaming }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, isStreaming, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const showCount = charCount >= CHAR_WARNING_THRESHOLD;
  const canSend = value.trim().length > 0 && !disabled && !isStreaming && !isOverLimit;

  return (
    <div className="border-t border-[#E9EAEB] bg-white px-4 py-3">
      <div className="max-w-[800px] mx-auto">
        <div
          className={[
            'flex items-end gap-2 rounded-xl border bg-white transition-colors px-3 py-2',
            disabled ? 'border-[#E9EAEB] opacity-60' : 'border-[#E9EAEB] focus-within:border-[#4F46E5]',
          ].join(' ')}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS + 100))}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={isStreaming ? 'Agent is thinking...' : 'Ask about the TurboIAM codebase...'}
            rows={1}
            className="flex-1 resize-none outline-none text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent leading-relaxed py-1 max-h-[200px] overflow-y-auto"
            style={{ minHeight: '24px' }}
          />

          <div className="flex items-center gap-2 pb-1 flex-shrink-0">
            {showCount && (
              <span
                className={[
                  'text-xs tabular-nums',
                  isOverLimit ? 'text-red-500' : 'text-[#9CA3AF]',
                ].join(' ')}
              >
                {charCount}/{MAX_CHARS}
              </span>
            )}

            {isStreaming ? (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
              >
                <span>⏹</span>
                <span>Cancel</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={[
                  'flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                  canSend
                    ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA] shadow-sm hover:shadow-md'
                    : 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed',
                ].join(' ')}
                title="Send (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <p className="text-[10px] text-[#9CA3AF] mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
