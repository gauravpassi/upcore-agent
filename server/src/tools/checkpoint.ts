import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CHECKPOINT_PATH =
  process.env.CHECKPOINT_FILE ?? path.join(os.tmpdir(), 'upcore-checkpoint.json');

export interface CheckpointData {
  goal: string;
  acceptanceCriteria: string;
  filesTouched: string[];
  completedSteps: string[];
  nextStep: string;
  lastResult?: string;
  savedAt: string;
}

// ─── save_checkpoint ─────────────────────────────────────────────────────────
export const saveCheckpoint = {
  name: 'save_checkpoint',
  description: [
    'Save current task progress to a checkpoint file on disk.',
    'Call this: (1) after completing each major step, (2) before any risky operation,',
    '(3) when approaching the CONTINUE HANDOFF boundary (6+ tool calls in this phase).',
    'The checkpoint lets the next phase resume exactly where this one stopped.',
  ].join(' '),
  handler: async (args: {
    goal: string;
    acceptanceCriteria: string;
    filesTouched: string[];
    completedSteps: string[];
    nextStep: string;
    lastResult?: string;
  }) => {
    try {
      const checkpoint: CheckpointData = {
        ...args,
        savedAt: new Date().toISOString(),
      };
      fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf-8');
      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Checkpoint saved at ${CHECKPOINT_PATH}\nNext step queued: "${args.nextStep}"`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Checkpoint save failed: ${(err as Error).message}`,
          },
        ],
      };
    }
  },
};

// ─── load_checkpoint ─────────────────────────────────────────────────────────
export const loadCheckpoint = {
  name: 'load_checkpoint',
  description: [
    'Load the previously saved task checkpoint from disk.',
    'ALWAYS call this at the very start of every session to check for unfinished work.',
    'If a checkpoint exists, resume from its nextStep — skip already-completed steps.',
    'Returns "no checkpoint" if no task is in progress (fresh start).',
  ].join(' '),
  handler: async () => {
    try {
      if (!fs.existsSync(CHECKPOINT_PATH)) {
        return {
          content: [
            { type: 'text' as const, text: 'No checkpoint found — this is a fresh start. Proceed with the user\'s request.' },
          ],
        };
      }
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
      const cp = JSON.parse(raw) as CheckpointData;
      const lines = [
        `📋 CHECKPOINT FOUND (saved ${cp.savedAt})`,
        `Goal: ${cp.goal}`,
        `Acceptance Criteria: ${cp.acceptanceCriteria}`,
        `Completed Steps: ${cp.completedSteps.length > 0 ? cp.completedSteps.join(' → ') : 'none yet'}`,
        `Files Touched So Far: ${cp.filesTouched.length > 0 ? cp.filesTouched.join(', ') : 'none'}`,
        `▶ NEXT STEP TO EXECUTE: ${cp.nextStep}`,
        cp.lastResult ? `Last Result: ${cp.lastResult.slice(0, 300)}` : '',
      ].filter(Boolean);
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: `Checkpoint load error: ${(err as Error).message}. Treating as fresh start.` },
        ],
      };
    }
  },
};

// ─── clear_checkpoint ────────────────────────────────────────────────────────
export const clearCheckpoint = {
  name: 'clear_checkpoint',
  description:
    'Clear the checkpoint file after a task is fully complete and deployed. ' +
    'Call this as the very last action when the task is done (after git_push succeeds).',
  handler: async () => {
    try {
      if (fs.existsSync(CHECKPOINT_PATH)) {
        fs.unlinkSync(CHECKPOINT_PATH);
        return {
          content: [{ type: 'text' as const, text: '✅ Checkpoint cleared — task fully complete.' }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: 'No checkpoint to clear (already clean).' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Clear failed: ${(err as Error).message}` }],
      };
    }
  },
};
