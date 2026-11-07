import { createCanvasCodeTool as createSharedCodeTool } from '@chardesk/canvas-capabilities/code';
export const createCanvasCodeTool = (dependencies: Parameters<typeof createSharedCodeTool>[0]) =>
  createSharedCodeTool({
    ...dependencies,
    clipboard:
      dependencies.clipboard ??
      (typeof navigator !== 'undefined' ? navigator.clipboard : undefined),
  });

export { warmCanvasCodeRuntime, CANVAS_CODE_TOOL_NAME } from '@chardesk/canvas-capabilities/code';
