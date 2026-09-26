import { describe, expect, it } from "vitest";
import { createSlideDeck } from "@/domains/slides/public";
import {
  getCanvasSessionRestoreRecord,
  isSourceBackedCanvasSession,
  type SlideCanvasSessionSnapshot,
} from "./model";

const slideSession = (sourceId?: string): SlideCanvasSessionSnapshot => ({
  id: "deck",
  name: "Deck",
  mode: "slide",
  slideDeck: createSlideDeck({ initialSlideId: "slide-1" }),
  ...(sourceId ? {
    sourceBinding: { kind: "blackboard" as const, provider: "browser-workspace" as const, id: sourceId },
  } : {}),
  grid: [],
});

describe("isSourceBackedCanvasSession", () => {
  it("distinguishes attached projections from detached editable sessions", () => {
    expect(isSourceBackedCanvasSession({
      id: "board",
      name: "Board",
      mode: "freeform",
      sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "workspace-1" },
      grid: [],
    })).toBe(true);
    expect(isSourceBackedCanvasSession(slideSession("workspace-1"))).toBe(true);
    expect(isSourceBackedCanvasSession(slideSession())).toBe(false);
  });
});

describe("session restore records", () => {
  it("separates the runtime descriptor from fallback content", () => {
    const snapshot = slideSession("workspace-1");

    const record = getCanvasSessionRestoreRecord(snapshot);

    expect(record.descriptor).toEqual({
      id: "deck",
      name: "Deck",
      mode: "slide",
      sourceBinding: {
        kind: "blackboard",
        provider: "browser-workspace",
        id: "workspace-1",
      },
    });
    expect(record.descriptor).not.toHaveProperty("slideDeck");
    expect(record.fallbackSnapshot).toEqual({
      mode: "slide",
      slideDeck: snapshot.slideDeck,
    });
  });
});
