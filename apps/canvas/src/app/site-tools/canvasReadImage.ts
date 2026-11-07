import { MAPLE_FONT_PROFILE } from '@chardesk/font-maple';
import { loadCharDeskCanvasFonts } from '@chardesk/rendering/canvas';
import {
  paintCanvasReadImage,
  type CanvasReadImageRenderer,
} from '@chardesk/canvas-capabilities/readImage';

/** Browser font loading and PNG encoding; no tool policy or surface reads. */
export const renderBrowserReadImage: CanvasReadImageRenderer = async (plan) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  await loadCharDeskCanvasFonts(
    plan.entries.map(({ cell }) => ({
      grapheme: cell.text,
      bold: cell.attrs?.bold,
      italic: cell.attrs?.italic,
    })),
    { fontProfile: MAPLE_FONT_PROFILE }
  );
  paintCanvasReadImage(context, plan, { fontProfile: MAPLE_FONT_PROFILE });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};
