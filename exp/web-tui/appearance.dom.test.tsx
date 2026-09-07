import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryAppearance, GalleryFontToggle } from "./appearance";

describe("Web TUI gallery font loading", () => {
  afterEach(() => {
    document.querySelectorAll("link[data-gallery-font-source]").forEach((link) => link.remove());
    Reflect.deleteProperty(document, "fonts");
  });

  it("commits Ark only after both Latin and CJK samples load at the Canvas size", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });
    const { container } = render(
      <GalleryAppearance><GalleryFontToggle /></GalleryAppearance>
    );

    fireEvent.click(screen.getByRole("button", { name: "Use Ark Pixel 12px Prop" }));
    const link = document.querySelector<HTMLLinkElement>(
      'link[data-gallery-font-source="ark-prop"]'
    );
    expect(link).not.toBeNull();
    fireEvent.load(link!);

    await waitFor(() => expect(container.firstElementChild).toHaveAttribute(
      "data-gallery-font", "ark-prop"
    ));
    expect(load).toHaveBeenNthCalledWith(1, "15px 'Ark Pixel 12px Prop latin'", "AgWi09");
    expect(load).toHaveBeenNthCalledWith(2, "15px 'Ark Pixel 12px Prop latin'", "世界，。");
    expect(container.firstElementChild).toHaveStyle({
      "--gallery-font-size": "15px",
    });
  });
});
