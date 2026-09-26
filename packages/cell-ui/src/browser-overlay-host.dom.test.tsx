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

function NestedFixture({ childModal = false, childOutside = true }: Readonly<{
  childModal?: boolean; childOutside?: boolean;
}> = {}) {
  const [parentAnchor, setParentAnchor] = useState<HTMLButtonElement | null>(null);
  const [childAnchor, setChildAnchor] = useState<HTMLButtonElement | null>(null);
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  return <CellOverlayHost>
    <button ref={setParentAnchor} onClick={() => setParentOpen(true)}>Open parent</button>
    <button>Outside action</button>
    <CellOverlayPortal open={parentOpen} anchor={parentAnchor}
      onDismiss={() => { setChildOpen(false); setParentOpen(false); }}>
      <button ref={setChildAnchor} onClick={() => setChildOpen(true)}>Open child</button>
      <button>Parent action</button>
    </CellOverlayPortal>
    <CellOverlayPortal open={childOpen} anchor={childAnchor} modal={childModal}
      closeOnOutsideClick={childOutside}
      onDismiss={() => setChildOpen(false)}><button>Child action</button></CellOverlayPortal>
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

it("dismisses every nonmodal layer above the outside target in one pointer event", async () => {
  render(<NestedFixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open parent" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open child" }));
  await screen.findByRole("button", { name: "Child action" });
  const outside = screen.getByRole("button", { name: "Outside action" });
  outside.focus();
  fireEvent.pointerDown(outside);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Child action" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Parent action" })).toBeNull();
  });
  expect(document.activeElement).toBe(outside);
});

it("dismisses only the child when pointer input lands in its parent", async () => {
  render(<NestedFixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open parent" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open child" }));
  await screen.findByRole("button", { name: "Child action" });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Parent action" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Child action" })).toBeNull());
  expect(screen.getByRole("button", { name: "Parent action" })).not.toBeNull();
});

it("keeps Escape scoped to the top layer and restores focus at each level", async () => {
  render(<NestedFixture />);
  const trigger = screen.getByRole("button", { name: "Open parent" });
  trigger.focus();
  fireEvent.click(trigger);
  const childTrigger = await screen.findByRole("button", { name: "Open child" });
  fireEvent.click(childTrigger);
  await screen.findByRole("button", { name: "Child action" });
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Child action" })).toBeNull());
  expect(document.activeElement).toBe(childTrigger);
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Parent action" })).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it("stops outside dismissal at a modal barrier", async () => {
  render(<NestedFixture childModal childOutside={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Open parent" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open child" }));
  await screen.findByRole("button", { name: "Child action" });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Outside action" }));
  expect(screen.getByRole("button", { name: "Child action" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Parent action" })).not.toBeNull();
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
