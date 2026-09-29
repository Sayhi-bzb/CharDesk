import { describe, expect, it } from "vitest";
import { collectDroppedBlackboardDirectory, compileBlackboardDirectory } from "./blackboard-directory";

const file = (webkitRelativePath: string, source: string) => ({
  webkitRelativePath,
  text: async () => source,
}) as Pick<File, "text" | "webkitRelativePath">;

const manifest = (title = "") => `
chardesk: blackboard/v1
${title ? `title: ${title}` : ""}
panels:
  left: { source: panels/left.panel }
  right: { source: panels/right.panel }
layout:
  areas: [[left, right]]
  gap: { column: 1, row: 0 }
`;

describe("compileBlackboardDirectory", () => {
  it("compiles one selected directory and falls back to its name", async () => {
    const compiled = await compileBlackboardDirectory([
      file("gpu/blackboard.yaml", manifest()),
      file("gpu/panels/left.panel", "L"),
      file("gpu/panels/right.panel", "R"),
      file("gpu/notes.txt", "ignored"),
    ]);
    expect(compiled).toMatchObject({ title: "gpu", source: "L R", warnings: [] });
  });

  it("uses the manifest title", async () => {
    const compiled = await compileBlackboardDirectory([
      file("folder/blackboard.yaml", manifest("GPU Architecture")),
      file("folder/panels/left.panel", "L"),
      file("folder/panels/right.panel", "R"),
    ]);
    expect(compiled.title).toBe("GPU Architecture");
  });

  it.each([
    [
      "a missing root manifest",
      [file("gpu/nested/blackboard.yaml", manifest())],
      "at its root",
    ],
    [
      "files from multiple roots",
      [file("gpu/blackboard.yaml", manifest()), file("other/panels/left.panel", "L")],
      "one directory",
    ],
    [
      "a missing registered Panel",
      [file("gpu/blackboard.yaml", manifest()), file("gpu/panels/left.panel", "L")],
      "right.panel",
    ],
  ])("rejects %s", async (_name, files, message) => {
    await expect(compileBlackboardDirectory(files)).rejects.toThrow(message);
  });
});

describe("collectDroppedBlackboardDirectory", () => {
  it("reads nested directories and every readEntries batch", async () => {
    const entry = (path: string, source: string) => ({
      isDirectory: false,
      fullPath: path,
      file: (resolve: (file: Pick<File, "text">) => void) => resolve({ text: async () => source }),
    }) as FileSystemFileEntry;
    const directory = (batches: FileSystemEntry[][]) => ({
      isDirectory: true,
      createReader: () => ({
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(batches.shift() ?? []),
      }),
    }) as FileSystemDirectoryEntry;
    const panels = directory([[entry("/gpu/panels/left.panel", "L")], []]);
    const root = directory([
      [entry("/gpu/blackboard.yaml", manifest()), panels],
      [entry("/gpu/panels/right.panel", "R")],
      [],
    ]);

    const files = await collectDroppedBlackboardDirectory(root);
    expect(files.map((item) => item.webkitRelativePath)).toEqual([
      "gpu/blackboard.yaml",
      "gpu/panels/left.panel",
      "gpu/panels/right.panel",
    ]);
    expect(await compileBlackboardDirectory(files)).toMatchObject({ source: "L R" });
  });
});
