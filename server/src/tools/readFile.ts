import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_DIR = path.resolve(__dirname, '../../../context');

export const readFile = {
  name: 'read_file',
  description: 'Read a file from the context/ folder. Use this to get the full contents of a specific file.',
  schema: z.object({
    path: z.string().describe('Relative path to file inside context/ (e.g. "CLAUDE.md", "API_REFERENCE.md")'),
  }),
  handler: async (args: { path: string }) => {
    try {
      // Sanitize path to prevent directory traversal
      const sanitized = path.normalize(args.path).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(CONTEXT_DIR, sanitized);

      // Ensure the resolved path is inside context dir
      if (!fullPath.startsWith(CONTEXT_DIR)) {
        return { content: [{ type: 'text' as const, text: 'Error: Access denied — path outside context directory' }] };
      }

      if (!fs.existsSync(fullPath)) {
        return { content: [{ type: 'text' as const, text: `Error: File not found: ${sanitized}` }] };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      return { content: [{ type: 'text' as const, text: content }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
