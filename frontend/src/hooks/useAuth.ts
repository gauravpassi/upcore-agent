import { useState, useCallback, useEffect } from 'react';

const TOKEN_KEY = 'upcore_token';
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

interface JwtPayload {
  sub: string;
  exp: number;
  iat: number;
}

function decodeToken(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // Base64url decode
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return false;
  // Check expiry with 60-second buffer
  return payload.exp > Date.now() / 1000 + 60;
}

function readStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (!isTokenValid(token)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Electron auto-login: main process passes JWT as ?autoToken= URL param
  // after doing the login POST itself (user never sees the login screen in Electron)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoToken = params.get('autoToken');
    if (autoToken && isTokenValid(autoToken)) {
      localStorage.setItem(TOKEN_KEY, autoToken);
      setToken(autoToken);
      // Clean the token from the URL so it's not visible / shareable
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { message?: string }).message ?? 'Invalid password');
        return false;
      }

      const { token: jwt } = (await res.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, jwt);
      setToken(jwt);
      return true;
    } catch {
      setError('Connection failed. Please check your network.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { token, login, logout, isLoading, error, clearError };
}
