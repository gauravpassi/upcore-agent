import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const CONTEXT_DIR = path.resolve(__dirname, '../../../context');

export const listFiles = {
  name: 'list_files',
  description: 'List all files available in the context/ folder. Use this to discover what knowledge base files exist before reading them.',
  schema: z.object({}),
  handler: async (_args: Record<string, never>) => {
    try {
      const files = fs.readdirSync(CONTEXT_DIR).filter((f) => !f.startsWith('.'));
      const fileList = files.join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Available context files:\n${fileList}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
};
