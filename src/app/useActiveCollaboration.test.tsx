import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { testingCanvasRuntime, useEditorStore } from "@/domains/canvas/testing";
import {
  buildCollaborationUrl,
  CollaborationRuntimeProvider,
  type CollaborationDescriptorV6,
  type CollaborationRuntime,
} from "@/domains/collaboration/public";
import { useActiveCollaboration } from "./useActiveCollaboration";

const room = (
  roomId: string
): CollaborationDescriptorV6 => ({
  version: 6,
  documentVersion: 6,
  mode: "freeform",
  provider: "websocket",
  roomId,
  key: "room-key-1234567890123456789012345678901234567890",
  endpoint: "wss://sync.example.com",
});

describe("useActiveCollaboration", () => {
  const initialState = useEditorStore.getState();
  const setPresence = vi.fn();
  const runtime = {
    connect: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setPresence,
  } as unknown as CollaborationRuntime;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CollaborationRuntimeProvider runtime={runtime}>{children}</CollaborationRuntimeProvider>
  );

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useEditorStore.setState(initialState, true);
    window.history.replaceState(null, "", "/");
  });

  it("joins a valid incoming room once without clearing its URL", async () => {
    const incoming = room("incoming-room-1234567890");
    act(() => {
      useEditorStore.setState({
        activeCanvasId: "local-canvas",
        canvasMode: "freeform",
        canvasSessions: [
          {
            id: "local-canvas",
            name: "Local canvas",
            mode: "freeform",
          },
        ],
      });
      window.history.replaceState(null, "", buildCollaborationUrl(incoming));
    });

    renderHook(() => useActiveCollaboration(), { wrapper });

    await waitFor(() => {
      const state = useEditorStore.getState();
      expect(state.canvasSessions).toHaveLength(2);
      expect(state.canvasSessions.find((session) => session.id === state.activeCanvasId)?.collaboration)
        .toEqual(incoming);
    });
    await waitFor(() => {
      expect(runtime.connect).toHaveBeenCalledWith(incoming, expect.anything(), "guest");
    });
    expect(window.location.hash).toContain("room=");
  });

  it("keeps URL identity aligned while switching between local and shared canvases", async () => {
    const first = room("first-room-1234567890");
    const second = room("second-room-123456789");
    let firstId = "";
    let secondId = "";
    let localId = "";
    act(() => {
      testingCanvasRuntime.commands.sessions.create("freeform");
      firstId = useEditorStore.getState().activeCanvasId;
      testingCanvasRuntime.commands.sessions.setCollaboration(firstId, first);
      testingCanvasRuntime.commands.sessions.create("freeform");
      secondId = useEditorStore.getState().activeCanvasId;
      testingCanvasRuntime.commands.sessions.setCollaboration(secondId, second);
      testingCanvasRuntime.commands.sessions.create("freeform");
      localId = useEditorStore.getState().activeCanvasId;
      useEditorStore.setState({ activeCanvasId: firstId });
    });

    renderHook(() => useActiveCollaboration(), { wrapper });
    await waitFor(() => expect(window.location.href).toBe(buildCollaborationUrl(first)));
    await waitFor(() => expect(runtime.connect).toHaveBeenCalledWith(first, expect.anything(), "host"));

    act(() => useEditorStore.setState({ activeCanvasId: localId }));
    await waitFor(() => expect(window.location.hash).toBe(""));
    await waitFor(() => expect(runtime.disconnect).toHaveBeenCalled());

    act(() => useEditorStore.setState({ activeCanvasId: secondId }));
    await waitFor(() => expect(window.location.href).toBe(buildCollaborationUrl(second)));
    await waitFor(() => expect(runtime.connect).toHaveBeenCalledWith(second, expect.anything(), "host"));
  });

  it("preserves invalid incoming links until a collaboration choice supersedes them", async () => {
    act(() => {
      useEditorStore.setState({
        activeCanvasId: "local",
        canvasMode: "freeform",
        canvasSessions: [
          { id: "local", name: "Local", mode: "freeform" },
        ],
      });
      window.history.replaceState(null, "", "/#room=invalid");
    });

    renderHook(() => useActiveCollaboration(), { wrapper });
    await waitFor(() => expect(window.location.hash).toBe("#room=invalid"));

    const replacement = room("replacement-room-12345");
    act(() => {
      useEditorStore.setState((state) => ({
        canvasSessions: state.canvasSessions.map((session) =>
          session.mode === "freeform"
            ? { ...session, collaboration: replacement }
            : session
        ),
      }));
    });
    await waitFor(() => expect(window.location.href).toBe(buildCollaborationUrl(replacement)));
  });

  it("publishes discrete selection changes without cursor traffic", () => {
    const descriptor = room("presence-room-1234567890");
    act(() => {
      testingCanvasRuntime.commands.sessions.create("freeform");
      const canvasId = useEditorStore.getState().activeCanvasId;
      testingCanvasRuntime.commands.sessions.setCollaboration(canvasId, descriptor);
    });

    const view = renderHook(() => useActiveCollaboration(), { wrapper });
    setPresence.mockClear();

    act(() => testingCanvasRuntime.commands.staticGrid.setSelectionRange({
      start: { x: 2, y: 3 },
      end: { x: 5, y: 4 },
    }));
    expect(setPresence).toHaveBeenCalledTimes(1);
    expect(setPresence).toHaveBeenLastCalledWith(expect.objectContaining({
      selection: expect.objectContaining({
        mode: "freeform",
        areas: [{ start: { x: 2, y: 3 }, end: { x: 5, y: 3 } }, { start: { x: 2, y: 4 }, end: { x: 5, y: 4 } }],
      }),
    }));
    expect(setPresence.mock.calls[0]?.[0]).not.toHaveProperty("cursor");

    view.unmount();
  });
});
