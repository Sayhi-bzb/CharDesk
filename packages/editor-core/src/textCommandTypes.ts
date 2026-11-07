import type { TextAttributes } from '@chardesk/cell-plane/types';
import type { CanvasAnchorSeed } from './canvasAnchorModel.js';

export interface RichTextCell {
  x: number;
  y: number;
  char: string;
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
}

export interface RichTextSpan extends Omit<RichTextCell, 'y' | 'char'> {
  text: string;
  width: number;
}

export interface RichTextRow {
  y: number;
  spans: RichTextSpan[];
}

export type TextWriteOptions = Readonly<{
  preserveTargetBackground?: boolean;
  selectResult?: boolean;
}>;

export type TextPasteOptions = Readonly<{
  selectResult?: boolean;
  anchorSeeds?: readonly CanvasAnchorSeed[];
}>;
