import { useState } from 'react';

interface SetupPageProps {
  onComplete: () => void;
}

type Step = 'api-key' | 'project-dir' | 'done';

export function SetupPage({ onComplete }: SetupPageProps) {
  const [step, setStep] = useState<Step>('api-key');
  const [apiKey, setApiKey] = useState('');
  const [projectDir, setProjectDir] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectDir = async () => {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir) setProjectDir(dir);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI?.saveConfig({ anthropicApiKey: apiKey, projectDir });
      setStep('done');
      setTimeout(onComplete, 1500);
    } catch {
      setError('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#4F46E5] mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">TurboIAM Agent</h1>
          <p className="text-[#6B7280] text-sm mt-1">Setup required before first use</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['api-key', 'project-dir'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s
                  ? 'bg-[#4F46E5] text-white'
                  : step === 'done' || (s === 'api-key' && step === 'project-dir')
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#1f1f23] text-[#6B7280]'
              }`}>
                {step === 'done' || (s === 'api-key' && step === 'project-dir') ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${step === s ? 'text-white' : 'text-[#6B7280]'}`}>
                {s === 'api-key' ? 'API Key' : 'Project Folder'}
              </span>
              {i < 1 && <div className="flex-1 h-px bg-[#2a2a2e]" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#1a1a1e] rounded-2xl border border-[#2a2a2e] p-6">

          {/* Step 1: API Key */}
          {step === 'api-key' && (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Anthropic API Key</h2>
              <p className="text-[#6B7280] text-sm mb-5">
                The agent uses Claude to understand and modify your code. Your key is stored locally and never shared.
              </p>

              <div className="relative mb-4">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full bg-[#0f0f11] border border-[#2a2a2e] rounded-lg px-4 py-3 text-white text-sm placeholder:text-[#4B5563] focus:outline-none focus:border-[#4F46E5] transition-colors pr-12"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && apiKey.startsWith('sk-') && setStep('project-dir')}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white transition-colors"
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-xs text-[#4B5563] mb-5">
                Get your key at{' '}
                <span className="text-[#4F46E5]">console.anthropic.com</span>
              </p>

              <button
                onClick={() => setStep('project-dir')}
                disabled={!apiKey.startsWith('sk-')}
                className="w-full py-3 bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Continue →
              </button>
            </>
          )}

          {/* Step 2: Project Directory */}
          {step === 'project-dir' && (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">TurboIAM Project Folder</h2>
              <p className="text-[#6B7280] text-sm mb-5">
                Select the root folder of your TurboIAM installation. The agent will read and modify files here directly.
              </p>

              <button
                onClick={handleSelectDir}
                className="w-full flex items-center gap-3 bg-[#0f0f11] border border-[#2a2a2e] hover:border-[#4F46E5] rounded-lg px-4 py-3 text-sm transition-colors mb-4 group"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" className="flex-shrink-0 group-hover:stroke-[#4F46E5] transition-colors">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span className={projectDir ? 'text-white truncate' : 'text-[#4B5563]'}>
                  {projectDir || 'Click to select folder…'}
                </span>
              </button>

              {projectDir && (
                <div className="flex items-center gap-2 text-xs text-[#16A34A] mb-4 bg-[#052e16] rounded-lg px-3 py-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Selected: {projectDir}
                </div>
              )}

              {error && (
                <p className="text-xs text-[#EF4444] mb-4">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('api-key')}
                  className="flex-1 py-3 border border-[#2a2a2e] hover:border-[#4B5563] text-[#6B7280] hover:text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={!projectDir || saving}
                  className="flex-1 py-3 bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  {saving ? 'Saving…' : 'Start Agent →'}
                </button>
              </div>
            </>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-[#052e16] flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-white font-semibold text-lg mb-1">All set!</h2>
              <p className="text-[#6B7280] text-sm">Launching TurboIAM Agent…</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[#4B5563] mt-4">
          Your API key is stored locally on your machine and never transmitted to our servers.
        </p>
      </div>
    </div>
  );
}
