import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  BlackboardPackageError,
  compileBlackboard,
  type BlackboardPanelRequest,
  type CompiledBlackboard,
} from "./compiler.js";

export { BlackboardPackageError } from "./compiler.js";

type CompiledBlackboardPackage = CompiledBlackboard & {
  dependencies: string[];
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

const isInside = (root: string, candidate: string) => {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
};

const decodeUtf8 = (
  bytes: Uint8Array,
  message: string,
  code: "invalid-manifest" | "invalid-panel",
  panel?: string,
) => {
  try {
    return utf8.decode(bytes);
  } catch {
    throw new BlackboardPackageError(code, message, panel);
  }
};

export const compileBlackboardPackage = async (
  manifestPath: string,
): Promise<CompiledBlackboardPackage> => {
  const checkedManifest = await realpath(manifestPath);
  const root = dirname(checkedManifest);
  const manifestSource = decodeUtf8(
    await readFile(checkedManifest),
    "blackboard.yaml must be valid UTF-8.",
    "invalid-manifest",
  );
  const dependencies = new Set([checkedManifest]);
  const readPanel = async ({ id, source }: BlackboardPanelRequest) => {
    const candidate = resolve(root, source);
    if (!isInside(root, candidate)) {
      throw new BlackboardPackageError(
        "invalid-panel-path",
        `Panel ${JSON.stringify(id)} must stay inside the Blackboard directory.`,
        id,
      );
    }
    let checked: string;
    try {
      checked = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BlackboardPackageError(
          "missing-panel",
          `Panel ${JSON.stringify(id)} source does not exist: ${source}`,
          id,
        );
      }
      throw error;
    }
    if (!isInside(root, checked)) {
      throw new BlackboardPackageError(
        "invalid-panel-path",
        `Panel ${JSON.stringify(id)} resolves outside the Blackboard directory.`,
        id,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await readFile(checked);
    } catch (error) {
      throw new BlackboardPackageError(
        "invalid-panel",
        `Panel ${JSON.stringify(id)} could not be read: ${
          error instanceof Error ? error.message : source
        }`,
        id,
      );
    }
    dependencies.add(checked);
    return decodeUtf8(
      bytes,
      `Panel ${JSON.stringify(id)} must be valid UTF-8.`,
      "invalid-panel",
      id,
    );
  };
  const compiled = await compileBlackboard({
    manifestSource,
    fallbackTitle: basename(root),
    readPanel,
  });
  return { ...compiled, dependencies: [...dependencies] };
};
