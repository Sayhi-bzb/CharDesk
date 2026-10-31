import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
export { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import type { CharDeskCanvasPalette } from '@chardesk/rendering/canvas';
import { BACKGROUND_COLOR, COLOR_PRIMARY_TEXT, GRID_COLOR } from '@/shared/lib/constants';

export type CanvasArtifactPalette = Readonly<CharDeskCanvasPalette & { grid: string }>;

export const DEFAULT_ARTIFACT_CANVAS_PALETTE: CanvasArtifactPalette = Object.freeze({
  color: COLOR_PRIMARY_TEXT,
  background: BACKGROUND_COLOR,
  grid: GRID_COLOR,
});

type ArtifactCellStyle = Readonly<{
  color: string;
  bgColor?: string;
}>;

export const projectArtifactCellStyle = (
  style: ArtifactCellStyle,
  palette: CharDeskCanvasPalette
): ArtifactCellStyle => ({
  color: isDefaultArtifactForeground(style) ? palette.color : style.color,
  ...(style.bgColor !== undefined ? { bgColor: style.bgColor } : {}),
});
