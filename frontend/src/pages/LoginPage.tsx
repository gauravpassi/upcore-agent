import { useState, useRef, FormEvent, useEffect } from 'react';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

export function LoginPage({ onLogin, isLoading, error, onClearError }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;
    onClearError();
    const ok = await onLogin(password);
    if (!ok) {
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#4F46E5] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-3xl font-bold">U</span>
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">UpcoreCodeTestDeploy</h1>
          <p className="text-sm text-[#6B7280] mt-1">TurboIAM AI Agent — Developer Access</p>
        </div>

        {/* Card */}
        <div
          className={['bg-white rounded-2xl shadow-sm border border-[#E9EAEB] p-8', shaking ? 'shake' : ''].join(' ')}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#374151] mb-1.5"
              >
                Access Password
              </label>
              <input
                ref={inputRef}
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter developer password"
                autoComplete="current-password"
                className={[
                  'w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                  error
                    ? 'border-red-400 focus:border-red-500 bg-red-50'
                    : 'border-[#E9EAEB] focus:border-[#4F46E5] bg-white',
                ].join(' ')}
              />
              {error && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <span>⚠️</span>
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!password.trim() || isLoading}
              className={[
                'w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all',
                !password.trim() || isLoading
                  ? 'bg-[#E9EAEB] text-[#9CA3AF] cursor-not-allowed'
                  : 'bg-[#4F46E5] text-white hover:bg-[#4338CA] shadow-sm hover:shadow-md active:scale-[0.98]',
              ].join(' ')}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white spin inline-block" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#9CA3AF] mt-6">
          For developer access, contact your team lead.
        </p>

        {/* Desktop app download link */}
        <div className="text-center mt-4">
          <a
            href="/download.html"
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#4F46E5] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Desktop App
          </a>
        </div>
      </div>
    </div>
  );
}
