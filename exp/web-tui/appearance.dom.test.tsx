import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryAppearance, GalleryFontToggle } from "./appearance";

// Vitest disables CSS processing; exercise the link lifecycle with a local URL.
vi.mock("@chardesk/font-ark/fonts.css?url", () => ({ default: "/packages/font-ark/fonts.css" }));

describe("Web TUI gallery font loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll("link[data-gallery-font-source]").forEach((link) => link.remove());
    Reflect.deleteProperty(document, "fonts");
  });

  it("commits Ark only after both Latin and CJK samples load at the Canvas size", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "", textBaseline: "alphabetic", save: vi.fn(), restore: vi.fn(),
      measureText: () => ({ width: 7.5, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 3 }),
    } as unknown as CanvasRenderingContext2D);
    const load = vi.fn().mockResolvedValue([{}]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });
    const { container } = render(
      <GalleryAppearance><GalleryFontToggle /></GalleryAppearance>
    );

    fireEvent.click(screen.getByRole("button", { name: "Use Ark Pixel 12px Mono" }));
    const link = document.querySelector<HTMLLinkElement>(
      'link[data-gallery-font-source="ark-mono"]'
    );
    expect(link).not.toBeNull();
    fireEvent.load(link!);

    await waitFor(() => expect(container.firstElementChild).toHaveAttribute(
      "data-gallery-font", "ark-mono"
    ));
    expect(load).toHaveBeenNthCalledWith(1, "15px 'Ark Pixel 12px Mono latin'", "AgWi09");
    expect(load).toHaveBeenNthCalledWith(2, "15px 'Ark Pixel 12px Mono latin'", "世界，。");
    expect(container.firstElementChild).toHaveStyle({
      "--gallery-font-size": "15px",
    });
  });
});
