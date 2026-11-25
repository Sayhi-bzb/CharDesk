import type { TerminalWorkspace } from './workspace.ts';

export type LocalCanvasHost = Pick<TerminalWorkspace, 'model' | 'files' | 'active' | 'saveFile'>;
export type LocalCodeDraft = { undo: string[] };
