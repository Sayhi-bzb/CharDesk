import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollaborationRuntimeProvider,
  type CollaborationRuntime,
  type CollaborationSnapshot,
} from "@/domains/collaboration/public";
import { setUiLanguage } from "@/shared/i18n";
import { CollaborationJoiningOverlay } from "./CollaborationJoiningOverlay";

let snapshot: CollaborationSnapshot = {
  descriptor: null,
  documentStatus: "joining",
  connectionStatus: "connecting",
  canEdit: false,
  peers: [],
  error: null,
  errorKind: null,
  hasLocalCopy: false,
  integrityIssues: [],
};

vi.mock("./useCollaborationSnapshot", () => ({
  useCollaborationSnapshot: () => snapshot,
}));

describe("CollaborationJoiningOverlay", () => {
  const retry = vi.fn();
  const runtime = { retry } as unknown as CollaborationRuntime;
  const renderOverlay = () => render(
    <CollaborationRuntimeProvider runtime={runtime}>
      <CollaborationJoiningOverlay />
    </CollaborationRuntimeProvider>
  );

  afterEach(() => {
    cleanup();
    retry.mockReset();
  });

  it("blocks the canvas while a fresh guest waits for remote state", () => {
    setUiLanguage("en");
    snapshot = { ...snapshot, documentStatus: "joining", connectionStatus: "connecting" };
    renderOverlay();

    expect(screen.getByTestId("collaboration-joining")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Connecting to sync server")).toBeInTheDocument();
  });

  it("distinguishes transport connection from the document-peer handshake", () => {
    setUiLanguage("en");
    snapshot = { ...snapshot, documentStatus: "joining", connectionStatus: "online" };
    renderOverlay();

    expect(screen.getByText("Waiting for someone with this canvas")).toBeInTheDocument();
  });

  it("offers an in-place retry when the sync server is unavailable", () => {
    setUiLanguage("en");
    snapshot = { ...snapshot, documentStatus: "joining", connectionStatus: "offline" };
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
