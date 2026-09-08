import { describe, expect, it } from "vitest";
import {
  CANVAS_COLLABORATION_CHANNELS,
  decodeCollaborativeStructuredComponent,
  decodeCollaborativeStructuredNode,
} from "./collaborationSchema";
import { rebuildContentSurface, rebuildSceneFromYMap } from "./helpers/gridHelpers";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { isCellPlaneOperation } from "../cell-plane/model";

describe("canvas collaboration schema", () => {
  it("declares durable document channels separately from presence", () => {
    expect(CANVAS_COLLABORATION_CHANNELS.pages.scope).toBe("document");
    expect(CANVAS_COLLABORATION_CHANNELS.content.scope).toBe("page");
    expect(CANVAS_COLLABORATION_CHANNELS.scene.scope).toBe("page");
    expect(CANVAS_COLLABORATION_CHANNELS.presence.scope).toBe("presence");
  });

  it("accepts valid CellPlane operations and rejects malformed values", () => {
    expect(isCellPlaneOperation({
      id: "operation-a",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      rows: [{
        y: 0,
        erase: [],
        spans: [{ x: 0, text: "A", color: "#fff" }],
      }],
    })).toBe(true);
    expect(isCellPlaneOperation({ id: "broken", rows: [] })).toBe(false);
  });

  it("rejects structured records whose id does not match their Y.Map key", () => {
    expect(
      decodeCollaborativeStructuredNode("node-a", {
        id: "node-b",
        type: "text",
        order: 1,
        position: { x: 0, y: 0 },
        text: "hello",
        style: { color: "#fff" },
      })
    ).toMatchObject({ ok: false, issue: { channel: "structured-scene", key: "node-a" } });
  });

  it("clones valid component collections and rejects malformed roles", () => {
    const source = {
      id: "component-a",
      templateId: "card",
      label: "Card",
      atomIds: ["node-a"],
      roles: { title: ["node-a"] },
    };
    const result = decodeCollaborativeStructuredComponent("component-a", source);
    expect(result).toEqual({ ok: true, value: source });
    expect(result.ok && result.value).not.toBe(source);
    expect(
      decodeCollaborativeStructuredComponent("component-a", { ...source, roles: { title: [1] } })
    ).toMatchObject({ ok: false });
  });

  it("keeps invalid remote records out of the editor projection", () => {
    const id = `invalid-collaboration-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    documents.yCellPlaneOperations.push([{ id: "broken" } as never]);
    documents.yStructuredScene.set("node-a", { id: "node-b" } as never);
    const pageId = documents.getActivePageId();

    expect(rebuildContentSurface(documents).reader.materialize()).toEqual(new Map());
    expect(rebuildSceneFromYMap(documents)).toEqual([]);
    expect(documents.getIntegrityIssues()).toEqual([
      {
        channel: "cell-plane-operations",
        key: "0",
        pageId,
        reason: "Invalid CellPlane operation",
      },
      {
        channel: "structured-scene",
        key: "node-a",
        pageId,
        reason: "Invalid structured node",
      },
    ]);
    documents.dispose();
  });
});
