export const CHARDESK_DOCUMENT_SIGNATURE = "document/v1";

export type CharDeskDocumentMode = "freeform" | "slide";
export type ParsedCharDeskDocumentMode = CharDeskDocumentMode | "structured";

export type CharDeskDocumentEnvelope = {
  mode: CharDeskDocumentMode;
  body: string;
  title?: string;
  /** Explicit opt-in extension. Bodies remain canonical visible-control text. */
  canvas?: unknown;
};

export type ParsedCharDeskDocumentEnvelope = Omit<
  CharDeskDocumentEnvelope,
  "mode"
> & { mode: ParsedCharDeskDocumentMode };

const normalizeSource = (source: string) =>
  source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

const isDocumentMode = (value: string): value is ParsedCharDeskDocumentMode =>
  value === "freeform" || value === "structured" || value === "slide";

export const parseCharDeskDocumentEnvelope = (
  source: string,
  options: { allowCanvasMetadata?: boolean } = {}
): ParsedCharDeskDocumentEnvelope | null => {
  const normalized = normalizeSource(source);
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );
  if (endIndex < 0) {
    if (lines.some((line) => /^\s*chardesk:\s*document\//i.test(line))) {
      throw new Error("Invalid CharDesk document header.");
    }
    return null;
  }

  const metadata = new Map<string, string>();
  const duplicates = new Set<string>();
  lines.slice(1, endIndex).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    if (metadata.has(key)) duplicates.add(key);
    metadata.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim()
    );
  });

  const signature = metadata.get("chardesk");
  const canvasVersion = signature === 'document/v2' && options.allowCanvasMetadata;
  if (signature !== CHARDESK_DOCUMENT_SIGNATURE && !canvasVersion) {
    if (signature?.startsWith("document/")) {
      throw new Error(`Unsupported CharDesk document version: ${signature}.`);
    }
    return null;
  }
  const mode = metadata.get("mode") ?? "";
  if (!isDocumentMode(mode)) {
    throw new Error("CharDesk document mode must be freeform, structured, or slide.");
  }

  const title = metadata.get("title")?.trim();
  let canvas: unknown;
  if (!canvasVersion && metadata.has('canvas')) throw new Error('Canvas metadata requires document/v2.');
  if (canvasVersion) {
    if (duplicates.size || [...metadata.keys()].some((key) => !['chardesk', 'mode', 'title', 'canvas'].includes(key)))
      throw new Error('Invalid or unsupported Canvas document header.');
    if (mode !== 'freeform' || !metadata.has('canvas')) throw new Error('Invalid Canvas document header.');
    try { canvas = JSON.parse(metadata.get('canvas')!); }
    catch { throw new Error('Invalid Canvas document metadata.'); }
    if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) throw new Error('Invalid Canvas document metadata.');
  }
  return {
    mode,
    body: lines.slice(endIndex + 1).join("\n"),
    ...(title ? { title } : {}),
    ...(canvasVersion ? { canvas } : {}),
  };
};

const oneLine = (value: string) => value.replace(/[\r\n]/g, " ").trim();

export const serializeCharDeskDocumentEnvelope = (
  envelope: CharDeskDocumentEnvelope
) => {
  if (envelope.canvas !== undefined && envelope.mode !== 'freeform') throw new Error('Canvas metadata requires Freeform mode.');
  const header = [
    "---",
    `chardesk: ${envelope.canvas === undefined ? CHARDESK_DOCUMENT_SIGNATURE : 'document/v2'}`,
    `mode: ${envelope.mode}`,
    ...(envelope.title?.trim() ? [`title: ${oneLine(envelope.title)}`] : []),
    ...(envelope.canvas === undefined ? [] : [`canvas: ${JSON.stringify(envelope.canvas)}`]),
    "---",
  ];
  return `${header.join("\n")}\n${normalizeSource(envelope.body)}`;
};
