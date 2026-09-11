import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryAppearance, GalleryFontSelect } from "./appearance";

// Vitest disables CSS processing; exercise the link lifecycle with a local URL.
vi.mock("@chardesk/font-fusion/fonts.css?url", () => ({ default: "/packages/font-fusion/fonts.css" }));
vi.mock("@chardesk/font-xiaolai/fonts.css?url", () => ({ default: "/packages/font-xiaolai/fonts.css" }));

describe("Cell UI gallery font loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("chardesk-cell-ui-font");
    document.querySelectorAll("link[data-display-font-source]").forEach((link) => link.remove());
    Reflect.deleteProperty(document, "fonts");
  });

  it("selects and commits Fusion only after both Latin and CJK samples load at the Canvas size", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "", textBaseline: "alphabetic", textAlign: "", fillStyle: "", strokeStyle: "", lineWidth: 1,
      save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      beginPath: vi.fn(), closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      scale: vi.fn(), translate: vi.fn(), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
      measureText: () => ({ width: 7.5, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 3 }),
    } as unknown as CanvasRenderingContext2D);
    const load = vi.fn().mockResolvedValue([{}]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        load,
        ready: Promise.resolve(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const first = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );
    const { container } = first;

    fireEvent.click(screen.getByRole("button", { name: "Font: Maple" }));
    expect(screen.getByRole("listbox", { name: "Fonts" })).toBeInTheDocument();
    expect(container.querySelector("canvas")).toHaveAttribute("width", "108");
    expect(container.querySelector("canvas")).toHaveAttribute("height", "20");
    expect(container.querySelector('[data-cell-overlay-root="gallery-font-content"]'))
      .toHaveAttribute("height", "80");
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label")))
      .toEqual(["Maple", "Fusion", "Xiaolai"]);
    fireEvent.click(screen.getByRole("option", { name: "Fusion" }));
    const surface = container.querySelector('[data-cell-probe="gallery-font-select"]');
    expect(surface).toHaveAttribute(
      "data-cell-activation-flash", "gallery-font-option-fusion-mono"
    );
    expect(screen.getByRole("listbox", { name: "Fonts" })).toBeInTheDocument();
    const link = document.querySelector<HTMLLinkElement>(
      'link[data-display-font-source="fusion-mono"]'
    );
    expect(link).not.toBeNull();
    fireEvent.load(link!);

    await waitFor(() => expect(container.firstElementChild).toHaveAttribute(
      "data-gallery-font", "fusion-mono"
    ));
    await waitFor(() => expect(
      screen.queryByRole("listbox", { name: "Fonts" })
    ).not.toBeInTheDocument());
    expect(localStorage.getItem("chardesk-cell-ui-font")).toBe("fusion-mono");
    expect(screen.getByRole("button", { name: "Font: Fusion" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("15px 'Fusion Pixel 12px Mono latin'", "AgWi09");
    expect(load).toHaveBeenCalledWith("15px 'Fusion Pixel 12px Mono latin'", "世界，。");
    expect(container.firstElementChild).toHaveStyle({
      "--gallery-font-size": "15px",
    });

    first.unmount();
    const restored = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );
    expect(restored.container.firstElementChild).toHaveAttribute(
      "data-gallery-font-status", "loading"
    );
    await waitFor(() => expect(restored.container.firstElementChild).toHaveAttribute(
      "data-gallery-font", "fusion-mono"
    ));
    expect(screen.getByRole("button", { name: "Font: Fusion" })).toBeInTheDocument();
  });

  it("keeps Maple committed and leaves the preference unchanged when loading fails", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const load = vi.fn().mockResolvedValue([{}]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        load,
        ready: Promise.resolve(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const { container } = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );

    fireEvent.click(screen.getByRole("button", { name: "Font: Maple" }));
    fireEvent.click(screen.getByRole("option", { name: "Fusion" }));
    const link = document.querySelector<HTMLLinkElement>(
      'link[data-display-font-source="fusion-mono"]'
    );
    expect(link).not.toBeNull();
    fireEvent.error(link!);

    await waitFor(() => expect(container.firstElementChild).toHaveAttribute(
      "data-gallery-font-status", "error"
    ));
    expect(container.firstElementChild).toHaveAttribute("data-gallery-font", "maple");
    expect(localStorage.getItem("chardesk-cell-ui-font")).toBeNull();
    expect(screen.getByRole("button", { name: /Fusion unavailable/ })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Display remains Maple");
    expect(load.mock.calls.some(([font]) => String(font).includes("Fusion"))).toBe(false);
  });

  it("ignores an invalid saved font", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    localStorage.setItem("chardesk-cell-ui-font", "unknown");
    const { container } = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );

    expect(container.firstElementChild).toHaveAttribute("data-gallery-font", "maple");
    expect(container.firstElementChild).toHaveAttribute("data-gallery-font-status", "idle");
    expect(screen.getByRole("button", { name: "Font: Maple" })).toBeInTheDocument();
  });

  it("keeps the in-memory Maple default when preferences are unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });
    const { container } = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );

    expect(container.firstElementChild).toHaveAttribute("data-gallery-font", "maple");
    expect(container.firstElementChild).toHaveAttribute("data-gallery-font-status", "idle");
  });
});
