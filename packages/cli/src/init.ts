import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import { CharDeskCliCommandError } from "./input.js";

export const initializeCharDeskWorkspace = async ({ cwd, directory, title, mode = "freeform" }: {
  cwd: string;
  directory: string;
  title?: string;
  mode?: "freeform" | "slide";
}) => {
  const path = resolve(cwd, directory);
  if (!path.endsWith(".chardesk")) throw new CharDeskCliCommandError("invalid-output", "init requires a .chardesk file.");
  const name = title?.trim() || basename(path, ".chardesk");
  const content = serializeCharDeskDocumentEnvelope({ mode, title: name,
    body: mode === "slide" ? "## Opening\n\n```text\n\n```\n" : "" });
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CharDeskCliCommandError("init-conflict", `Refusing to replace existing path: ${path}`);
    throw error;
  }
  return path;
};
