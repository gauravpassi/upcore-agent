import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ChatLayout } from './pages/ChatLayout';

export default function App() {
  const { token, login, logout, isLoading, error, clearError } = useAuth();

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
