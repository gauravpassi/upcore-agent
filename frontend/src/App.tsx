import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ChatLayout } from './pages/ChatLayout';
import { SetupPage } from './pages/SetupPage';

// Minimal loading spinner shown while checking Electron setup state
function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  // null = still checking, true = setup needed, false = setup done / non-Electron
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.needsSetup()
        .then(setSetupNeeded)
        .catch(() => setSetupNeeded(false));
    } else {
      // Not running in Electron — skip setup wizard
      setSetupNeeded(false);
    }
  }, []);

  const { token, login, logout, isLoading, error, clearError } = useAuth();

  // Still checking Electron setup state
  if (setupNeeded === null) {
    return <LoadingSpinner />;
  }

  // First-run setup wizard (Electron only)
  if (setupNeeded) {
    return (
      <SetupPage
        onComplete={() => setSetupNeeded(false)}
      />
    );
  }

  // Normal auth flow
  if (!token) {
    return (
      <LoginPage
        onLogin={login}
        isLoading={isLoading}
        error={error}
        onClearError={clearError}
      />
    );
  }

  return <ChatLayout token={token} onLogout={logout} />;
}
