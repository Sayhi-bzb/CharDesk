export type CanvasMode = 'freeform' | 'slide';
export type CollaborationIntegrityIssue = {
  channel: 'cell-plane-operations' | 'canvas-anchors' | 'presence';
  key: string;
  pageId?: string;
  reason: string;
};
