import { parseCharDeskDocumentEnvelope } from "@chardesk/document";
import type { CanvasImportSnapshot } from "@/domains/sessions/public";
import {
  isSlideMarkdownSource,
  parseSlideMarkdown,
  parseSlideMarkdownBody,
} from "@/domains/slides/public";
import { parseCharDeskCanvasSource } from "./protocol/import";
import { parseStructuredDocumentBody } from "./structured-source";

export const parseDocumentSessionSource = async (
  raw: string | unknown,
  options?: { sourceName?: string }
): Promise<CanvasImportSnapshot> => {
  if (typeof raw !== "string") {
    throw new Error("CharDesk source must be text.");
  }

  const document = parseCharDeskDocumentEnvelope(raw);
  if (document) {
    if (document.mode === "freeform") {
      const snapshot = await parseCharDeskCanvasSource(document.body, "chardesk");
      return {
        ...snapshot,
        ...(document.title ? { name: document.title } : {}),
      };
    }
    if (document.mode === "structured") {
      return {
        ...parseStructuredDocumentBody(document.body),
        ...(document.title ? { name: document.title } : {}),
      };
    }
    const parsed = await parseSlideMarkdownBody(document.body);
    return {
      mode: "slide" as const,
      slideDeck: parsed.slideDeck,
      ...(document.title ? { name: document.title } : {}),
    };
  }

  if (isSlideMarkdownSource(raw)) {
    const parsed = await parseSlideMarkdown(raw);
    return {
      mode: "slide" as const,
      slideDeck: parsed.slideDeck,
      ...(parsed.title ? { name: parsed.title } : {}),
    };
  }

  const sourceName = options?.sourceName?.toLowerCase() ?? "";
  const sourceKind = sourceName.endsWith(".md")
    ? "chargraph"
    : sourceName.endsWith(".txt")
      ? "plain"
      : sourceName.endsWith(".ans")
        ? "ansi"
        : "chardesk";
  return parseCharDeskCanvasSource(raw, sourceKind);
};
