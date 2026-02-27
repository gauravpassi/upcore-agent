import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
  shell,
} from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import Store from 'electron-store';

// ─── Config Schema ────────────────────────────────────────────────────────────

interface Config {
  anthropicApiKey: string;
  projectDir: string;
  agentPassword: string;
  agentJwtSecret: string;
  port: number;
}

const store = new Store<Config>({
  defaults: {
    anthropicApiKey: '',
    projectDir: '',
    agentPassword: crypto.randomBytes(16).toString('hex'), // auto-generated
    agentJwtSecret: crypto.randomBytes(32).toString('hex'), // auto-generated
    port: 7001,
  },
});

// ─── State ───────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort: number = store.get('port') as number;

// ─── Server Management ───────────────────────────────────────────────────────

function getServerEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: String(serverPort),
    ANTHROPIC_API_KEY: (store.get('anthropicApiKey') as string) || 'sk-placeholder-setup-required',
    AGENT_PASSWORD: store.get('agentPassword') as string,
    AGENT_JWT_SECRET: store.get('agentJwtSecret') as string,
    TURBO_PROJECT_DIR: store.get('projectDir') as string,
    ELECTRON: 'true',
    NODE_ENV: isDev ? 'development' : 'production',
  };
}

function startServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }

  const env = getServerEnv();

  let cmd: string;
  let args: string[];

  if (isDev) {
    // Development: use tsx for hot TypeScript execution
    const serverSrc = path.join(__dirname, '../../server/src/index.ts');
    cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    args = ['tsx', serverSrc];
  } else {
    // Production: run compiled JavaScript from app resources
    const serverDist = path.join(process.resourcesPath, 'server/dist/index.js');
    cmd = process.execPath; // Use Electron's bundled Node.js
    args = [serverDist];
  }

  console.log(`[Electron] Starting server: ${cmd} ${args.join(' ')}`);
  serverProcess = spawn(cmd, args, {
    env,
    stdio: 'pipe',
    cwd: isDev ? path.join(__dirname, '../../server') : process.resourcesPath,
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[Server]', data.toString().trim());
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Server Error]', data.toString().trim());
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Server] Process exited with code ${code}`);
    serverProcess = null;
  });
}

// ─── Server Readiness Polling ─────────────────────────────────────────────────

function waitForServer(port: number, maxAttempts = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log(`[Electron] Server ready on port ${port}`);
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`Server did not start after ${maxAttempts} attempts`));
        return;
      }
      setTimeout(check, 1000);
    };

    setTimeout(check, 1500); // Initial delay
  });
}

// ─── Auto Login ───────────────────────────────────────────────────────────────

function autoLogin(port: number, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ password });
    const options = {
      hostname: 'localhost',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { token?: string };
          if (parsed.token) {
            resolve(parsed.token);
          } else {
            reject(new Error('No token in login response'));
          }
        } catch {
          reject(new Error('Failed to parse login response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Window Management ────────────────────────────────────────────────────────

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'TurboIAM Agent',
    backgroundColor: '#0f0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 20 },
  });

  // Load the UI
  const needsSetup = !store.get('projectDir') || !store.get('anthropicApiKey');

  if (isDev) {
    // Dev: Vite dev server
    await mainWindow.loadURL(`http://localhost:5173${needsSetup ? '?setup=true' : ''}`);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: get auto-login token and load the bundled app
    try {
      const password = store.get('agentPassword') as string;
      const token = await autoLogin(serverPort, password);
      await mainWindow.loadURL(
        `http://localhost:${serverPort}?autoToken=${token}${needsSetup ? '&setup=true' : ''}`,
      );
    } catch (err) {
      console.error('[Electron] Auto-login failed:', err);
      await mainWindow.loadURL(
        `http://localhost:${serverPort}?setup=${needsSetup}`,
      );
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback: empty 16x16 transparent icon
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('TurboIAM Agent');

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open TurboIAM Agent',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Project: ' + (store.get('projectDir') ? path.basename(store.get('projectDir') as string) : 'Not set'),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // Check if first-run setup is needed
  ipcMain.handle('needs-setup', () => {
    const apiKey = store.get('anthropicApiKey') as string;
    const projectDir = store.get('projectDir') as string;
    return !apiKey || !projectDir;
  });

  // Get current config (never return secrets in full)
  ipcMain.handle('get-config', () => ({
    hasApiKey: !!(store.get('anthropicApiKey') as string),
    projectDir: store.get('projectDir') as string,
    port: store.get('port') as number,
  }));

  // Save config and restart server
  ipcMain.handle(
    'save-config',
    (_event, config: { anthropicApiKey?: string; projectDir?: string }) => {
      if (config.anthropicApiKey) {
        store.set('anthropicApiKey', config.anthropicApiKey.trim());
      }
      if (config.projectDir) {
        store.set('projectDir', config.projectDir.trim());
      }

      // Restart server with new config
      console.log('[Electron] Config updated — restarting server');
      startServer();

      return { success: true };
    },
  );

  // Open native directory picker
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select your TurboIAM project folder',
      message: 'Select the root folder of your TurboIAM installation',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Project Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Restart server (called after config save)
  ipcMain.handle('restart-server', () => {
    startServer();
    return { success: true };
  });

  // Get auto-login token (for Electron renderer)
  ipcMain.handle('get-auto-token', async () => {
    try {
      await waitForServer(serverPort, 10);
      const password = store.get('agentPassword') as string;
      return await autoLogin(serverPort, password);
    } catch (err) {
      console.error('[Electron] get-auto-token failed:', err);
      return null;
    }
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Register IPC handlers first
  registerIpcHandlers();

  // Start the backend server
  startServer();

  // Create tray icon
  createTray();

  // Wait for server to be ready, then open window
  try {
    await waitForServer(serverPort);
    await createWindow();
  } catch (err) {
    console.error('[Electron] Server startup failed:', err);
    // Still open window — it will show connection error
    await createWindow();
  }
});

// Keep app running when all windows closed (macOS behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Kill server on quit
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
});
