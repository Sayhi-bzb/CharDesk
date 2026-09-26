import { describe, expect, it } from "vitest";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { EDITOR_COMMAND_META } from "./catalog";

describe("action catalog iconology", () => {
  it("defines memorable, non-conflicting text-formatting shortcuts", () => {
    expect(EDITOR_COMMAND_META["format-bold"].shortcuts).toEqual([["mod", "b"]]);
    expect(EDITOR_COMMAND_META["format-italic"].shortcuts).toEqual([["mod", "i"]]);
    expect(EDITOR_COMMAND_META["format-underline"].shortcuts).toEqual([["mod", "u"]]);
    expect(EDITOR_COMMAND_META["format-strike"].shortcuts).toEqual([
      ["mod", "shift", "x"],
    ]);
    expect(EDITOR_COMMAND_META["format-inverse"].shortcuts).toEqual(["mod+k i"]);
  });

  it("consumes the semantic editor action icons", () => {
    expect(EDITOR_COMMAND_META.paste.icon).toBe(
      HOST_ICONOLOGY.editorAction.paste
    );
    expect(EDITOR_COMMAND_META["copy-ansi"].icon).toBe(
      HOST_ICONOLOGY.editorAction["copy-ansi"]
    );
  });
});
