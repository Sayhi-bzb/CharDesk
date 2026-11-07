import { createCanvas } from '@napi-rs/canvas';
import { MAPLE_FONT_PROFILE } from '@chardesk/font-maple';
import {
  paintCanvasReadImage,
  type CanvasReadImageRenderer,
} from '../../canvas-capabilities/src/readImage';
import { resolveSnapshotFont } from './rasterFonts';

/** Native PNG encoding only; capture, budgets and drawing are shared with Web. */
export const renderLocalReadImage: CanvasReadImageRenderer = async (plan) => {
  const canvas = createCanvas(plan.width, plan.height);
  paintCanvasReadImage(canvas.getContext('2d'), plan, {
    fontProfile: MAPLE_FONT_PROFILE,
    fontResolver: resolveSnapshotFont,
  });
  return canvas.encode('png');
};
