import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileBlackboardPackage } from "./package.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const fixture = async (areas: string, gap = "{ column: 1, row: 1 }") => {
  const root = await mkdtemp(join(tmpdir(), "chardesk-blackboard-package-"));
  roots.push(root);
  await mkdir(join(root, "panels"));
  await writeFile(join(root, "blackboard.yaml"), `
chardesk: blackboard/v1
title: Layout
panels:
  a: { source: panels/a.panel }
  b: { source: panels/b.panel }
  c: { source: panels/c.panel }
layout:
  areas: ${areas}
  gap: ${gap}
`);
  return root;
};

describe("compileBlackboardPackage", () => {
  it("composes intrinsic tracks and rectangular spans into static source", async () => {
    const root = await fixture("[[a, a], [b, c]]");
    await writeFile(join(root, "panels/a.panel"), "AAAAAAA");
    await writeFile(join(root, "panels/b.panel"), "B");
    await writeFile(join(root, "panels/c.panel"), "C");

    await expect(compileBlackboardPackage(join(root, "blackboard.yaml"))).resolves.toMatchObject({
      title: "Layout",
      source: "AAAAAAA\n\nB   C",
      warnings: [],
    });
  });

  it("preserves CharGraph rendering, CJK width, and visible styles", async () => {
    const root = await fixture("[[a, b, null]]", "{ column: 2, row: 0 }");
    await writeFile(join(root, "panels/a.panel"), "[1m界[0m\n|||\n👩‍💻");
    await writeFile(join(root, "panels/b.panel"), "```json\n{\"ok\":true}\n```");
    await writeFile(join(root, "panels/c.panel"), "draft");

    const compiled = await compileBlackboardPackage(join(root, "blackboard.yaml"));
    expect(compiled.source).not.toContain("\u001b");
    expect(compiled.source).toContain("[1m界[0m");
    expect(compiled.source).toContain("👩‍💻");
    expect(compiled.source).toContain("ok");
    expect(compiled.warnings).toEqual([
      expect.objectContaining({ code: "unused-panel", panel: "c" }),
    ]);
  });

  it("rejects missing files and panel symlinks outside the package", async () => {
    const root = await fixture("[[a, b, c]]");
    await writeFile(join(root, "panels/a.panel"), "A");
    await writeFile(join(root, "panels/b.panel"), "B");
    await expect(compileBlackboardPackage(join(root, "blackboard.yaml")))
      .rejects.toMatchObject({ code: "missing-panel", panel: "c" });

    const outside = await mkdtemp(join(tmpdir(), "chardesk-blackboard-panel-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "c.panel"), "C");
    await symlink(join(outside, "c.panel"), join(root, "panels/c.panel"));
    await expect(compileBlackboardPackage(join(root, "blackboard.yaml")))
      .rejects.toMatchObject({ code: "invalid-panel-path", panel: "c" });
  });
});
