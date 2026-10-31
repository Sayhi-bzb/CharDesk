import type { CanvasTemplateId } from '@chardesk/canvas-templates';
export * from '@chardesk/canvas-templates/runtime';
let activeCanvasTemplateDragId: CanvasTemplateId | null = null;

export const setActiveCanvasTemplateDragId = (id: CanvasTemplateId | null) => {
  activeCanvasTemplateDragId = id;
};

export const getActiveCanvasTemplateDragId = () => activeCanvasTemplateDragId;
