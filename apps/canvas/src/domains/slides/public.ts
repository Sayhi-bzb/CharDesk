export {
  activateSlide,
  addSlide,
  createSlideDeck,
  createSlideDeckDescriptor,
  createSlideId,
  duplicateSlide,
  getSlideResizeCropCount,
  moveSlide,
  removeSlide,
  renameSlide,
  resizeSlide,
  updateSlideGrid,
  addSlideDescriptor,
  duplicateSlideDescriptor,
  resizeSlideDescriptor,
  toSlideDeckDescriptor,
} from "./deck";
export { normalizeSlideDeckSnapshot } from "./normalize";
export {
  isSlideMarkdownSource,
  parseSlideMarkdown,
  parseSlideMarkdownBody,
} from "./markdown";
export { isValidSlideDimension, isValidSlideSize } from "./grid";
export type {
  SlideDeckDescriptor,
  SlideDeckSnapshot,
  SlideDescriptor,
  SlideGridEntry,
  SlideSize,
  SlideSnapshot,
} from "./model";
export { DEFAULT_SLIDE_SIZE, SLIDE_SIZE_PRESETS } from "./model";
