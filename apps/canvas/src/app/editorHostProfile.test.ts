import { describe, expect, it } from "vitest";
import {
  EDITOR_HOST_PROFILE,
  resolveEditorHostContract,
} from "./editorHostProfile";

describe("Editor Host contract", () => {
  it.each(["freeform", "slide"] as const)(
    "exposes editable %s behavior and surfaces",
    (mode) => {
      expect(resolveEditorHostContract(EDITOR_HOST_PROFILE, {
        mode,
        canEdit: true,
        sourceBacked: false,
      })).toEqual({
        capabilities: {
          navigate: true,
          select: true,
          copy: true,
          mutateContent: true,
          manageSessions: true,
          collaborate: mode !== "slide",
        },
        surfaces: { inspector: mode, sidebar: mode },
      });
    },
  );

  it("keeps inspection but removes insertion surfaces without write authority", () => {
    expect(resolveEditorHostContract(EDITOR_HOST_PROFILE, {
      mode: "freeform",
      canEdit: false,
      sourceBacked: false,
    }))
      .toEqual({
        capabilities: {
          ...EDITOR_HOST_PROFILE.capabilities,
          mutateContent: false,
        },
        surfaces: { inspector: "freeform", sidebar: null },
      });
  });

  it("keeps Slide navigation visible without write authority", () => {
    expect(resolveEditorHostContract(EDITOR_HOST_PROFILE, {
      mode: "slide",
      canEdit: false,
      sourceBacked: false,
    }))
      .toEqual({
        capabilities: {
          ...EDITOR_HOST_PROFILE.capabilities,
          mutateContent: false,
          collaborate: false,
        },
        surfaces: { inspector: "slide", sidebar: "slide" },
      });
  });

  it("makes source-backed Freeform observation-only without editor surfaces", () => {
    expect(resolveEditorHostContract(EDITOR_HOST_PROFILE, {
      mode: "freeform",
      canEdit: false,
      sourceBacked: true,
    }))
      .toEqual({
        capabilities: {
          ...EDITOR_HOST_PROFILE.capabilities,
          mutateContent: false,
          collaborate: false,
        },
        surfaces: { inspector: null, sidebar: null },
      });
  });

  it("keeps source-backed Slide navigation without an inspector", () => {
    expect(resolveEditorHostContract(EDITOR_HOST_PROFILE, {
      mode: "slide",
      canEdit: false,
      sourceBacked: true,
    }).surfaces).toEqual({ inspector: null, sidebar: "slide" });
  });
});
