import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataSecurityDialog } from "./data-security-dialog";
import {
  canvasCommands,
  testingCanvasRuntime,
  useEditorStore,
} from "@/domains/canvas/testing";

describe("DataSecurityDialog", () => {
  it("states the local-first data boundary without overstating offline support", () => {
    render(<DataSecurityDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Data security" });
    expect(dialog).toHaveTextContent("Stored here");
    expect(dialog).toHaveTextContent("No analytics");
    expect(dialog).toHaveTextContent("Local transfers");
    expect(dialog).toHaveTextContent("Local storage is not encrypted");
    expect(dialog).not.toHaveTextContent("offline");
    expect(dialog).not.toHaveTextContent("URL");
    expect(dialog.querySelectorAll("h3")).toHaveLength(0);
    expect(dialog.querySelector('[class*="bg-accent/"]')).not.toBeInTheDocument();
    expect(dialog.querySelector(".border-accent")).not.toBeInTheDocument();
  });

  it("replaces local-only claims with the active sync-server data boundary", () => {
    const state = useEditorStore.getState();
    canvasCommands.sessions.setCollaboration(state.activeCanvasId, {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "room_identifier_1234",
      key: "room_secret_key_123456789012345678901234567890",
      endpoint: "wss://sync.example.com",
    });

    render(<DataSecurityDialog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Data security" });
    expect(dialog).toHaveTextContent("Sync server");
    expect(dialog).toHaveTextContent("Updates pass through the WebSocket server");
    expect(dialog).toHaveTextContent("Anyone with the edit link can edit");
    expect(dialog).not.toHaveTextContent("No analytics");

    canvasCommands.sessions.setCollaboration(state.activeCanvasId, null);
  });

  it("describes the encrypted relay boundary for V7 rooms", () => {
    const state = useEditorStore.getState();
    canvasCommands.sessions.setCollaboration(state.activeCanvasId, {
      version: 7,
      documentVersion: 6,
      mode: "freeform",
      provider: "encrypted-relay",
      roomId: "room_identifier_1234",
      key: "room_secret_key_123456789012345678901234567890",
    });

    render(<DataSecurityDialog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Data security" });
    expect(dialog).toHaveTextContent("Encrypted relay");
    expect(dialog).toHaveTextContent("encrypted in this browser");
    expect(dialog).toHaveTextContent("stores no room content");
    expect(dialog).not.toHaveTextContent("may retain data");

    canvasCommands.sessions.setCollaboration(state.activeCanvasId, null);
  });

  it("shows the concrete persistence failure alongside recovery guidance", () => {
    const getSnapshot = testingCanvasRuntime.getPersistenceSnapshot;
    const failure = {
      phase: "degraded",
      save: "error",
      coordination: "coordinator",
      error: "Canvas document has no valid pages: canvas-1",
    } as const;
    Object.assign(testingCanvasRuntime, {
      getPersistenceSnapshot: () => failure,
    });
    try {
      render(<DataSecurityDialog open onOpenChange={vi.fn()} />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Canvas changes are only in memory");
      expect(alert).toHaveTextContent(
        "Canvas document has no valid pages: canvas-1"
      );
    } finally {
      Object.assign(testingCanvasRuntime, { getPersistenceSnapshot: getSnapshot });
    }
  });
});
