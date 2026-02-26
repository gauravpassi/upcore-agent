import { useState } from 'react';
import type { ToolEvent } from '../types';

interface ToolBadgeProps {
  event: ToolEvent;
}

const TOOL_ICONS: Record<string, string> = {
  read_file: '📄',
  search_code: '🔍',
  list_files: '📁',
  get_context: '🧠',
};

export function ToolBadge({ event }: ToolBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const icon = TOOL_ICONS[event.tool] ?? '⚙️';
  const isDone = event.status === 'done';

  return (
    <div className="inline-flex flex-col gap-1 my-0.5">
      <button
        onClick={() => isDone && event.result && setExpanded((v) => !v)}
        className={[
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
          isDone
            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 cursor-pointer'
            : 'bg-amber-50 text-amber-700 border border-amber-200 cursor-default',
        ].join(' ')}
      >
        {!isDone && (
          <span className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent spin inline-block" />
        )}
        {isDone && <span>{icon}</span>}
        <span>
          {isDone ? '✓ ' : ''}
          {event.tool.replace(/_/g, ' ')}
          {!isDone ? '...' : ''}
        </span>
        {isDone && event.result && (
          <span className="text-green-500 ml-0.5">{expanded ? '▲' : '▼'}</span>
        )}
      </button>

      {expanded && event.result && (
        <div className="ml-2 p-2 bg-[#F9FAFB] border border-[#E9EAEB] rounded-lg text-xs text-[#374151] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
          {event.result}
        </div>
      )}
    </div>
  );
}
