import type { CharDeskCanvasPalette } from "@chardesk/rendering/canvas";
import { BACKGROUND_COLOR, COLOR_PRIMARY_TEXT, GRID_COLOR } from "@/shared/lib/constants";

export type CanvasArtifactPalette = Readonly<
  CharDeskCanvasPalette & { grid: string }
>;

export const DEFAULT_ARTIFACT_CANVAS_PALETTE: CanvasArtifactPalette =
  Object.freeze({
    color: COLOR_PRIMARY_TEXT,
    background: BACKGROUND_COLOR,
    grid: GRID_COLOR,
  });

export type ArtifactCellStyle = Readonly<{
  color: string;
  bgColor?: string;
}>;

export const isDefaultArtifactForeground = (style: ArtifactCellStyle) =>
  style.color.toLowerCase() === COLOR_PRIMARY_TEXT.toLowerCase() &&
  style.bgColor === undefined;

export const projectArtifactCellStyle = (
  style: ArtifactCellStyle,
  palette: CharDeskCanvasPalette
): ArtifactCellStyle => ({
  color: isDefaultArtifactForeground(style) ? palette.color : style.color,
  ...(style.bgColor !== undefined ? { bgColor: style.bgColor } : {}),
});
