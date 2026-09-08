import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { useEditorStore } from "@/domains/canvas/testing";
import { createPersistedEditorSnapshot } from "./editorPersistence";
import type { CollaborationDescriptorV6 } from "@/domains/collaboration/public";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";

const initialState = useEditorStore.getState();

describe("collaborative session persistence", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
  });

  it("persists only the session shell, never a collaborative content snapshot", () => {
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
      endpoint: "wss://sync.example.com",
    };
    useEditorStore.setState({
      activeCanvasId: "room-session",
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([["0,0", { char: "A", color: "#fff" }]]),
      structuredScene: [],
      structuredComponents: [],
      brushBackgroundColor: "#445566",
      canvasSessions: [
        {
          id: "room-session",
          name: "Room",
          mode: "freeform",
          collaboration: descriptor,
          collaborationRole: "guest",
        },
      ],
    });

    const documents = new CanvasDocumentRegistry("room-session");
    const persisted = createPersistedEditorSnapshot(
      useEditorStore.getState(),
      documents
    ) as unknown as {
      workspace: { grid: unknown[]; structuredScene: unknown[] };
      sessions: {
        items: Array<{ grid: unknown[]; scene: unknown[]; collaborationRole?: string }>;
      };
      preferences: { brushBackgroundColor: string };
    };

    expect(persisted.workspace.grid).toEqual([]);
    expect(persisted.workspace.structuredScene).toEqual([]);
    expect(persisted.sessions.items[0]).toMatchObject({
      grid: [],
      scene: [],
      collaborationRole: "guest",
    });
    expect(persisted.preferences.brushBackgroundColor).toBe("#445566");
    documents.dispose();
  });
});
