import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { ToolBadge } from './ToolBadge';
import type { Message as MessageType } from '../types';

interface MessageProps {
  message: MessageType;
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '');
    const code = String(children).replace(/\n$/, '');
    const isInline = !className && !code.includes('\n');

    if (isInline) {
      return (
        <code
          className="bg-[#F3F4F6] text-[#111827] rounded px-1.5 py-0.5 text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock code={code} language={match?.[1]} />;
  },
  pre({ children }) {
    // Let CodeBlock handle its own <pre>
    return <>{children}</>;
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  h1({ children }) {
    return <h1 className="text-xl font-bold mb-3 mt-4 text-[#111827]">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-lg font-semibold mb-2 mt-3 text-[#111827]">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold mb-2 mt-2 text-[#111827]">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-[#4F46E5] pl-3 italic text-[#6B7280] my-2">
        {children}
      </blockquote>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#4F46E5] hover:underline"
      >
        {children}
      </a>
    );
  },
  hr() {
    return <hr className="border-[#E9EAEB] my-4" />;
  },
  strong({ children }) {
    return <strong className="font-semibold text-[#111827]">{children}</strong>;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border-collapse border border-[#E9EAEB] text-sm">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-[#E9EAEB] bg-[#F3F4F6] px-3 py-2 text-left font-semibold text-[#111827]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-[#E9EAEB] px-3 py-2 text-[#374151]">{children}</td>;
  },
};

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={['flex w-full mb-4 message-appear', isUser ? 'justify-end' : 'justify-start'].join(
        ' ',
      )}
    >
      <div className={['max-w-[80%]', isUser ? 'items-end' : 'items-start'].join(' ')}>
        {/* Tool events (agent only) */}
        {!isUser && message.toolEvents && message.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolEvents.map((event) => (
              <ToolBadge key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Image attachments (user messages) */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {message.images.map((img, idx) => (
              <img
                key={idx}
                src={img.previewUrl ?? `data:${img.mediaType};base64,${img.data}`}
                alt={img.name}
                className="max-w-[200px] max-h-[160px] object-cover rounded-xl border border-white/20 shadow-sm"
              />
            ))}
          </div>
        )}

        {/* Message bubble */}
        {(message.content || isUser) && (
          <div
            className={
              isUser
                ? 'bg-[#4F46E5] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed'
                : 'bg-white border border-[#E9EAEB] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#111827] shadow-sm'
            }
          >
            {isUser ? (
              <p className="whitespace-pre-wrap m-0">{message.content || <span className="opacity-60 italic">image attached</span>}</p>
            ) : (
              <div className="prose-sm">
                <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
              </div>
            )}

            {/* Streaming cursor */}
            {message.isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 bg-[#4F46E5] ml-0.5 align-middle typing-dot" />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={['mt-1 text-[10px] text-[#9CA3AF]', isUser ? 'text-right' : 'text-left'].join(
            ' ',
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
