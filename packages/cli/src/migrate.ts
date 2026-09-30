import { stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import { CharDeskCliCommandError } from "./input.js";

export const migrateBlackboardFile = async (cwd: string, input: string, output: string) => {
  const target = resolve(cwd, output);
  if (!target.endsWith(".chardesk")) throw new CharDeskCliCommandError("invalid-output", "Migration output must be a .chardesk file.");
  const path = resolve(cwd, input);
  const manifest = (await stat(path)).isDirectory() ? join(path, "blackboard.yaml") : path;
  if (basename(manifest) !== "blackboard.yaml") throw new CharDeskCliCommandError("invalid-legacy-input", "migrate requires blackboard.yaml or its directory.");
  const { compileBlackboardPackage } = await import("@chardesk/legacy-blackboard/node");
  const compiled = await compileBlackboardPackage(manifest);
  const content = serializeCharDeskDocumentEnvelope({ mode: compiled.mode, title: compiled.title, body: compiled.source });
  try {
    await writeFile(target, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CharDeskCliCommandError("migration-conflict", `Refusing to replace existing path: ${target}`);
    throw error;
  }
  return target;
};
