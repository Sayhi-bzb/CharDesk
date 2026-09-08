import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryAppearance, GalleryFontSelect } from "./appearance";

// Vitest disables CSS processing; exercise the link lifecycle with a local URL.
vi.mock("@chardesk/font-fusion/fonts.css?url", () => ({ default: "/packages/font-fusion/fonts.css" }));
vi.mock("@chardesk/font-xiaolai/fonts.css?url", () => ({ default: "/packages/font-xiaolai/fonts.css" }));

describe("Web TUI gallery font loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const { container } = render(
      <GalleryAppearance><GalleryFontSelect /></GalleryAppearance>
    );

    fireEvent.click(screen.getByRole("button", { name: "Font: Maple Mono" }));
    expect(screen.getByRole("listbox", { name: "Fonts" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.click(screen.getByRole("option", { name: "Fusion Pixel 12px Mono" }));
    const link = document.querySelector<HTMLLinkElement>(
      'link[data-display-font-source="fusion-mono"]'
    );
    expect(link).not.toBeNull();
    fireEvent.load(link!);

    await waitFor(() => expect(container.firstElementChild).toHaveAttribute(
      "data-gallery-font", "fusion-mono"
    ));
    expect(screen.getByRole("button", { name: "Font: Fusion Pixel 12px Mono" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("15px 'Fusion Pixel 12px Mono latin'", "AgWi09");
    expect(load).toHaveBeenCalledWith("15px 'Fusion Pixel 12px Mono latin'", "世界，。");
    expect(container.firstElementChild).toHaveStyle({
      "--gallery-font-size": "15px",
    });
  });
});
