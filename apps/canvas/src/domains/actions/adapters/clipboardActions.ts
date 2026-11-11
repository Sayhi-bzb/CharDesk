import {
  CHARDESK_CLIPBOARD_MIME as MIME_RICH_DATA,
  buildRichClipboardHtml,
  parseRichClipboardHtml,
  parseRichClipboardText,
} from "@chardesk/editor-core/clipboard/rich";
export { hasClipboardSource, buildClipboardPayload } from "@chardesk/editor-core/clipboard/payload";
import {
  renderTextSource,
  type CompactTextRenderResult,
  type TextRenderContext,
  type TextRenderResult,
} from "@/domains/document/public";
import { clipboard } from "@/shared/services/effects";
import { parseAnsiTextCells } from "@/shared/utils/ansiText";
import { readHtmlClipboard } from "./htmlClipboard";

const DEFAULT_ANSI_PASTE_COLOR = "#ffffff";

import type { ClipboardPayload } from "@chardesk/editor-core/clipboard/payload";

/** @deprecated Use the document text-rendering runtime for new clipboard paths. */
export const parseAnsiClipboardText = (source: string, defaultColor = DEFAULT_ANSI_PASTE_COLOR) =>
  parseAnsiTextCells(source, defaultColor);

export type RenderClipboardText = (
  source: string,
  defaultColor: string,
  context?: TextRenderContext
) =>
  TextRenderResult | CompactTextRenderResult | Promise<TextRenderResult | CompactTextRenderResult>;

const toRenderedClipboardPayload = async (
  source: string,
  defaultColor: string,
  renderText: RenderClipboardText,
  context?: TextRenderContext,
  html = ""
) => {
  const imported = readHtmlClipboard(html, source);
  const rendered = await renderText(imported?.source ?? source, defaultColor, imported ? {
    ...context,
    themeMode: context?.themeMode ?? "light",
    rendererMode: imported.spans ? "markdown" : "raw",
    semanticSpans: imported.spans ?? undefined,
  } : context);
  if (rendered.kind === "spans") {
    return {
      richRows: rendered.rows,
      richCells: null,
      plainText: imported?.source ?? source,
      diagnostics: rendered.diagnostics,
      headings: rendered.renderer === "markdown" ? (rendered.headings ?? []) : [],
    };
  }
  return rendered.kind === "styled"
    ? {
        richCells: rendered.cells,
        plainText: imported?.source ?? source,
        diagnostics: rendered.diagnostics,
        headings: rendered.renderer === "markdown" ? (rendered.headings ?? []) : [],
      }
    : {
        richCells: null,
        plainText: rendered.text,
        diagnostics: rendered.diagnostics,
        headings: [],
      };
};

interface WriteClipboardOptions {
  event?: ClipboardEvent;
  withRich?: boolean;
}

export const writeClipboardPayload = async (
  payload: ClipboardPayload,
  options: WriteClipboardOptions = {}
) => {
  const { event, withRich = false } = options;

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData("text/plain", payload.plain);
    // Include app-native rich data on copy events so in-app paste can
    // reconstruct multi-cell selections while external apps still receive plain text.
    if (payload.rich) {
      event.clipboardData.setData(MIME_RICH_DATA, payload.rich);
      const html = buildRichClipboardHtml(payload);
      if (html) event.clipboardData.setData("text/html", html);
    }
    return true;
  }

  try {
    if (withRich && payload.rich && typeof ClipboardItem !== "undefined") {
      const html = buildRichClipboardHtml(payload);
      const clipboardMap: Record<string, Blob> = {
        ...(html ? { "text/html": new Blob([html], { type: "text/html" }) } : {}),
        "text/plain": new Blob([payload.plain], { type: "text/plain" }),
        [MIME_RICH_DATA]: new Blob([payload.rich], {
          type: MIME_RICH_DATA,
        }),
      };

      const richCopied = await clipboard.writeItems([new ClipboardItem(clipboardMap)]);
      if (richCopied) return true;
      return clipboard.writeText(payload.plain);
    }

    return clipboard.writeText(payload.plain);
  } catch {
    return false;
  }
};

const readClipboardItems = async (): Promise<{
  richCells: import("@chardesk/editor-core/textCommandTypes").RichTextCell[] | null;
  plainText: string | null;
  html?: string;
} | null> => {
  const items = await clipboard.readItems();
  let html = "";
  let plainText = "";
  if (items) {
    for (const item of items) {
      for (const type of [MIME_RICH_DATA, "text/html"]) {
        if (!item.types.includes(type)) continue;
        const raw = await (await item.getType(type)).text();
        const parsed =
          type === MIME_RICH_DATA ? parseRichClipboardText(raw) : parseRichClipboardHtml(raw);
        if (parsed) return parsed;
        if (type === "text/html" && !html) html = raw;
      }
      if (!plainText && item.types.includes("text/plain")) {
        plainText = await (await item.getType("text/plain")).text();
      }
    }
  }

  return html || plainText ? { richCells: null, plainText, html } : null;
};

export const readClipboardPayload = async (
  eventDataTransfer?: DataTransfer,
  defaultColor = DEFAULT_ANSI_PASTE_COLOR,
  renderText: RenderClipboardText = renderTextSource,
  context?: TextRenderContext
) => {
  // ClipboardEvent data is only guaranteed to remain readable while the
  // event is being dispatched. Snapshot every format before the first await.
  const eventRichText = eventDataTransfer?.getData(MIME_RICH_DATA) ?? "";
  const eventPlainText = eventDataTransfer?.getData("text/plain") ?? "";
  const eventHtml = eventDataTransfer?.getData("text/html") ?? "";
  const eventRichPayload =
    parseRichClipboardText(eventRichText) ?? parseRichClipboardHtml(eventHtml);
  if (eventRichPayload) {
    return {
      richCells: eventRichPayload.richCells,
      plainText: eventRichPayload.plainText,
      diagnostics: [],
    };
  }

  if (eventPlainText || eventHtml) {
    return await toRenderedClipboardPayload(eventPlainText, defaultColor, renderText, context, eventHtml);
  }

  const richPayload = await readClipboardItems();
  if (richPayload) {
    if (!richPayload.richCells) {
      return await toRenderedClipboardPayload(richPayload.plainText ?? "", defaultColor, renderText, context, richPayload.html);
    }
    return {
      richCells: richPayload.richCells,
      plainText: richPayload.plainText,
      diagnostics: [],
    };
  }

  const text = await clipboard.readText();
  if (text === null) {
    return {
      richCells: null,
      plainText: null,
      diagnostics: [],
      error: "clipboard-failed" as const,
    };
  }
  if (text) {
    return await toRenderedClipboardPayload(text, defaultColor, renderText, context);
  }

  return {
    richCells: null,
    plainText: null,
    diagnostics: [],
  };
};
