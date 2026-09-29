import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReorderableList,
  type ReorderAnnouncement,
} from "./reorderable-list";

type Item = { id: string; label: string };

const INITIAL_ITEMS: Item[] = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
];

function moveItem(items: readonly Item[], id: string, targetIndex: number) {
  const sourceIndex = items.findIndex((item) => item.id === id);
  const next = [...items];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function Harness({
  onMove = vi.fn(),
  onOpen = vi.fn(),
}: {
  onMove?: (id: string, index: number) => void;
  onOpen?: (id: string) => void;
}) {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const handleMove = (id: string, index: number) => {
    setItems((current) => moveItem(current, id, index));
    onMove(id, index);
  };
  return (
    <ReorderableList
      items={items}
      getId={(item) => item.id}
      ariaLabel="Reorder items"
      className="space-y-2"
      onMove={handleMove}
      getItemLabel={(item, index, total, grabbed) =>
        `${item.label} ${index + 1}/${total}${grabbed ? " grabbed" : ""}`
      }
      getAnnouncement={(event: ReorderAnnouncement<Item>) =>
        `${event.type}:${event.item.label}:${event.to + 1}`
      }
      renderItem={(item) => (
        <div>
          <button type="button" onClick={() => onOpen(item.id)}>
            Open {item.label}
          </button>
        </div>
      )}
    />
  );
}

function setRowGeometry(heights = [42, 42, 42]) {
  const rows = Array.from(
    document.querySelectorAll<HTMLLIElement>("[data-reorder-item]")
  );
  let top = 0;
  rows.forEach((row, index) => {
    const rowTop = top;
    const height = heights[index]!;
    top += height + 8;
    Object.defineProperty(row, "offsetHeight", {
      configurable: true,
      value: height,
    });
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: 0,
          y: rowTop,
          top: rowTop,
          bottom: rowTop + height,
          left: 0,
          right: 200,
          width: 200,
          height,
          toJSON: () => ({}),
        }) as DOMRect
    );
  });
}

