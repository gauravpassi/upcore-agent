import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_DIR = path.resolve(__dirname, '../../../context');

export const searchCode = {
  name: 'search_code',
  description: 'Search for a text pattern across all context files (or a specific file). Returns matching lines with line numbers and file names. Use this to find where a specific endpoint, model, or component is documented.',
  schema: z.object({
    pattern: z.string().describe('Text pattern to search for (case-insensitive)'),
    file: z.string().optional().describe('Optional: limit search to a specific file (e.g. "API_REFERENCE.md")'),
  }),
  handler: async (args: { pattern: string; file?: string }) => {
    try {
      const regex = new RegExp(args.pattern, 'gi');

      let filesToSearch: string[];
      if (args.file) {
        const sanitized = path.normalize(args.file).replace(/^(\.\.(\/|\\|$))+/, '');
        const fullPath = path.join(CONTEXT_DIR, sanitized);
        if (!fullPath.startsWith(CONTEXT_DIR) || !fs.existsSync(fullPath)) {
          return { content: [{ type: 'text' as const, text: `Error: File not found: ${args.file}` }] };
        }
        filesToSearch = [sanitized];
      } else {
        filesToSearch = fs.readdirSync(CONTEXT_DIR).filter((f) => !f.startsWith('.') && f.endsWith('.md'));
      }

      const results: string[] = [];

      for (const file of filesToSearch) {
        const fullPath = path.join(CONTEXT_DIR, file);
        const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');

        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            results.push(`${file}:${idx + 1}: ${line.trim()}`);
          }
          regex.lastIndex = 0; // reset for global flag
        });
      }

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No matches found for: ${args.pattern}` }] };
      }

      // Limit results to avoid overwhelming context
      const limited = results.slice(0, 50);
      const suffix = results.length > 50 ? `\n... (${results.length - 50} more matches truncated)` : '';

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.length} match(es) for "${args.pattern}":\n\n${limited.join('\n')}${suffix}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
