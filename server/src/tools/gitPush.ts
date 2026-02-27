import { z } from 'zod';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Electron: TURBO_PROJECT_DIR = client's local dir; Railway: TURBO_REPO_DIR = cloned repo
const REPO_DIR = process.env.TURBO_PROJECT_DIR ?? process.env.TURBO_REPO_DIR ?? '/tmp/turbo-claude';
const CONTEXT_DIR = path.resolve(__dirname, '../../../context');

function exec(cmd: string, cwd: string = REPO_DIR): string {
  return execSync(cmd, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      GIT_TERMINAL_PROMPT: '0', // Disable interactive git prompts
    },
  });
}

/**
 * After a successful push, sync the brain files from the turbo-claude repo
 * into the agent's context/ folder so future reads are up to date.
 */
function syncContextFiles(): void {
  const filesToSync: Array<{ src: string; dest: string }> = [
    { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
    { src: 'turbo-backend/CLAUDE.md', dest: 'BACKEND_CLAUDE.md' },
    { src: 'turbo-frontend/CLAUDE.md', dest: 'FRONTEND_CLAUDE.md' },
    { src: 'turbo-backend/docs/API_REFERENCE.md', dest: 'API_REFERENCE.md' },
    { src: 'turbo-backend/docs/DATA_MODEL.md', dest: 'DATA_MODEL.md' },
    { src: 'turbo-frontend/docs/DESIGN_SYSTEM.md', dest: 'DESIGN_SYSTEM.md' },
  ];

  let synced = 0;
  for (const { src, dest } of filesToSync) {
    const srcPath = path.join(REPO_DIR, src);
    const destPath = path.join(CONTEXT_DIR, dest);
    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
        synced++;
      } catch {
        // Non-fatal — don't block push result
      }
    }
  }

  console.log(`[UpcoreAgent] Synced ${synced} context files after push`);
}

export const gitPush = {
  name: 'git_push',
  description:
    'Commit all staged changes and push to the TurboIAM GitHub repository (main branch). ' +
    'Railway will auto-deploy the backend and Vercel will auto-deploy the frontend after push. ' +
    'Always run run_command("npx tsc --noEmit") in both turbo-backend and turbo-frontend before calling this to ensure no TypeScript errors. ' +
    'Context (brain) files are automatically synced after a successful push.',
  schema: z.object({
    message: z
      .string()
      .describe(
        'Conventional commit message (e.g. "fix: resolve user list pagination bug", "feat: add risk assessment module"). ' +
        'Keep it under 72 characters.',
      ),
    files: z
      .array(z.string())
      .optional()
      .describe(
        'Specific file paths (relative to repo root) to stage. If omitted, all changed files are staged (git add -A).',
      ),
  }),
  handler: async (args: { message: string; files?: string[] }) => {
    const token = process.env.GITHUB_TOKEN;
    const repoUrl = process.env.TURBO_REPO_URL;
    const isElectron = process.env.ELECTRON === 'true';

    // In Railway mode, token + repoUrl are required
    // In Electron mode, we rely on the user's local git credentials (SSH key, macOS Keychain, etc.)
    if (!isElectron && (!token || !repoUrl)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: GITHUB_TOKEN and TURBO_REPO_URL environment variables are required for git_push. Please add them to Railway.',
          },
        ],
      };
    }

    try {
      // Configure git identity
      exec('git config user.email "upcore-agent@turboiam.dev"');
      exec('git config user.name "UpcoreAgent"');

      // In Railway mode: inject token into remote URL
      // In Electron mode: use local git credentials (SSH key or macOS Keychain)
      if (token && repoUrl) {
        const authUrl = repoUrl.replace('https://', `https://${token}@`);
        exec(`git remote set-url origin "${authUrl}"`);
      }

      // Pull latest to avoid conflicts
      try {
        exec('git pull origin main --rebase');
      } catch {
        // If pull fails (e.g. diverged), continue — user should resolve manually
        console.warn('[UpcoreAgent] git pull failed — attempting push anyway');
      }

      // Stage files
      if (args.files && args.files.length > 0) {
        for (const file of args.files) {
          const sanitized = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
          exec(`git add "${sanitized}"`);
        }
      } else {
        exec('git add -A');
      }

      // Check if there's anything to commit
      const status = exec('git status --porcelain').trim();
      if (!status) {
        return {
          content: [
            {
              type: 'text' as const,
              text: '⚠️ Nothing to commit — working tree is clean. No push performed.',
            },
          ],
        };
      }

      // Show what will be committed
      const stagedFiles = status
        .split('\n')
        .map((line) => line.trim())
        .join('\n');

      // Commit
      const safeMessage = args.message.replace(/"/g, '\\"');
      exec(`git commit -m "${safeMessage}\n\nCo-Authored-By: UpcoreAgent <upcore-agent@turboiam.dev>"`);

      // Push
      exec('git push origin main');

      // Sync context files so the agent's brain is up to date
      syncContextFiles();

      return {
        content: [
          {
            type: 'text' as const,
            text:
              `✅ Successfully pushed to GitHub!\n\n` +
              `Commit: "${args.message}"\n\n` +
              `Files committed:\n${stagedFiles}\n\n` +
              (isElectron
                ? `🚀 Changes pushed. Your deployment pipeline will pick up the changes.\n`
                : `🚀 Railway (backend) and Vercel (frontend) are now auto-deploying.\n`) +
              `📚 Agent context (brain files) have been synced.`,
          },
        ],
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Git push failed:\n${output}`,
          },
        ],
      };
    }
  },
};