describe("ReorderableList", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps ordinary content clicks and sub-threshold pointer movement inert", () => {
    const onMove = vi.fn();
    const onOpen = vi.fn();
    render(<Harness onMove={onMove} onOpen={onOpen} />);
    setRowGeometry();

    const openButton = screen.getByRole("button", { name: "Open One" });
    fireEvent.click(openButton);
    fireEvent.keyDown(openButton, { key: " " });
    const card = screen.getByRole("listitem", { name: "One 1/3" });
    fireEvent.pointerDown(card, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientY: 10,
    });
    fireEvent.pointerMove(card, { pointerId: 1, clientY: 12 });
    fireEvent.pointerUp(card, { pointerId: 1, clientY: 12 });

    expect(onOpen).toHaveBeenCalledWith("one");
    expect(onMove).not.toHaveBeenCalled();
    expect(card).toHaveAccessibleName("One 1/3");
    expect(card).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring/45",
      "focus-visible:ring-inset"
    );
    expect(card.className).not.toContain("focus-visible:ring-offset-");
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open One",
      "Open Two",
      "Open Three",
    ]);
  });

  it("opens a target slot while dragging without firing card content", async () => {
    const onMove = vi.fn();
    const onOpen = vi.fn();
    render(<Harness onMove={onMove} onOpen={onOpen} />);
    setRowGeometry();

    const trigger = screen.getByRole("button", { name: "Open One" });
    const cards = screen.getAllByRole("listitem");
    fireEvent.pointerDown(trigger, {
      button: 0,
      pointerId: 2,
      pointerType: "mouse",
      clientY: 10,
    });
    fireEvent.pointerMove(trigger, { pointerId: 2, clientY: 70 });
    await waitFor(() => expect(cards[1].style.transform).not.toBe("none"));
    expect(cards[2].style.transform).toBe("none");
    fireEvent.pointerUp(trigger, { pointerId: 2, clientY: 70 });
    fireEvent.click(trigger);

    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith("one", 1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open Two",
      "Open One",
      "Open Three",
    ]);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("listitem")
          .every((card) => card.style.transform === "none")
      ).toBe(true)
    );

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: "Open One" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("updates the open slot in both directions and restores it on cancel", async () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    setRowGeometry();
    const cards = screen.getAllByRole("listitem");
    const thirdCard = cards[2];

    fireEvent.pointerDown(thirdCard, {
      button: 0,
      pointerId: 5,
      pointerType: "mouse",
      clientY: 110,
    });
    fireEvent.pointerMove(thirdCard, { pointerId: 5, clientY: 30 });
    await waitFor(() => {
      expect(cards[0].style.transform).not.toBe("none");
      expect(cards[1].style.transform).not.toBe("none");
    });

    fireEvent.pointerMove(thirdCard, { pointerId: 5, clientY: 110 });
    await waitFor(() => {
      expect(cards[0].style.transform).toBe("none");
      expect(cards[1].style.transform).toBe("none");
    });

    fireEvent.pointerMove(thirdCard, { pointerId: 5, clientY: 30 });
    await waitFor(() => expect(cards[0].style.transform).not.toBe("none"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(cards.every((card) => card.style.transform === "none")).toBe(true)
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it("uses each row's measured center when dragging across mixed heights", () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    setRowGeometry([26, 44, 26]);
    const first = screen.getAllByRole("listitem")[0];

    fireEvent.pointerDown(first, {
      button: 0, pointerId: 8, pointerType: "mouse", clientY: 10,
    });
    fireEvent.pointerMove(first, { pointerId: 8, clientY: 80 });
    fireEvent.pointerUp(first, { pointerId: 8, clientY: 80 });

    expect(onMove).toHaveBeenCalledWith("one", 1);
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open Two", "Open One", "Open Three",
    ]);
  });

  it("opens the correct slot when a short row moves above a taller row", () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    setRowGeometry([26, 44, 26]);
    const third = screen.getAllByRole("listitem")[2];

    fireEvent.pointerDown(third, {
      button: 0, pointerId: 9, pointerType: "mouse", clientY: 99,
    });
    fireEvent.pointerMove(third, { pointerId: 9, clientY: 19 });
    fireEvent.pointerUp(third, { pointerId: 9, clientY: 19 });

    expect(onMove).toHaveBeenCalledWith("three", 0);
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open Three", "Open One", "Open Two",
    ]);
  });

  it("supports keyboard moves and restores the original order on Escape", () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const card = screen.getByRole("listitem", { name: "One 1/3" });

    fireEvent.keyDown(card, { key: " " });
    expect(
      screen.getByRole("listitem", { name: "One 1/3 grabbed" })
    ).toBeInTheDocument();
    fireEvent.keyDown(card, { key: "ArrowDown" });
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open Two",
      "Open One",
      "Open Three",
    ]);

    fireEvent.keyDown(
      screen.getByRole("listitem", { name: "One 2/3 grabbed" }),
      { key: "Escape" }
    );
    expect(screen.getAllByText(/^Open /).map((item) => item.textContent)).toEqual([
      "Open One",
      "Open Two",
      "Open Three",
    ]);
    expect(screen.getByText("cancel:One:1")).toBeInTheDocument();
    expect(onMove).toHaveBeenNthCalledWith(1, "one", 1);
    expect(onMove).toHaveBeenNthCalledWith(2, "one", 0);
  });

  it("requires a touch hold before dragging and lets early movement cancel", () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    setRowGeometry();
    const card = screen.getByRole("listitem", { name: "One 1/3" });

    fireEvent.pointerDown(card, {
      button: 0,
      pointerId: 3,
      pointerType: "touch",
      clientY: 10,
    });
    fireEvent.pointerMove(card, { pointerId: 3, clientY: 20 });
    act(() => vi.advanceTimersByTime(300));
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.pointerDown(card, {
      button: 0,
      pointerId: 4,
      pointerType: "touch",
      clientY: 10,
    });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerMove(card, { pointerId: 4, clientY: 70 });
    fireEvent.pointerUp(card, { pointerId: 4, clientY: 70 });

    expect(onMove).toHaveBeenCalledWith("one", 1);
    vi.useRealTimers();
  });
});
