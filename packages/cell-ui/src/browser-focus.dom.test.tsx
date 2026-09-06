import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useSurfaceFocus } from "./browser-focus.js";

afterEach(cleanup);

const Fixture = ({ changed }: { changed: (active: boolean) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const focus = useSurfaceFocus(ref);
  useLayoutEffect(() => changed(focus.active), [changed, focus.active]);
  return <><div ref={ref} data-testid="surface" data-active={focus.active} onFocus={focus.enter} onBlur={focus.leave}>
    <input aria-label="one" /><input aria-label="two" />
  </div><button>outside</button></>;
};

it("internal focus transfers never publish an inactive frame; null-target blur checks real ownership", async () => {
  const changed = vi.fn();
  render(<Fixture changed={changed} />);
  const surface = screen.getByTestId("surface");
  expect(surface).toHaveAttribute("data-active", "false");
  act(() => screen.getByLabelText("one").focus());
  expect(surface).toHaveAttribute("data-active", "true");
  changed.mockClear();
  act(() => screen.getByLabelText("two").focus());
  expect(changed).not.toHaveBeenCalled();
  act(() => screen.getByLabelText("two").blur());
  await waitFor(() => expect(surface).toHaveAttribute("data-active", "false"));
});

it("window recovery retains internal ownership but cannot reclaim an external target", async () => {
  render(<Fixture changed={() => undefined} />);
  const surface = screen.getByTestId("surface");
  act(() => screen.getByLabelText("one").focus());
  fireEvent(window, new Event("blur"));
  expect(surface).toHaveAttribute("data-active", "false");
  fireEvent(window, new Event("focus"));
  expect(surface).toHaveAttribute("data-active", "true");
  fireEvent(window, new Event("blur"));
  act(() => screen.getByRole("button").focus());
  fireEvent(window, new Event("focus"));
  expect(surface).toHaveAttribute("data-active", "false");
  await waitFor(() => expect(screen.getByRole("button")).toHaveFocus());
});
