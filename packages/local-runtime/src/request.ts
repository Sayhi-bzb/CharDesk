import type { AgentToolExecutionContext } from '../../canvas-capabilities/src/types.ts';
import { CanvasVersionConflict } from '@chardesk/editor-core/contentVersion';
import { createHash } from 'node:crypto';
import { OperationCancelled } from './operations.ts';
import type { AgentIdentity, AgentInvocation } from './agents.ts';

export type LocalRequestContext = AgentToolExecutionContext & {
  baseVersion?: string;
  agent?: AgentIdentity;
  invocation?: AgentInvocation;
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  return value;
};
export const requestFingerprint = (name: string, input: Record<string, unknown>) =>
  createHash('sha256')
    .update(JSON.stringify([name, canonical(input)]))
    .digest('hex');

export function contentFailure(error: unknown) {
  return error instanceof CanvasVersionConflict
    ? {
        ok: false,
        code: error.code,
        message: error.message,
        documentId: error.documentId,
        baseVersion: error.baseVersion,
        currentVersion: error.currentVersion,
      }
    : error instanceof OperationCancelled
      ? {
          ok: false,
          code: error.code,
          message: error.message,
          effects: error.effects,
        }
      : {
          ok: false,
          code: 'operation_failed',
          message: error instanceof Error ? error.message : String(error),
        };
}
