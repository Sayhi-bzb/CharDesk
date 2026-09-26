// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { showStartupFatalFailure, showStartupMigrationFailure, showStartupPhase } from "./startupDom";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<div id="root"><main class="startup-shell" data-startup-phase="opening" aria-busy="true">
    <div class="startup-content"><div class="startup-brand">CharDesk</div>
    <h1 class="startup-title" role="status" aria-live="polite">Opening Canvas</h1>
    <div class="startup-progress" aria-hidden="true"></div></div></main></div>`;
});

describe("pre-React startup presentation", () => {
  it("updates the same shell through transfer and module loading", () => {
    showStartupPhase("transferring");
    expect(screen.getByRole("status")).toHaveTextContent("Checking your old workspace");
    showStartupPhase("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Canvas");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  it("keeps recovery actions in the shell and restores loading after continuing", () => {
    const proceed = vi.fn();
    showStartupMigrationFailure(new Error("Old origin unavailable"), {
      recoverHref: "https://chardesk.com/legacy/",
      retry: vi.fn(),
      transferInTab: vi.fn(async () => undefined),
      continue: proceed,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Old origin unavailable");
    expect(screen.getByRole("link", { name: "Open old Canvas to recover your work" }))
      .toHaveAttribute("href", "https://chardesk.com/legacy/");
    expect(screen.getByRole("button", { name: "Retry transfer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer in a tab" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue without old workspace" }));
    expect(proceed).toHaveBeenCalledOnce();
    showStartupPhase("loading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Canvas");
  });

  it("offers a reload when startup fails unexpectedly", () => {
    showStartupFatalFailure(new Error("Boot failed"));
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("alert")).toHaveTextContent("Boot failed");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("does not allow continuing while a transfer tab is still importing", async () => {
    let rejectTransfer: (error: Error) => void = () => undefined;
    showStartupMigrationFailure(new Error("Frame unavailable"), {
      recoverHref: "https://chardesk.com/legacy/",
      retry: vi.fn(),
      transferInTab: () => new Promise<void>((_resolve, reject) => { rejectTransfer = reject; }),
      continue: vi.fn(),
    });
    fireEvent.click(screen.getByRole("button", { name: "Transfer in a tab" }));
    expect(screen.getByRole("button", { name: "Continue without old workspace" })).toBeDisabled();
    rejectTransfer(new Error("Tab blocked"));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Continue without old workspace" })).toBeEnabled());
    expect(screen.getByRole("alert")).toHaveTextContent("Tab blocked");
  });
});
