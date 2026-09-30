import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentScrollArea } from "./content-scroll-area.js";

describe("ContentScrollArea", () => {
  it("wraps the native scroll area with the shared hover-fade treatment", () => {
    const { container } = render(
      <ContentScrollArea className="h-20">
        <div>Content</div>
      </ContentScrollArea>
    );

    const root = container.querySelector('[data-slot="scroll-area"]');

    expect(root).toHaveClass(
      "group/content-scroll-area",
      "h-20",
      "[&_[data-slot=scroll-area-scrollbar]]:opacity-0",
      "hover:[&_[data-slot=scroll-area-scrollbar]]:opacity-100",
      "focus-within:[&_[data-slot=scroll-area-scrollbar]]:opacity-100",
      "[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/25"
    );
    expect(
      container.querySelector('[data-slot="scroll-area-viewport"]')
    ).toHaveClass('[&>div]:!block');
    expect(
      container.querySelector('[data-slot="scroll-area-content"]')
    ).toHaveClass('min-w-0', 'w-full');
    expect(
      container.querySelector('[data-slot="scroll-area-scrollbar"]')
    ).toBeInTheDocument();
  });
});
