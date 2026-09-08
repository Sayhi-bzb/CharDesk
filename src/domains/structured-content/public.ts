export type {
  StructuredBoxResizeHandle,
  StructuredLineResizeHandle,
  StructuredNodeHit,
  StructuredSplitBoxHandle,
} from "./model/box";
export {
  addStructuredSplitBoxSplit,
  canSplitStructuredSplitBoxLeaf,
  createStructuredSceneQuery,
  deleteStructuredSplitBoxSplit,
  findStructuredBoxHit,
  findStructuredNodeHit,
  findStructuredNodeIdsInSelection,
  getStructuredBoxBounds,
  getStructuredBoxHandleAtPoint,
  getStructuredBoxNameEndPoint,
  getStructuredBoxNameStartPoint,
  getStructuredSplitBoxGuides,
  getStructuredSplitBoxHandleAtPoint,
  getStructuredSplitBoxHandleId,
  getStructuredSplitBoxLeafAtPoint,
  isPointOnStructuredBoxBorder,
  isStructuredSplitBoxLineHandle,
  moveStructuredBox,
  moveStructuredNode,
  resizeStructuredBox,
  resizeStructuredLine,
  resizeStructuredRect,
  resizeStructuredSplitBox,
} from "./model/box";
export {
  cloneStructuredNode,
  decodeStructuredNode,
} from "./model/codec";
export {
  decodeStructuredComponents,
  deriveStructuredComponentsFromScene,
  normalizeStructuredComponents,
} from "./model/components";
export {
  getStructuredLineHandlePoints,
  getStructuredRectHandlePoints,
  getStructuredSplitBoxHandlePoints,
} from "./model/handle-geometry";
export {
  canReorderStructuredNodes,
  duplicateStructuredNodes,
  getNextStructuredOrder,
  reorderStructuredNodes,
} from "./model/node-actions";
export {
  buildStructuredTree,
  containsBounds,
  createStructuredNodeId,
  getStructuredNodeBounds,
  getTextColumnWidth,
  intersectsBounds,
  normalizeScene,
  renderStructuredScene,
  sceneToGridEntries,
  trimTextToColumns,
  withPointWithinBounds,
} from "./model/scene";
export {
  createStructuredSceneSurface,
  StructuredSceneSurfaceIndex,
  type StructuredSceneSurface,
  type StructuredSurfaceStats,
} from "./model/surface";
export type { StructuredTextSelection } from "./model/text-ranges";
export {
  getStructuredTextCaretPoint,
  getStructuredTextOffsetAtPoint,
  getStructuredTextSelectionRange,
  getStructuredTextSlice,
  getStructuredTextStyleRangesInRange,
  getStructuredTextStylesInRange,
  mergeStructuredTextStyle,
  normalizeStructuredTextSelection,
  replaceStructuredTextRange,
  updateStructuredTextStyleRanges,
} from "./model/text-ranges";
export type {
  StructuredBgNode,
  StructuredBoxNode,
  StructuredComponentInstance,
  StructuredLineNode,
  StructuredNode,
  StructuredNodeStyle,
  StructuredSelectionStylePatch,
  StructuredSplitBoxNode,
  StructuredTextNode,
  StructuredTextStyleRange,
} from "./model/types";
export {
  createTextLayout,
  getTextLayoutCaretPoint,
  getTextLayoutOffsetAtPoint,
  getTextLayoutSelectionRects,
  getTextLayoutSurfaceCells,
} from "./model/text-layout";
export {
  createDefaultSplitBoxRoot,
  getSplitBoxPoints,
} from "./model/split-box-geometry";
export type {
  StructuredTemplateListItem,
  StructuredTemplatePreview,
} from "./templates/catalog";
export {
  buildStructuredTemplate,
  buildStructuredTemplateNodes,
  buildStructuredTemplatePreview,
  getActiveStructuredTemplateDragId,
  getStructuredTemplatePreview,
  isStructuredTemplateId,
  setActiveStructuredTemplateDragId,
  STRUCTURED_COMPONENT_TEMPLATES,
  STRUCTURED_PAGE_TEMPLATES,
  STRUCTURED_TEMPLATES,
  STRUCTURED_TEMPLATE_MIME,
} from "./templates/catalog";
export type { StructuredTemplateId } from "./templates/components";
