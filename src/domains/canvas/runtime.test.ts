import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { parseDocumentSessionSource } from "@/domains/document/public";
import type { CollaborationDescriptorV6 } from "@/domains/collaboration/public";
import type { CanvasSessionSnapshot } from "@/domains/sessions/public";
import { createCanvasRuntime, type CanvasRuntime } from "./runtime";
import { CanvasDocumentRegistry } from "./state/CanvasDocumentRegistry";

const sessions: CanvasSessionSnapshot[] = [
  {
    id: "canvas-a",
    name: "Alpha",
    mode: "freeform",
    scene: [],
    components: [],
    grid: [["0,0", { char: "A", color: "#111111" }]],
  },
  {
    id: "canvas-b",
    name: "Beta",
    mode: "freeform",
    scene: [],
    components: [],
    grid: [["0,0", { char: "B", color: "#222222" }]],
  },
  {
    id: "canvas-structured",
    name: "Structure",
    mode: "structured",
    scene: [{
      id: "text-1",
      type: "text",
      order: 1,
      position: { x: 2, y: 3 },
      text: "Node",
      style: { color: "#333333" },
    }],
    components: [],
    grid: [],
  },
  {
    id: "canvas-slides",
    name: "Deck",
    mode: "slide",
    scene: [],
    components: [],
    grid: [],
    slideDeck: {
      activeSlideId: "slide-1",
      slides: [{
        id: "slide-1",
        name: "Slide 1",
        size: { columns: 80, rows: 24 },
        grid: [["1,1", { char: "S", color: "#444444" }]],
      }],
    },
  },
  {
    id: "canvas-blackboard",
    name: "Board",
    mode: "freeform",
    sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "workspace-a" },
    scene: [],
    components: [],
    grid: [],
  },
];

const createTestRuntime = (initialSessions: CanvasSessionSnapshot[] = sessions) => {
  const documents = new CanvasDocumentRegistry();
  return createCanvasRuntime({
    documents,
    persistence: false,
    initialSessions,
    parseSessionSource: parseDocumentSessionSource,
    selectionCommands: createSelectionCommandFactory({
      getActiveDocumentId: documents.getActiveDocumentId,
      renderClipboardText: async () => ({
        kind: "spans",
        renderer: "raw",
        pipeline: [],
        rows: [],
        width: 0,
        height: 0,
        diagnostics: [],
      }),
    }),
  });
};

describe("CanvasRuntime command boundary", () => {
  it("exposes data snapshots while commands own interaction mutations", () => {
    const runtime = createTestRuntime();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    try {
      expect(runtime.getState()).not.toHaveProperty("setTool");
      expect(runtime.getState()).not.toHaveProperty("setTextCursor");

      runtime.commands.tools.set("pan");

      expect(runtime.getState().tool).toBe("pan");
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
      runtime.dispose();
    }
  });
});

