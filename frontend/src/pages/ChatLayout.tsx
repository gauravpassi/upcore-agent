import { ChatWindow } from '../components/ChatWindow';
import { InputBar } from '../components/InputBar';
import { useAgent } from '../hooks/useAgent';

interface ChatLayoutProps {
  token: string;
  onLogout: () => void;
}

export function ChatLayout({ token, onLogout }: ChatLayoutProps) {
  const { messages, isStreaming, isConnected, send, cancel } = useAgent(token, onLogout);

  return (
    <div className="flex h-screen bg-[#F3F4F6]">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-[240px] flex-shrink-0 bg-white border-r border-[#E9EAEB] flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#E9EAEB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#4F46E5] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">U</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#111827] truncate">Upcore Agent</p>
              <p className="text-[10px] text-[#9CA3AF] truncate">TurboIAM Expert</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto">
          <div className="mb-1">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#EEF2FF] text-[#4F46E5] text-sm font-medium">
              <span>💬</span>
              <span>Chat</span>
            </button>
          </div>

          <div className="mt-6">
            <p className="px-3 mb-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              Knowledge Base
            </p>
            {SIDEBAR_DOCS.map((doc) => (
              <div
                key={doc.label}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#6B7280] rounded-lg hover:bg-[#F3F4F6] cursor-default"
              >
                <span>{doc.icon}</span>
                <span>{doc.label}</span>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-[#E9EAEB]">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#374151] transition-colors"
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Panel ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-[#E9EAEB] flex items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold text-[#111827]">
              UpcoreCodeTestDeploy Agent
            </h1>
            <span className="text-[10px] text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
              claude-sonnet-4-5
            </span>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <span
              className={[
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-amber-400',
              ].join(' ')}
            />
            <span className="text-xs text-[#6B7280]">
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>
        </header>

        {/* Chat area */}
        <ChatWindow messages={messages} isStreaming={isStreaming} />

        {/* Input */}
        <InputBar
          onSend={send}
          onCancel={cancel}
          disabled={!isConnected}
          isStreaming={isStreaming}
        />
      </main>
    </div>
  );
}

const SIDEBAR_DOCS = [
  { icon: '📋', label: 'API Reference' },
  { icon: '🗄️', label: 'Data Model' },
  { icon: '🎨', label: 'Design System' },
  { icon: '🏗️', label: 'Stack & Patterns' },
];
