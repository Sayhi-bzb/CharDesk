import {
  WelcomeAppearance,
  type WelcomeAppearanceSnapshot,
} from '@chardesk/canvas-templates/welcome-appearance';
import { normalizeContentRgb } from '@chardesk/rendering/theme';
import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import type { GridCellSource } from '@/shared/types';
import type { CharDeskCanvasPalette } from '@chardesk/rendering/canvas';

const appearances = new WeakMap<CharDeskCanvasPalette, WelcomeAppearance>();
const cssColors = new Map<string, string | null>();
function readRgb(value: string): string | null {
  const normalized = normalizeContentRgb(value);
  if (normalized) return normalized;
  if (cssColors.has(value)) return cssColors.get(value)!;
  if (typeof document === 'undefined') return null;
  // Browser-computed colors can remain OKLCH. Let the browser convert its own CSS to sRGB.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx?.getImageData) return null;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const bytes = ctx.getImageData(0, 0, 1, 1).data;
  const result =
    bytes[3] === 255
      ? '#' + [...bytes.slice(0, 3)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      : null;
  cssColors.set(value, result);
  return result;
}
export function getWelcomeAppearance(palette: CharDeskCanvasPalette) {
  let presenter = appearances.get(palette);
  if (!presenter) {
    let snapshot: WelcomeAppearanceSnapshot | undefined;
    presenter = new WelcomeAppearance(() => {
      if (!snapshot) {
        const foreground = readRgb(palette.color),
          background = readRgb(palette.background);
        snapshot = {
          revision: 0,
          palette: foreground && background ? { foreground, background } : null,
        };
      }
      return snapshot;
    });
    appearances.set(palette, presenter);
  }
  return presenter;
}
export function projectWelcomeSurface(
  source: CanvasSurfaceReader,
  palette: CharDeskCanvasPalette,
  scope?: GridCellSource
): CanvasSurfaceReader;
export function projectWelcomeSurface(
  source: GridCellSource,
  palette: CharDeskCanvasPalette,
  scope?: GridCellSource
): GridCellSource;
export function projectWelcomeSurface(
  source: GridCellSource,
  palette: CharDeskCanvasPalette,
  scope?: GridCellSource
) {
  return getWelcomeAppearance(palette).project(source, scope);
}
