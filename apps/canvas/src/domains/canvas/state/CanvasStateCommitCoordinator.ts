import { CanvasStateCommitCoordinator as SharedCoordinator } from '@chardesk/editor-core/CanvasStateCommitCoordinator';
import type { EditorState } from './interfaces';
export class CanvasStateCommitCoordinator<
  State extends object = EditorState,
> extends SharedCoordinator<State> {}
export { coordinateCanvasCommands } from '@chardesk/editor-core/CanvasStateCommitCoordinator';
