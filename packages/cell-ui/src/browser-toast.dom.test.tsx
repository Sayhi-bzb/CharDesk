import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CellOverlayHost } from "./browser-overlay-host.js";
import { CellToastViewport, useCellToastState } from "./browser-toast.js";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Fixture() {
  const state = useCellToastState();
  return <CellOverlayHost>
    <button onClick={() => state.push({ id: "saved", content: "Saved", durationMs: 1000 })}>Notify</button>
    <CellToastViewport state={state} />
  </CellOverlayHost>;
}

it("portals timed feedback without moving focus", async () => {
  vi.useFakeTimers();
  render(<Fixture />);
  const button = screen.getByRole("button", { name: "Notify" });
  button.focus();
  act(() => button.click());
  expect(screen.getByRole("status").closest("[data-cell-overlay-host]")).not.toBeNull();
  expect(document.activeElement).toBe(button);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).toBeNull();
});
