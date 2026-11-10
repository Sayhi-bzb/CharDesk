import { expect, it } from "vitest";
import { CanvasHistoryJournal } from "./CanvasHistoryJournal.js";
const action = {
  forward: { kind: "page-delete", documentId: "d", pageId: "p" },
  inverse: { kind: "page-delete", documentId: "d", pageId: "q" },
} as const;

it("tracks actual captured mutations even when undo storage cannot retain the action", () => {
  const journal = new CanvasHistoryJournal({ maxBytes: 1, apply: () => {} });
  journal.beginCapture("d", "op-too-large");
  const before = journal.getMutationVersion("d");
  journal.capture("d", action, "save");
  expect(journal.getMutationVersion("d")).toBeGreaterThan(before);
  expect(journal.getLatestOperationId("d")).toBeUndefined();
  expect(journal.undoOperation("op-too-large", "d")).toBe(false);
});

it("keeps mutation revisions monotonic across undo and redo", () => {
  const journal = new CanvasHistoryJournal({ apply: () => {} });
  journal.beginCapture("d", "op-edit");
  journal.capture("d", action, "save");
  const written = journal.getMutationVersion("d");
  expect(journal.getLatestOperationId("d")).toBe("op-edit");
  expect(journal.undo("d")).toBe(true);
  const undone = journal.getMutationVersion("d");
  expect(undone).toBeGreaterThan(written);
  expect(journal.getLatestOperationId("d")).toBeUndefined();
  expect(journal.redo("d")).toBe(true);
  expect(journal.getMutationVersion("d")).toBeGreaterThan(undone);
});
