import { z } from 'zod';
import { execSync } from 'child_process';
import * as path from 'path';

// Electron: TURBO_PROJECT_DIR = client's local dir; Railway: TURBO_REPO_DIR = cloned repo
const REPO_DIR = process.env.TURBO_PROJECT_DIR ?? process.env.TURBO_REPO_DIR ?? '/tmp/turbo-claude';

// Allowlist of safe command prefixes — prevents arbitrary shell execution
const ALLOWED_PREFIXES = [
  'npm run build',
  'npm run lint',
  'npm run test',
  'npm run dev',
  'npm install',
  'npm ci',
  'npx tsc',
  'npx prisma generate',
  'npx prisma migrate',
  'npx prisma db push',
  'npx prisma validate',
  'npx prisma format',
  'git status',
  'git diff',
  'git log',
  'git show',
  'ls',
  'cat',
  'find',
];

export const runCommand = {
  name: 'run_command',
  description:
    'Run a safe shell command in the TurboIAM repository directory. ' +
    'Use to verify TypeScript compiles ("npx tsc --noEmit"), check build status, run Prisma migrations, or inspect git state. ' +
    'Run "npx tsc --noEmit" before git_push to catch TypeScript errors early.',
  schema: z.object({
    command: z
      .string()
      .describe(
        'Command to run. Allowed prefixes: npm run build/lint/test, npx tsc, npx prisma *, git status/diff/log, ls. ' +
        'Examples: "npx tsc --noEmit", "npm run build", "git status", "npx prisma validate"',
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        'Subdirectory relative to repo root to run command in (e.g. "turbo-backend", "turbo-frontend"). ' +
        'Defaults to repo root.',
      ),
  }),
  handler: async (args: { command: string; cwd?: string }) => {
    const trimmed = args.command.trim();

    const isAllowed = ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    if (!isAllowed) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Error: Command not allowed: "${trimmed}"\n` +
              `Allowed prefixes:\n${ALLOWED_PREFIXES.map((p) => `  - ${p}`).join('\n')}`,
          },
        ],
      };
    }

    try {
      const workDir = args.cwd ? path.join(REPO_DIR, path.normalize(args.cwd)) : REPO_DIR;

      // Ensure workDir is inside the repo
      if (!workDir.startsWith(REPO_DIR)) {
        return { content: [{ type: 'text' as const, text: 'Error: cwd outside repo directory' }] };
      }

      const output = execSync(trimmed, {
        cwd: workDir,
        timeout: 180_000, // 3 min max
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          // Ensure PATH includes npm/node binaries
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
        },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: output.trim() || '(command completed with no output)',
          },
        ],
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
      return { content: [{ type: 'text' as const, text: `Command failed:\n${output}` }] };
    }
  },
};
