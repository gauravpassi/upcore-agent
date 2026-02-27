import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Electron: TURBO_PROJECT_DIR = client's local dir; Railway: TURBO_REPO_DIR = cloned repo
const REPO_DIR = process.env.TURBO_PROJECT_DIR ?? process.env.TURBO_REPO_DIR ?? '/tmp/turbo-claude';

export const readRepoFile = {
  name: 'read_repo_file',
  description:
    'Read a file from the live TurboIAM repository on disk. Use this to read existing source code before making changes. ' +
    'Always read the existing file before writing to it so you understand the current implementation.',
  schema: z.object({
    path: z
      .string()
      .describe(
        'File path relative to repo root (e.g. "turbo-backend/src/modules/auth/auth.service.ts", "turbo-frontend/src/pages/Login/index.tsx")',
      ),
  }),
  handler: async (args: { path: string }) => {
    try {
      const sanitized = path.normalize(args.path).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(REPO_DIR, sanitized);

      if (!fullPath.startsWith(REPO_DIR)) {
        return { content: [{ type: 'text' as const, text: 'Error: Access denied — path outside repo directory' }] };
      }

      if (!fs.existsSync(fullPath)) {
        return { content: [{ type: 'text' as const, text: `Error: File not found: ${sanitized}` }] };
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(fullPath);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Directory listing for ${sanitized}:\n${files.join('\n')}`,
            },
          ],
        };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      return { content: [{ type: 'text' as const, text: content }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
