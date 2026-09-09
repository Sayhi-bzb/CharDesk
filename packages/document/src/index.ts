export const CHARDESK_DOCUMENT_SIGNATURE = "document/v1";

export type CharDeskDocumentMode = "freeform" | "slide";
export type ParsedCharDeskDocumentMode = CharDeskDocumentMode | "structured";

export type CharDeskDocumentEnvelope = {
  mode: CharDeskDocumentMode;
  body: string;
  title?: string;
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
  source: string
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
  lines.slice(1, endIndex).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return;
    metadata.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim()
    );
  });

  const signature = metadata.get("chardesk");
  if (signature !== CHARDESK_DOCUMENT_SIGNATURE) {
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
  return {
    mode,
    body: lines.slice(endIndex + 1).join("\n"),
    ...(title ? { title } : {}),
  };
};

const oneLine = (value: string) => value.replace(/\r?\n/g, " ").trim();

export const serializeCharDeskDocumentEnvelope = (
  envelope: CharDeskDocumentEnvelope
) => {
  const header = [
    "---",
    `chardesk: ${CHARDESK_DOCUMENT_SIGNATURE}`,
    `mode: ${envelope.mode}`,
    ...(envelope.title?.trim() ? [`title: ${oneLine(envelope.title)}`] : []),
    "---",
  ];
  return `${header.join("\n")}\n${normalizeSource(envelope.body)}`;
};
