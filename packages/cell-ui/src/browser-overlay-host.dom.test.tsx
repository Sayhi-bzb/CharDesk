import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { useState } from "react";
import { CellOverlayHost, CellOverlayPortal } from "./browser-overlay-host.js";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Fixture({ modal = false, closeOnOutsideClick = true }: Readonly<{
  modal?: boolean; closeOnOutsideClick?: boolean;
}>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return <CellOverlayHost>
    <div data-testid="top-surface"><button ref={setAnchor} onClick={() => setOpen(true)}>Open</button></div>
    <div data-testid="canvas-surface"><button>Canvas action</button></div>
    <CellOverlayPortal open={open} anchor={anchor} modal={modal}
      closeOnOutsideClick={closeOnOutsideClick}
      onDismiss={() => setOpen(false)}><button>Popup action</button></CellOverlayPortal>
  </CellOverlayHost>;
}

it("coordinates a portal across surfaces and restores focus on Escape", async () => {
  render(<Fixture />);
  const anchor = screen.getByRole("button", { name: "Open" });
  anchor.focus();
  fireEvent.click(anchor);
  const popup = await screen.findByRole("button", { name: "Popup action" });
  expect(popup.closest("[data-cell-overlay-host]")).not.toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(popup));
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Popup action" })).toBeNull());
  expect(document.activeElement).toBe(anchor);
});

it("dismisses on outside pointer input without taking focus back", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const outside = screen.getByRole("button", { name: "Canvas action" });
  expect(await screen.findByRole("button", { name: "Popup action" })).not.toBeNull();
  fireEvent.pointerDown(outside);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Popup action" })).toBeNull());
});

it("makes background surfaces inert for a modal and restores them on close", async () => {
  render(<Fixture modal />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("button", { name: "Popup action" });
  const app = screen.getByTestId("top-surface").parentElement!;
  expect(app.inert).toBe(true);
  expect(document.querySelector<HTMLElement>("[data-cell-overlay-host]")?.inert).not.toBe(true);
  fireEvent.pointerDown(screen.getByTestId("canvas-surface").querySelector("button")!);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Popup action" })).toBeNull());
  expect(app.inert).not.toBe(true);
});

it("keeps an alert dialog open on outside pointer input", async () => {
  render(<Fixture modal closeOnOutsideClick={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("button", { name: "Popup action" });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Canvas action" }));
  expect(screen.getByRole("button", { name: "Popup action" })).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Popup action" })).toBeNull());
});
