/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron context bridge API exposed via preload.ts
interface ElectronAPI {
  isElectron: true;
  needsSetup: () => Promise<boolean>;
  getConfig: () => Promise<{ anthropicApiKey: string; projectDir: string; port: number }>;
  saveConfig: (cfg: { anthropicApiKey: string; projectDir: string }) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  getAutoToken: () => Promise<string | null>;
  restartServer: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
