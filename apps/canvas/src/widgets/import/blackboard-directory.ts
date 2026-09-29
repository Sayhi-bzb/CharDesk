import {
  BlackboardPackageError,
  compileBlackboardSourceTree,
  type CompiledBlackboard,
} from "@chardesk/blackboard";

const ROOT_MANIFEST = "blackboard.yaml";

type DirectoryFile = Pick<File, "text" | "webkitRelativePath">;

export const collectDroppedBlackboardDirectory = async (
  root: FileSystemDirectoryEntry,
): Promise<DirectoryFile[]> => {
  const files: DirectoryFile[] = [];
  const visit = async (directory: FileSystemDirectoryEntry): Promise<void> => {
    const reader = directory.createReader();
    for (;;) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (entries.length === 0) break;
      await Promise.all(entries.map(async (entry) => {
        if (entry.isDirectory) {
          await visit(entry as FileSystemDirectoryEntry);
          return;
        }
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.push({ text: () => file.text(), webkitRelativePath: entry.fullPath.replace(/^\//, "") });
      }));
    }
  };
  await visit(root);
  return files;
};

export const compileBlackboardDirectory = async (
  selected: Iterable<DirectoryFile>,
): Promise<CompiledBlackboard> => (await readBlackboardDirectory(selected)).compiled;

const readBlackboardDirectory = async (
  selected: Iterable<DirectoryFile>,
) => {
  const files = [...selected];
  if (files.length === 0) {
    throw new BlackboardPackageError("invalid-manifest", "Choose a Blackboard directory.");
  }
  const entries = new Map<string, DirectoryFile>();
  let rootName: string | undefined;
  files.forEach((file) => {
    const segments = file.webkitRelativePath.split("/");
    if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
      throw new BlackboardPackageError(
        "invalid-manifest",
        "Choose the Blackboard directory instead of individual files.",
      );
    }
    const [currentRoot, ...relativeSegments] = segments;
    if (rootName !== undefined && currentRoot !== rootName) {
      throw new BlackboardPackageError(
        "invalid-manifest",
        "A Blackboard import must come from one directory.",
      );
    }
    rootName = currentRoot;
    const relativePath = relativeSegments.join("/");
    if (entries.has(relativePath)) {
      throw new BlackboardPackageError(
        "invalid-manifest",
        `Blackboard directory contains duplicate path ${JSON.stringify(relativePath)}.`,
      );
    }
    entries.set(relativePath, file);
  });

  if (!entries.has(ROOT_MANIFEST)) {
    throw new BlackboardPackageError(
      "invalid-manifest",
      `Selected directory must contain ${ROOT_MANIFEST} at its root.`,
    );
  }
  const sourceTree = new Map(await Promise.all(
      [...entries].map(async ([path, file]) => [path, await file.text()] as const),
    ));
  const compiled = await compileBlackboardSourceTree(
    sourceTree,
    rootName!,
  );
  return { rootName: rootName!, sourceTree, compiled };
};
