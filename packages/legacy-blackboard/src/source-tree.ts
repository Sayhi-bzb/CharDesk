import {
  BlackboardPackageError,
  compileBlackboard,
  type CompiledBlackboard,
} from "./compiler.js";
import {
  BlackboardManifestError,
  parseBlackboardManifest,
} from "./manifest.js";

export type BlackboardSourceTreeEntry = {
  path: string;
  content: string;
};

export type BlackboardSourceTree =
  | ReadonlyMap<string, string>
  | readonly BlackboardSourceTreeEntry[];

export const BLACKBOARD_SOURCE_ENTRYPOINT = "blackboard.yaml";

export type BlackboardSourceGraph = Readonly<{
  entrypoint: typeof BLACKBOARD_SOURCE_ENTRYPOINT;
  visibleFiles: readonly string[];
  draftFiles: readonly string[];
  unreferencedFiles: readonly string[];
}>;

import { normalizeBlackboardPath } from "./source-path.js";
export { normalizeBlackboardPath } from "./source-path.js";

const toEntries = (tree: BlackboardSourceTree) => {
  const entries = new Map<string, string>();
  const sourceEntries: Iterable<readonly [string, string]> = Array.isArray(tree)
    ? tree.map(({ path, content }) => [path, content] as const)
    : (tree as ReadonlyMap<string, string>).entries();
  for (const [path, content] of sourceEntries) {
    const normalized = normalizeBlackboardPath(path);
    if (entries.has(normalized)) {
      throw new BlackboardPackageError(
        "invalid-manifest",
        `Blackboard source tree contains duplicate path ${JSON.stringify(normalized)}.`,
      );
    }
    entries.set(normalized, content);
  }
  return entries;
};

export const compileBlackboardSourceTree = async (
  tree: BlackboardSourceTree,
  fallbackTitle = "Blackboard",
): Promise<CompiledBlackboard> => {
  const entries = toEntries(tree);
  const manifestSource = entries.get(BLACKBOARD_SOURCE_ENTRYPOINT);
  if (manifestSource === undefined) {
    throw new BlackboardPackageError(
      "invalid-manifest",
      `Blackboard source tree must contain ${BLACKBOARD_SOURCE_ENTRYPOINT} at its root.`,
    );
  }
  return compileBlackboard({
    manifestSource,
    fallbackTitle,
    readPanel: async ({ id, source }) => {
      const normalized = normalizeBlackboardPath(source);
      const panel = entries.get(normalized);
      if (panel === undefined) {
        throw new BlackboardPackageError(
          "missing-panel",
          `Panel ${JSON.stringify(id)} source does not exist: ${normalized}`,
          id,
        );
      }
      return panel;
    },
  });
};

export const analyzeBlackboardSourceTree = (
  tree: BlackboardSourceTree,
): BlackboardSourceGraph => {
  const entries = toEntries(tree);
  const manifestSource = entries.get(BLACKBOARD_SOURCE_ENTRYPOINT);
  if (manifestSource === undefined) {
    throw new BlackboardPackageError(
      "invalid-manifest",
      `Blackboard source tree must contain ${BLACKBOARD_SOURCE_ENTRYPOINT} at its root.`,
    );
  }
  let manifest: ReturnType<typeof parseBlackboardManifest>["manifest"];
  try {
    manifest = parseBlackboardManifest(manifestSource).manifest;
  } catch (error) {
    if (error instanceof BlackboardManifestError) {
      throw new BlackboardPackageError("invalid-manifest", error.message);
    }
    throw error;
  }
  const visibleIds = new Set(
    manifest.mode === "slide"
      ? manifest.layout.pages
      : manifest.layout.areas.flatMap(
          (row) => row.filter((id): id is string => id !== null),
        ),
  );
  const visibleFiles = new Set<string>();
  const draftFiles = new Set<string>();
  const registeredFiles = new Set<string>();
  Object.entries(manifest.panels).forEach(([id, panel]) => {
    const source = normalizeBlackboardPath(panel.source);
    registeredFiles.add(source);
    (visibleIds.has(id) ? visibleFiles : draftFiles).add(source);
  });
  const sorted = (values: Iterable<string>) => [...values].sort((left, right) =>
    left.localeCompare(right)
  );
  return {
    entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
    visibleFiles: sorted(visibleFiles),
    draftFiles: sorted(draftFiles).filter((path) => !visibleFiles.has(path)),
    unreferencedFiles: sorted(entries.keys()).filter((path) =>
      path !== BLACKBOARD_SOURCE_ENTRYPOINT && !registeredFiles.has(path)
    ),
  };
};
