import type { TerminalWorkspace } from './workspace.ts';

/** Both the live workspace and an isolated Code draft supply this content port. */
export type LocalCanvasHost = Pick<TerminalWorkspace, 'model' | 'files' | 'active' | 'saveFile'>;
export type LocalCodeDraft = { undo: string[] };
