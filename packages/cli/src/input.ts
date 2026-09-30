import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { parseCharDeskDocumentEnvelope } from "@chardesk/document";
import type { CharDeskCliInputMode } from "./render.js";

export type CharDeskInputModeOption = "auto" | CharDeskCliInputMode;

export type CharDeskInputRequest = {
  input: string;
  inputMode: CharDeskInputModeOption;
};

export type ResolvedCharDeskInput = {
  source: string;
  sourceName: string;
  inputMode: CharDeskCliInputMode;
  warnings: string[];
  dependencies: string[];
};

export class CharDeskCliCommandError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CharDeskCliCommandError";
  }
}

export const decodeUtf8 = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CharDeskCliCommandError("invalid-utf8", "Input must be valid UTF-8.");
  }
};

const readUtf8Stream = async (
  stream: AsyncIterable<Uint8Array | string>,
) => {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return decodeUtf8(joined);
};

const resolveInputMode = (
  request: CharDeskInputRequest,
): CharDeskCliInputMode => request.inputMode === "auto"
  ? request.input !== "-" && extname(request.input).toLowerCase() === ".chardesk"
    ? "chardesk"
    : "chargraph"
  : request.inputMode;

const resolveDocumentInput = (
  request: CharDeskInputRequest,
  source: string,
) => {
  const document = parseCharDeskDocumentEnvelope(source);
  if (!document) return { source, inputMode: resolveInputMode(request) };
  if (document.mode !== "freeform") {
    throw new CharDeskCliCommandError(
      "unsupported-document-mode",
      `CharDesk CLI does not render ${document.mode} documents yet.`,
    );
  }
  return { source: document.body, inputMode: "chardesk" as const };
};

export const resolveCharDeskInput = async ({
  request,
  cwd,
  stdin,
}: {
  request: CharDeskInputRequest;
  cwd: string;
  stdin?: AsyncIterable<Uint8Array | string>;
}): Promise<ResolvedCharDeskInput> => {
  if (request.input === "-") {
    if (!stdin) {
      throw new CharDeskCliCommandError(
        "invalid-live-input",
        "This command requires a file or directory path.",
      );
    }
    return {
      ...resolveDocumentInput(request, await readUtf8Stream(stdin)),
      sourceName: "stdin",
      warnings: [],
      dependencies: [],
    };
  }

  const requested = resolve(cwd, request.input);
  let directory = false;
  try {
    directory = (await stat(requested)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (directory || basename(requested) === "blackboard.yaml") {
    throw new CharDeskCliCommandError("retired-format", "Blackboard is retired. Run chardesk migrate <input> --output <file.chardesk> first.");
  }

  const source = decodeUtf8(await readFile(requested));
  return {
    ...resolveDocumentInput(request, source),
    sourceName: basename(requested),
    warnings: [],
    dependencies: [requested],
  };
};
