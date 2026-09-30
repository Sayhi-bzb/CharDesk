import { describe, expect, it } from "vitest";
import {
  analyzeBlackboardSourceTree,
  compileBlackboardSourceTree,
  normalizeBlackboardPath,
} from "./source-tree.js";

const manifest = `chardesk: blackboard/v1
title: Example
panels:
  intro:
    source: panels/intro.panel
layout:
  areas:
    - [intro]
`;

describe("Blackboard source tree", () => {
  it("compiles virtual files through the package compiler", async () => {
    const compiled = await compileBlackboardSourceTree(new Map([
      ["blackboard.yaml", manifest],
      ["panels/intro.panel", "Hello"],
    ]));
    expect(compiled).toMatchObject({ title: "Example", source: "Hello" });
  });

  it("classifies visible, draft, and unreferenced source files", () => {
    const source = manifest.replace(
      "    source: panels/intro.panel",
      "    source: panels/intro.panel\n  draft:\n    source: panels/draft.panel",
    );
    expect(analyzeBlackboardSourceTree(new Map([
      ["blackboard.yaml", source],
      ["panels/intro.panel", "Hello"],
      ["panels/draft.panel", "Later"],
      ["gpu-intro.chardesk", "Invisible"],
    ]))).toEqual({
      entrypoint: "blackboard.yaml",
      visibleFiles: ["panels/intro.panel"],
      draftFiles: ["panels/draft.panel"],
      unreferencedFiles: ["gpu-intro.chardesk"],
    });
  });

  it("classifies Slide pages through layout.pages", () => {
    const source = `chardesk: blackboard/v2
mode: slide
panels:
  opening: { source: panels/opening.panel }
  draft: { source: panels/draft.panel }
layout:
  pages: [opening]
`;
    expect(analyzeBlackboardSourceTree(new Map([
      ["blackboard.yaml", source],
      ["panels/opening.panel", "Opening"],
      ["panels/draft.panel", "Later"],
    ]))).toMatchObject({
      visibleFiles: ["panels/opening.panel"],
      draftFiles: ["panels/draft.panel"],
    });
  });

  it.each(["../secret", "/root", "a\\b", "a//b"])(
    "rejects paths outside the virtual root: %s",
    (path) => expect(() => normalizeBlackboardPath(path)).toThrow(),
  );
});
