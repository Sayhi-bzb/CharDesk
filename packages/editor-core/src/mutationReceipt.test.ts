import { expect, it } from "vitest";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry.js";

it("commits idempotent receipts and records a styled-space edit independently of glyph counts", () => {
  const d = new CanvasDocumentRegistry("d");
  try {
    const empty = d.beginHistoryCheckpoint("op-empty");
    d.applyCellPlanePatch({
      rows: [{ y: 0, erase: [{ from: 0, to: 0 }], spans: [] }],
    });
    expect(empty.commit()).toEqual({ changed: false });
    const write = d.beginHistoryCheckpoint("op-write");
    d.applyCellPlanePatch({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [{ x: 0, text: " ", color: "red", bgColor: "blue" }],
        },
      ],
    });
    expect(write.commit()).toEqual({ changed: true, operationId: "op-write" });
    expect(write.commit()).toEqual({ changed: true, operationId: "op-write" });
    const noChange = d.beginHistoryCheckpoint("op-same");
    d.applyCellPlanePatch({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [{ x: 0, text: " ", color: "red", bgColor: "blue" }],
        },
      ],
    });
    expect(noChange.commit()).toEqual({ changed: false });
    expect(d.undoOperation("op-write")).toBe(true);
  } finally {
    d.dispose();
  }
});

it("a cancelled checkpoint returns no committed mutation receipt", () => {
  const d = new CanvasDocumentRegistry("d");
  try {
    const c = d.beginHistoryCheckpoint("op-cancel");
    d.applyCellPlanePatch({
      rows: [{ y: 0, erase: [], spans: [{ x: 0, text: "X", color: "red" }] }],
    });
    c.cancel();
    expect(c.commit()).toEqual({ changed: false });
    expect(d.getContentReader().materialize().size).toBe(0);
  } finally {
    d.dispose();
  }
});

it("does not report a mutation made on a different page", () => {
  const d = new CanvasDocumentRegistry("d");
  try {
    d.ensurePage("d", {
      id: "other",
      kind: "cell-plane",
      name: "Other",
      grid: [],
    });
    const c = d.beginHistoryCheckpoint("op-main");
    d.applyCellPlanePatchAt(d.getDocumentAddress("d", "other")!, {
      rows: [{ y: 0, erase: [], spans: [{ x: 0, text: "X", color: "red" }] }],
    });
    expect(c.commit()).toEqual({ changed: false });
  } finally {
    d.dispose();
  }
});
