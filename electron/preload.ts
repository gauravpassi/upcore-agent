import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes a minimal, typed API to the renderer (React frontend).
 * All communication goes through IPC — renderer never accesses Node.js directly.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Returns true if first-run setup is needed (no API key or project dir) */
  needsSetup: (): Promise<boolean> => ipcRenderer.invoke('needs-setup'),

  /** Returns current config (sans secrets) */
  getConfig: (): Promise<{ hasApiKey: boolean; projectDir: string; port: number }> =>
    ipcRenderer.invoke('get-config'),

  /** Save API key and/or project directory, restart server */
  saveConfig: (config: {
    anthropicApiKey?: string;
    projectDir?: string;
  }): Promise<{ success: boolean }> => ipcRenderer.invoke('save-config', config),

  /** Open native OS directory picker, returns selected path or null */
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-directory'),

  /** Get auto-login JWT token (for seamless Electron login) */
  getAutoToken: (): Promise<string | null> => ipcRenderer.invoke('get-auto-token'),

  /** Restart the backend server (called after config changes) */
  restartServer: (): Promise<{ success: boolean }> => ipcRenderer.invoke('restart-server'),

  /** Check if running inside Electron (always true when this API is available) */
  isElectron: true,
});

// Extend the Window interface for TypeScript support in the renderer
declare global {
  interface Window {
    electronAPI?: {
      needsSetup: () => Promise<boolean>;
      getConfig: () => Promise<{ hasApiKey: boolean; projectDir: string; port: number }>;
      saveConfig: (config: { anthropicApiKey?: string; projectDir?: string }) => Promise<{ success: boolean }>;
      selectDirectory: () => Promise<string | null>;
      getAutoToken: () => Promise<string | null>;
      restartServer: () => Promise<{ success: boolean }>;
      isElectron: boolean;
    };
  }
}
