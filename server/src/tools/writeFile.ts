import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const REPO_DIR = process.env.TURBO_REPO_DIR ?? '/tmp/turbo-claude';

// File extensions that are safe to write
const ALLOWED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.json', '.md', '.css', '.html',
  '.env.example', '.prisma', '.sql',
  '.yaml', '.yml', '.toml',
];

export const writeFile = {
  name: 'write_file',
  description:
    'Write or overwrite a file in the TurboIAM repository. Use this to implement code changes, bug fixes, or new features. ' +
    'Always read the existing file with read_repo_file first if it exists. ' +
    'Write complete file contents — do not truncate or use placeholders.',
  schema: z.object({
    path: z
      .string()
      .describe(
        'File path relative to repo root (e.g. "turbo-backend/src/modules/foo/foo.service.ts"). ' +
        'Must be within turbo-backend/ or turbo-frontend/ directories.',
      ),
    content: z.string().describe('Complete file content to write. Must be the full file — no truncation.'),
  }),
  handler: async (args: { path: string; content: string }) => {
    try {
      const sanitized = path.normalize(args.path).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(REPO_DIR, sanitized);

      // Security: must be inside repo
      if (!fullPath.startsWith(REPO_DIR)) {
        return { content: [{ type: 'text' as const, text: 'Error: Access denied — path outside repo directory' }] };
      }

      // Only allow writing to turbo-backend/ or turbo-frontend/ or root MD files
      const relPath = sanitized.replace(/\\/g, '/');
      const isAllowedPath =
        relPath.startsWith('turbo-backend/') ||
        relPath.startsWith('turbo-frontend/') ||
        relPath.endsWith('.md');

      if (!isAllowedPath) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Can only write to turbo-backend/, turbo-frontend/, or .md files at root.',
            },
          ],
        };
      }

      // Check file extension
      const ext = path.extname(sanitized).toLowerCase();
      if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: File extension "${ext}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
            },
          ],
        };
      }

      // Create parent directories if needed
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      // Write file
      fs.writeFileSync(fullPath, args.content, 'utf-8');

      const lines = args.content.split('\n').length;
      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Written: ${sanitized} (${lines} lines)`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
