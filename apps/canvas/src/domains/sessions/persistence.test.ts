import { describe, expect, it } from "vitest";
import {
  EDITOR_PERSISTENCE_KEY,
  EDITOR_PERSISTENCE_VERSION,
  LEGACY_EDITOR_PERSISTENCE_KEY,
  UnsupportedEditorPersistenceVersionError,
  flattenPersistedEditorState,
  isPersistedEditorStateV7 as isPersistedEditorStateV6,
  migrateLegacyEditorPersistence,
  migratePersistedStateToV7 as migratePersistedStateToV6,
} from "./public";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
};

describe("editor persistence v7", () => {
  it("supports only the current and previous persistence versions", () => {
    expect(() => migratePersistedStateToV6({}, 3)).toThrow(
      UnsupportedEditorPersistenceVersionError,
    );
    expect(migratePersistedStateToV6({}, 4).schemaVersion).toBe(7);
    expect(migratePersistedStateToV6({}, 5).schemaVersion).toBe(7);
    expect(migratePersistedStateToV6({}, 6).schemaVersion).toBe(7);
  });

  it("migrates legacy viewport pixels once while preserving zoom and x", () => {
    const migrated = migratePersistedStateToV6({
      workspace: {
        offset: { x: 12.5, y: -38 },
        zoom: 1.5,
        canvasMode: "freeform",
      },
      sessions: {
        activeId: "canvas",
        items: [{
          id: "canvas",
          name: "Canvas",
          mode: "freeform",
          scene: [],
          grid: [],
          viewport: { offset: { x: -7, y: 9.5 }, zoom: 2 },
        }],
      },
    }, 5);

    expect(migrated.workspace.offset.x).toBe(12.5);
    expect(migrated.workspace.offset.y).toBe(-40);
    expect(migrated.workspace.zoom).toBe(1.5);
    expect(migrated.sessions.items[0].viewport).toEqual({
      offset: { x: -7, y: 10 },
      zoom: 2,
    });
    expect(migratePersistedStateToV6(migrated, 7)).toEqual(migrated);
  });

  it("defaults the grid off while preserving an explicit preference", () => {
    const defaults = migratePersistedStateToV6({}).preferences;
    expect(defaults.showGrid).toBe(false);
    expect(
      migratePersistedStateToV6({ preferences: { showGrid: true } }).preferences
        .showGrid
    ).toBe(true);
  });

  it("preserves an independent background default and falls back to foreground", () => {
    const explicit = migratePersistedStateToV6({
      preferences: {
        brushColor: "#112233",
        brushBackgroundColor: "#445566",
      },
    });
    expect(explicit.preferences.brushBackgroundColor).toBe("#445566");

    const legacy = migratePersistedStateToV6({
      preferences: { brushColor: "#112233" },
    });
    expect(legacy.preferences.brushBackgroundColor).toBe("#112233");
  });

  it("migrates the legacy brand key and removes it only after validation", () => {
    const storage = createMemoryStorage();
    storage.setItem(LEGACY_EDITOR_PERSISTENCE_KEY, JSON.stringify({
      version: 4,
      state: {
        workspace: { canvasMode: "freeform" },
        sessions: {
          activeId: "legacy",
          items: [{
            id: "legacy",
            name: "Legacy",
            mode: "freeform",
            scene: [],
            grid: [["0,0", { char: "A", color: "#fff" }]],
            viewport: { offset: { x: 4, y: 19 }, zoom: 1 },
          }],
        },
      },
    }));

    expect(migrateLegacyEditorPersistence(storage)).toBe(true);
    expect(storage.getItem(LEGACY_EDITOR_PERSISTENCE_KEY)).toBeNull();
    const current = JSON.parse(storage.getItem(EDITOR_PERSISTENCE_KEY)!);
    expect(current.version).toBe(EDITOR_PERSISTENCE_VERSION);
    expect(isPersistedEditorStateV6(current.state)).toBe(true);
    expect(current.state.sessions.items[0].grid).toEqual([
      ["0,0", { char: "A", color: "#fff" }],
    ]);
    expect(current.state.sessions.items[0].viewport).toEqual({
      offset: { x: 4, y: 20 },
      zoom: 1,
    });
  });

  it("preserves malformed legacy data when it cannot be migrated", () => {
    const storage = createMemoryStorage();
    storage.setItem(LEGACY_EDITOR_PERSISTENCE_KEY, "not-json");

    expect(migrateLegacyEditorPersistence(storage)).toBe(false);
    expect(storage.getItem(LEGACY_EDITOR_PERSISTENCE_KEY)).toBe("not-json");
    expect(storage.getItem(EDITOR_PERSISTENCE_KEY)).toBeNull();
  });

  it("drops legacy animation sessions and keeps static sessions", () => {
    const migrated = migratePersistedStateToV6({
      schemaVersion: 2,
      workspace: { canvasMode: "animation" },
      sessions: {
        activeId: "old-animation",
        items: [
          { id: "old-animation", name: "Old", mode: "animation", scene: [], grid: [] },
          { id: "static", name: "Static", mode: "freeform", scene: [], grid: [] },
        ],
      },
    });
    expect(migrated.schemaVersion).toBe(EDITOR_PERSISTENCE_VERSION);
    expect(migrated.sessions.items.map((session) => session.id)).toEqual(["static"]);
    expect(migrated.sessions.activeId).toBe("static");
    expect(isPersistedEditorStateV6(migrated)).toBe(true);
  });

  it("migrates legacy Blackboard ownership without preserving a second mode", () => {
    const migrated = migratePersistedStateToV6({
      workspace: { canvasMode: "blackboard" },
      sessions: {
        activeId: "board",
        items: [{
          id: "board",
          name: "Board",
          mode: "blackboard",
          workspaceId: "workspace-1",
          scene: [],
          grid: [],
        }],
      },
    });

    expect(migrated.workspace.canvasMode).toBe("freeform");
    expect(migrated.sessions.items[0]).toMatchObject({
      mode: "freeform",
      sourceBinding: {
        kind: "blackboard",
        provider: "browser-workspace",
        id: "workspace-1",
      },
    });
  });

  it("creates a blank freeform session when no static session remains", () => {
    const migrated = migratePersistedStateToV6({
      sessions: {
        activeId: "old-animation",
        items: [{ id: "old-animation", name: "Old", mode: "animation", scene: [], grid: [] }],
      },
    });
    expect(flattenPersistedEditorState(migrated)).toMatchObject({
      canvasMode: "freeform",
      activeCanvasId: "canvas-1",
      canvasSessions: [{ id: "canvas-1", mode: "freeform", grid: [] }],
    });
  });
  it("preserves and normalizes slide sessions in v4", () => {
    const migrated = migratePersistedStateToV6({
      schemaVersion: 4,
      workspace: { canvasMode: "slide" },
      sessions: {
        activeId: "deck",
        items: [{
          id: "deck",
          name: "Slides",
          mode: "slide",
          scene: [],
          grid: [],
          slideDeck: {
            size: { columns: 2, rows: 1 },
            activeSlideId: "slide-1",
            slides: [{
              id: "slide-1",
              name: "Slide 1",
              grid: [
                ["0,0", { char: "A", color: "#fff" }],
                ["2,0", { char: "B", color: "#fff" }],
              ],
            }],
          },
        }],
      },
    });

    expect(flattenPersistedEditorState(migrated)).toMatchObject({
      canvasMode: "slide",
      activeCanvasId: "deck",
      canvasSessions: [{
        id: "deck",
        mode: "slide",
        slideDeck: {
          activeSlideId: "slide-1",
          slides: [
            {
              size: { columns: 2, rows: 1 },
              grid: [["0,0", { char: "A", color: "#fff" }]],
            },
          ],
        },
      }],
    });
  });

  it("keeps V1 session content but drops its unsupported room descriptor", () => {
    const migrated = migratePersistedStateToV6({
      schemaVersion: 4,
      sessions: {
        activeId: "legacy-room",
        items: [
          {
            id: "legacy-room",
            name: "Legacy room",
            mode: "freeform",
            scene: [],
            components: [],
            grid: [["0,0", { char: "A", color: "#fff" }]],
            collaboration: {
              version: 1,
              provider: "p2p",
              roomId: "room-id-1234567890",
              key: "room-key-1234567890123456789012345678901234567890",
            },
          },
        ],
      },
    });

    expect(migrated.sessions.items[0]).toMatchObject({
      id: "legacy-room",
      grid: [["0,0", { char: "A", color: "#fff" }]],
    });
    expect(migrated.sessions.items[0].collaboration).toBeUndefined();
  });

  it("uses session content when a legacy workspace omits its payload", () => {
    const migrated = migratePersistedStateToV6({
      workspace: { canvasMode: "freeform" },
      sessions: {
        activeId: "canvas",
        items: [{
          id: "canvas",
          name: "Canvas",
          mode: "freeform",
          scene: [],
          grid: [["0,0", { char: "A", color: "#fff" }]],
        }],
      },
    });

    expect(migrated.workspace.grid).toEqual([
      ["0,0", { char: "A", color: "#fff" }],
    ]);
  });

  it("keeps only supported V6 room descriptors", () => {
    const base = {
      mode: "freeform",
      provider: "p2p",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
    } as const;
    const migrated = migratePersistedStateToV6({
      sessions: {
        activeId: "legacy-room",
        items: [
          {
            id: "legacy-room",
            name: "Legacy room",
            mode: "freeform",
            scene: [],
            grid: [],
            collaboration: { ...base, version: 4, documentVersion: 4 },
          },
          {
            id: "current-room",
            name: "Current room",
            mode: "freeform",
            scene: [],
            grid: [],
            collaboration: { ...base, version: 5, documentVersion: 5 },
          },
          {
            id: "v6-room",
            name: "V6 room",
            mode: "freeform",
            scene: [],
            grid: [],
            collaboration: { ...base, version: 6, documentVersion: 6 },
          },
          {
            id: "websocket-room",
            name: "WebSocket room",
            mode: "freeform",
            scene: [],
            grid: [],
            collaboration: {
              ...base,
              version: 6,
              documentVersion: 6,
              provider: "websocket",
              endpoint: "wss://sync.example.com",
            },
          },
        ],
      },
    });

    expect(migrated.sessions.items.map((session) => session.collaboration?.version))
      .toEqual([undefined, undefined, undefined, 6]);
  });
});
