import { describe, expect, it } from "vitest";
import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import {
  resolveSessionDescriptorRuntime,
  resolveSessionDocumentRuntime,
} from "./storeUtils";

describe("session runtime projections", () => {
  it("resolves mode, tool, and viewport from the descriptor", () => {
    const session: CanvasSessionDescriptor = {
      id: "freeform-cached",
      name: "Freeform Cached",
      mode: "freeform",
      viewport: { offset: { x: 4, y: 5 }, zoom: 2 },
    };

    expect(resolveSessionDescriptorRuntime(session, "brush")).toEqual({
      nextMode: "freeform",
      nextTool: "brush",
      nextOffset: { x: 4, y: 5 },
      nextZoom: 2,
    });
  });

  it("does not attach a scene projection to CellPlane sessions", () => {
    const documents = new CanvasDocumentRegistry();
    const session: CanvasSessionDescriptor = {
      id: "freeform-cached",
      name: "Freeform Cached",
      mode: "freeform",
    };
    documents.activateDocument(session.id, {
      mode: "freeform",
      grid: [["2,3", { char: "C", color: "#111111" }]],
    });

    expect(resolveSessionDocumentRuntime(documents, session, "select")).toEqual({
      nextMode: "freeform",
      nextTool: "select",
      nextOffset: { x: 0, y: 0 },
      nextZoom: 1,
      nextSlideDeck: null,
    });
    documents.dispose();
  });
});