describe("CanvasRuntime.materializeSession", () => {
  let runtime: CanvasRuntime | null = null;

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
  });

  it("reads an inactive session without activating it", async () => {
    runtime = createCanvasRuntime({
      persistence: false,
      initialSessions: sessions,
      parseSessionSource: parseDocumentSessionSource,
      selectionCommands: createSelectionCommandFactory({
        getActiveDocumentId: () => runtime!.documents.getActiveDocumentId(),
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
    });
    runtime.commands.sessions.switch("canvas-b");
    expect(runtime.getState()).not.toHaveProperty("offset");
    expect(runtime.getState()).not.toHaveProperty("zoom");
    expect(runtime.getState()).not.toHaveProperty("textCursor");
    expect(runtime.getState()).toHaveProperty("interaction.textCursor", null);
    const activeCanvasId = runtime.getState().activeCanvasId;
    const viewport = runtime.viewport.getSnapshot();

    const materialized = await runtime.materializeSession("canvas-a");

    expect(materialized?.name).toBe("Alpha");
    expect(materialized?.surface.getCell({ x: 0, y: 0 })?.char).toBe("A");
    expect(runtime.getState().activeCanvasId).toBe(activeCanvasId);
    expect(runtime.viewport.getSnapshot()).toEqual(viewport);
  });

  it("returns null for an unknown session", async () => {
    runtime = createCanvasRuntime({
      persistence: false,
      initialSessions: sessions,
      parseSessionSource: parseDocumentSessionSource,
      selectionCommands: createSelectionCommandFactory({
        getActiveDocumentId: () => runtime!.documents.getActiveDocumentId(),
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
    });

    await expect(runtime.materializeSession("missing")).resolves.toBeNull();
  });

  it("materializes the derived Blackboard surface instead of its empty shell", async () => {
    runtime = createCanvasRuntime({
      persistence: false,
      initialSessions: sessions,
      parseSessionSource: parseDocumentSessionSource,
      selectionCommands: createSelectionCommandFactory({
        getActiveDocumentId: () => runtime!.documents.getActiveDocumentId(),
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
    });

    runtime.commands.sessions.applySourceProjection(
      "canvas-blackboard",
      {
        mode: "freeform",
        grid: [["3,2", { char: "B", color: "#111111" }]],
        scene: [],
        components: [],
      },
    );

    const materialized = await runtime.materializeSession("canvas-blackboard");
    expect(materialized?.surface.getCell({ x: 3, y: 2 })?.char).toBe("B");
    expect(runtime.documents.getDocumentSeed("canvas-blackboard", "freeform")?.grid)
      .toEqual([]);
  });

  it("materializes structured projections and complete slide decks", async () => {
    runtime = createCanvasRuntime({
      persistence: false,
      initialSessions: sessions,
      parseSessionSource: parseDocumentSessionSource,
      selectionCommands: createSelectionCommandFactory({
        getActiveDocumentId: () => runtime!.documents.getActiveDocumentId(),
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
    });

    const structured = await runtime.materializeSession("canvas-structured");
    const slides = await runtime.materializeSession("canvas-slides");

    expect(structured?.structuredScene).toHaveLength(1);
    expect(structured?.surface.getCell({ x: 2, y: 3 })?.char).toBe("N");
    expect(slides?.slideDeck?.slides[0].grid).toEqual([
      ["1,1", { char: "S", color: "#444444" }],
    ]);
    expect(slides?.surface.getCell({ x: 1, y: 1 })?.char).toBe("S");
  });
});

describe("CanvasRuntime collaboration", () => {
  const createRuntime = (initialSessions: CanvasSessionSnapshot[]) => {
    const documents = new CanvasDocumentRegistry();
    return createCanvasRuntime({
      documents,
      persistence: false,
      initialSessions,
      parseSessionSource: parseDocumentSessionSource,
      selectionCommands: createSelectionCommandFactory({
        getActiveDocumentId: documents.getActiveDocumentId,
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
    });
  };

  it("shows the host's existing content when a fresh local session joins the room", () => {
    const host = createRuntime([{
      id: "host-session",
      name: "Host",
      mode: "freeform",
      scene: [],
      components: [],
      grid: [["0,0", { char: "H", color: "#111111" }]],
    }]);
    const guest = createRuntime([{
      id: "guest-local-session",
      name: "Guest local",
      mode: "freeform",
      scene: [],
      components: [],
      grid: [],
    }]);
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
      endpoint: "wss://sync.example.com",
    };

    try {
      host.commands.sessions.setCollaboration("host-session", descriptor);
      guest.commands.sessions.joinCollaboration(descriptor);

      const guestSessionId = guest.getState().activeCanvasId;
      expect(host.getState().canvasSessions[0].collaborationRole).toBe("host");
      expect(
        guest.getState().canvasSessions.find(({ id }) => id === guestSessionId)
          ?.collaborationRole
      ).toBe("guest");
      const hostDocument = host.documents.getCollaborationDocument("host-session")!;
      const guestDocument = guest.documents.getCollaborationDocument(guestSessionId)!;
      const sharedPageId = `collaboration:${descriptor.roomId}:page:main`;

      expect(host.documents.getPageDescriptors("host-session").map(({ id }) => id))
        .toEqual([sharedPageId]);
      expect(guest.documents.getPageDescriptors(guestSessionId).map(({ id }) => id))
        .toEqual([sharedPageId]);
      expect(host.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("H");

      Y.applyUpdate(guestDocument, Y.encodeStateAsUpdate(hostDocument));

      expect(guest.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("H");

      guest.commands.grid.replace([
        ...guest.getState().contentSurface.reader.materialize().entries(),
        ["1,0", { char: "G", color: "#222222" }],
      ]);
      Y.applyUpdate(hostDocument, Y.encodeStateAsUpdate(guestDocument));

      expect(
        guest.documents
          .getPageDescriptors(guestSessionId)
          .map(({ id }) => id)
      ).toEqual([sharedPageId]);
      expect(host.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("H");
      expect(host.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("G");
    } finally {
      host.dispose();
      guest.dispose();
    }
  });

  it("shares one structured page across different local session ids", () => {
    const hostNode = {
      id: "host-node",
      type: "text" as const,
      order: 1,
      position: { x: 2, y: 3 },
      text: "Host",
      style: { color: "#333333" },
    };
    const host = createRuntime([{
      id: "structured-host-session",
      name: "Structured host",
      mode: "structured",
      scene: [hostNode],
      components: [],
      grid: [],
    }]);
    const guest = createRuntime([{
      id: "structured-guest-local",
      name: "Structured guest local",
      mode: "structured",
      scene: [],
      components: [],
      grid: [],
    }]);
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: "structured",
      provider: "websocket",
      roomId: "structured-room-1234",
      key: "structured-room-key-1234567890123456789012345678901234",
      endpoint: "wss://sync.example.com",
    };

    try {
      host.commands.sessions.setCollaboration("structured-host-session", descriptor);
      guest.commands.sessions.joinCollaboration(descriptor);

      const guestSessionId = guest.getState().activeCanvasId;
      const hostDocument = host.documents.getCollaborationDocument(
        "structured-host-session"
      )!;
      const guestDocument = guest.documents.getCollaborationDocument(guestSessionId)!;
      Y.applyUpdate(guestDocument, Y.encodeStateAsUpdate(hostDocument));

      expect(guest.getState().structuredScene).toEqual([hostNode]);
      const guestNode = {
        ...hostNode,
        id: "guest-node",
        position: { x: 4, y: 5 },
        text: "Guest",
      };
      guest.commands.structured.applyScene([hostNode, guestNode]);
      Y.applyUpdate(hostDocument, Y.encodeStateAsUpdate(guestDocument));

      expect(host.getState().structuredScene).toEqual([hostNode, guestNode]);
      expect(host.documents.getPageDescriptors("structured-host-session"))
        .toEqual(guest.documents.getPageDescriptors(guestSessionId));
    } finally {
      host.dispose();
      guest.dispose();
    }
  });
});
