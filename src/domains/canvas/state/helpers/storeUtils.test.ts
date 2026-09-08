import { describe, expect, it } from "vitest";
import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { StructuredNode } from "@/domains/structured-content/public";
import { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import {
  resolveSessionDescriptorRuntime,
  resolveSessionDocumentRuntime,
} from "./storeUtils";

const textNode: StructuredNode = {
  id: "text-1",
  type: "text",
  order: 1,
  position: { x: 2, y: 3 },
  text: "Cached",
  style: { color: "#111111" },
};

describe("session runtime projections", () => {
  it("resolves mode, tool, and viewport from the descriptor only", () => {
    const session: CanvasSessionDescriptor = {
      id: "structured-cached",
      name: "Structured Cached",
      mode: "structured",
      viewport: { offset: { x: 4, y: 5 }, zoom: 2 },
    };

    expect(resolveSessionDescriptorRuntime(session, "brush")).toEqual({
      nextMode: "structured",
      nextTool: "select",
      nextOffset: { x: 4, y: 5 },
      nextZoom: 2,
    });
  });

  it("reads structured content from the document registry", () => {
    const documents = new CanvasDocumentRegistry();
    const session: CanvasSessionDescriptor = {
      id: "structured-cached",
      name: "Structured Cached",
      mode: "structured",
    };
    documents.activateDocument(session.id, {
      mode: "structured",
      grid: [],
      scene: [textNode],
      components: [],
    });

    const runtime = resolveSessionDocumentRuntime(documents, session, "select");

    expect(runtime.nextScene).toEqual([textNode]);
    expect(runtime.nextComponents).toEqual([]);
    expect(runtime.nextSlideDeck).toBeNull();
    documents.dispose();
  });
});
