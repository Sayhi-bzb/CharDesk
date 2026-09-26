import {
  compileCharDeskText,
  materializeCompiledCharDeskText,
  type CharDeskSourceKind,
} from "@chardesk/chargraph";
import { createCharDeskMarkdownRenderOptions } from "@chardesk/chargraph/markdown";
import { CHARDESK_LIGHT_CONTENT_THEME } from "@chardesk/rendering/theme";
import type { CanvasImportSnapshot } from "@/domains/sessions/public";
import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";

const isLegacyJsonDocument = (source: string) => {
  if (!source.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(source) as { type?: unknown };
    return parsed?.type === "chardesk-document";
  } catch {
    return false;
  }
};

export const parseCharDeskCanvasSource = async (
  source: string,
  sourceKind: CharDeskSourceKind = "chardesk"
): Promise<CanvasImportSnapshot> => {
  const trimmed = source.trimStart();
  if (isLegacyJsonDocument(trimmed)) {
    throw new Error("Legacy JSON CharDesk documents are not supported.");
  }
  const compiled = await compileCharDeskText(source, {
    sourceKind,
    defaultStyle: { color: COLOR_PRIMARY_TEXT },
    markdown: createCharDeskMarkdownRenderOptions({
      theme: CHARDESK_LIGHT_CONTENT_THEME,
    }),
  });
  if (
    (sourceKind === "chardesk" || sourceKind === "ansi") &&
    compiled.diagnostics.length > 0
  ) {
    throw new Error("CharDesk source contains malformed or unsupported controls.");
  }
  const parsed = materializeCompiledCharDeskText(compiled);
  return {
    mode: "freeform",
    grid: parsed.cells.map((cell) => [
      `${cell.x},${cell.y}`,
      {
        char: cell.text,
        color: cell.color ?? COLOR_PRIMARY_TEXT,
        ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
        ...(cell.href ? { href: cell.href } : {}),
      },
    ]),
  };
};
