import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import type { AttachedImage } from '../types';

interface InputBarProps {
  onSend: (content: string, images: AttachedImage[]) => void;
  onCancel: () => void;
  disabled: boolean;
  isStreaming: boolean;
}

const MAX_CHARS = 4000;
const CHAR_WARNING_THRESHOLD = 500;
const MAX_IMAGES = 4;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:image/...;base64, prefix — Claude API wants raw base64
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function InputBar({ onSend, onCancel, disabled, isStreaming }: InputBarProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || disabled || isStreaming) return;
    onSend(trimmed, images);
    setValue('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, images, disabled, isStreaming, onSend]);

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

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const allowed = files.filter((f) => ALLOWED_TYPES.includes(f.type));
    const remaining = MAX_IMAGES - images.length;
    const toProcess = allowed.slice(0, remaining);

    const newImages: AttachedImage[] = await Promise.all(
      toProcess.map(async (file) => ({
        data: await readFileAsBase64(file),
        mediaType: file.type as AttachedImage['mediaType'],
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      })),
    );

    setImages((prev) => [...prev, ...newImages]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [images]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const showCount = charCount >= CHAR_WARNING_THRESHOLD;
  const canSend = (value.trim().length > 0 || images.length > 0) && !disabled && !isStreaming && !isOverLimit;

  return (
    <div className="border-t border-[#E9EAEB] bg-white px-4 py-3">
      <div className="max-w-[800px] mx-auto">

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="w-16 h-16 object-cover rounded-lg border border-[#E9EAEB] shadow-sm"
                />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#111827] text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  title="Remove image"
                >
                  ×
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 rounded-b-lg truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div
          className={[
            'flex items-end gap-2 rounded-xl border bg-white transition-colors px-3 py-2',
            disabled ? 'border-[#E9EAEB] opacity-60' : 'border-[#E9EAEB] focus-within:border-[#4F46E5]',
          ].join(' ')}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || images.length >= MAX_IMAGES}
          />

          {/* Image attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming || images.length >= MAX_IMAGES}
            className={[
              'flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors mb-0.5',
              images.length >= MAX_IMAGES || disabled || isStreaming
                ? 'text-[#D1D5DB] cursor-not-allowed'
                : 'text-[#9CA3AF] hover:text-[#4F46E5] hover:bg-[#EEF2FF]',
            ].join(' ')}
            title={images.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image (PNG, JPG, GIF, WebP)'}
          >
            {/* Image icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS + 100))}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={isStreaming ? 'Agent is thinking...' : 'Ask about the TurboIAM codebase... (attach screenshots for context)'}
            rows={1}
            className="flex-1 resize-none outline-none text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent leading-relaxed py-1 max-h-[200px] overflow-y-auto"
            style={{ minHeight: '24px' }}
          />

          <div className="flex items-center gap-2 pb-1 flex-shrink-0">
            {showCount && (
              <span className={['text-xs tabular-nums', isOverLimit ? 'text-red-500' : 'text-[#9CA3AF]'].join(' ')}>
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
          Enter to send · Shift+Enter for newline · 📎 attach up to {MAX_IMAGES} images
        </p>
      </div>
    </div>
  );
}
