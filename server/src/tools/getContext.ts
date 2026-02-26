import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_DIR = path.resolve(__dirname, '../../../context');

const BRAIN_FILES: Record<string, string> = {
  ROOT: 'CLAUDE.md',
  API_REFERENCE: 'API_REFERENCE.md',
  DATA_MODEL: 'DATA_MODEL.md',
  DESIGN_SYSTEM: 'DESIGN_SYSTEM.md',
};

export const getContext = {
  name: 'get_context',
  description:
    'Get a named brain file instantly by its short key. Faster than read_file for the main reference documents. Use ROOT for overall stack/patterns, API_REFERENCE for all endpoints, DATA_MODEL for Prisma models, DESIGN_SYSTEM for UI components and colors.',
  schema: z.object({
    name: z
      .enum(['ROOT', 'API_REFERENCE', 'DATA_MODEL', 'DESIGN_SYSTEM'])
      .describe('Which brain file to retrieve: ROOT (stack + patterns), API_REFERENCE (all endpoints), DATA_MODEL (Prisma models), DESIGN_SYSTEM (UI components + colors)'),
  }),
  handler: async (args: { name: 'ROOT' | 'API_REFERENCE' | 'DATA_MODEL' | 'DESIGN_SYSTEM' }) => {
    try {
      const filename = BRAIN_FILES[args.name];
      const fullPath = path.join(CONTEXT_DIR, filename);

      if (!fs.existsSync(fullPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Brain file not found: ${filename}. Run the context copy script to populate the context/ folder.`,
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
