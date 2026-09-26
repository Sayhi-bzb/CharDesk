import { expect, test } from "@playwright/test";

const slideDeck = [
  "---",
  "chardesk: slides/v1",
  "title: Inspector layout",
  "---",
  "## Slide 1",
  "```text size=12x4",
  "Inspector",
  "```",
].join("\n");

for (const scenario of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "Slides desktop", viewport: { width: 1440, height: 900 }, slides: true },
  { name: "Slides phone", viewport: { width: 390, height: 844 }, slides: true },
  {
    name: "short viewport",
    viewport: { width: 1440, height: 220 },
    constrained: true,
  },
]) {
  test(`Inspector content stays inside its viewer on ${scenario.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto("/");

    if (scenario.slides) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.locator('input[type="file"]').setInputFiles({
        name: "inspector-layout.slides.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(slideDeck),
      });
      await expect(page.getByRole("button", { name: "Select canvas" })).toContainText(
        /inspector[- ]layout/i
      );
      await page.keyboard.press("Escape");
    }

    const panel = page.getByTestId("canvas-inspector-panel");
    const toggle = page.getByRole("button", { name: "Toggle inspector" });
    await expect(toggle).toBeVisible();
    if (scenario.viewport.width < 600) {
      await expect(panel).toBeHidden();
      await toggle.click();
    }
    await expect(panel).toBeVisible();

    const geometry = await panel.evaluate((element) => {
      const content = element.querySelector<HTMLElement>(
        '[data-testid="canvas-inspector-content"]'
      );
      const scrollArea = element.querySelector<HTMLElement>(
        '[data-slot="scroll-area"]'
      );
      const viewport = element.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      );
      const picker = element.querySelector<HTMLElement>(
        '[data-color-picker-panel="true"]'
      );
      const header = element.querySelector<HTMLElement>(
        '[data-testid="color-picker-header"]'
      );
      const restore = element.querySelector<HTMLElement>(
        'button[aria-label="Restore default color"]'
      );
      const footer = element.querySelector<HTMLElement>(
        '[data-testid="canvas-inspector-footer"]'
      );
      const footerToolbar = element.querySelector<HTMLElement>(
        '[data-testid="canvas-inspector-footer-actions"]'
      );

      if (
        !content ||
        !scrollArea ||
        !viewport ||
        !picker ||
        !header ||
        !restore ||
        !footer ||
        !footerToolbar
      ) {
        throw new Error("Inspector layout fixture is incomplete");
      }

      const panelRect = element.getBoundingClientRect();
      const scrollAreaRect = scrollArea.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const restoreRect = restore.getBoundingClientRect();
      const contentStyle = getComputedStyle(content);
      const panelStyle = getComputedStyle(element);
      const scrollAreaStyle = getComputedStyle(scrollArea);
      const viewportStyle = getComputedStyle(viewport);
      const pickerStyle = getComputedStyle(picker);
      const footerButtons = Array.from(
        footerToolbar.querySelectorAll<HTMLElement>("button")
      ).map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });

      return {
        panelClientWidth: element.clientWidth,
        panelClientHeight: element.clientHeight,
        panelScrollWidth: element.scrollWidth,
        panelRect: {
          x: panelRect.x,
          y: panelRect.y,
          width: panelRect.width,
          height: panelRect.height,
        },
        scrollAreaRect: {
          x: scrollAreaRect.x,
          y: scrollAreaRect.y,
          width: scrollAreaRect.width,
          height: scrollAreaRect.height,
        },
        viewportRect: {
          x: viewportRect.x,
          y: viewportRect.y,
          width: viewportRect.width,
          height: viewportRect.height,
        },
        viewportClientHeight: viewport.clientHeight,
        viewportScrollHeight: viewport.scrollHeight,
        borderRadius: {
          panel: panelStyle.borderRadius,
          scrollArea: scrollAreaStyle.borderRadius,
          viewport: viewportStyle.borderRadius,
        },
        overflow: {
          panel: [panelStyle.overflowX, panelStyle.overflowY],
          scrollArea: [scrollAreaStyle.overflowX, scrollAreaStyle.overflowY],
          viewport: [viewportStyle.overflowX, viewportStyle.overflowY],
        },
        pickerClientWidth: picker.clientWidth,
        pickerScrollWidth: picker.scrollWidth,
        headerClientWidth: header.clientWidth,
        headerScrollWidth: header.scrollWidth,
        restoreRight: restoreRect.right,
        headerLeft: headerRect.left,
        headerRight: headerRect.right,
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        panelRight: panelRect.right,
        contentPadding: {
          top: Number.parseFloat(contentStyle.paddingTop),
          right: Number.parseFloat(contentStyle.paddingRight),
          bottom: Number.parseFloat(contentStyle.paddingBottom),
          left: Number.parseFloat(contentStyle.paddingLeft),
        },
        pickerPadding: {
          top: Number.parseFloat(pickerStyle.paddingTop),
          right: Number.parseFloat(pickerStyle.paddingRight),
          bottom: Number.parseFloat(pickerStyle.paddingBottom),
          left: Number.parseFloat(pickerStyle.paddingLeft),
        },
        sectionGap: footerRect.top - pickerRect.bottom,
        bottomInset: contentRect.bottom - footerRect.bottom,
        footerToolbarClientWidth: footerToolbar.clientWidth,
        footerToolbarScrollWidth: footerToolbar.scrollWidth,
        footerButtons,
      };
    });

    expect(geometry.panelClientWidth).toBe(160);
    expect(geometry.scrollAreaRect).toEqual(geometry.panelRect);
    expect(geometry.viewportRect).toEqual(geometry.panelRect);
    expect(geometry.borderRadius).toEqual({
      panel: "12px",
      scrollArea: "12px",
      viewport: "12px",
    });
    expect(geometry.overflow).toEqual({
      panel: ["hidden", "hidden"],
      scrollArea: ["hidden", "hidden"],
      viewport: ["hidden", "scroll"],
    });
    expect(geometry.panelScrollWidth).toBeLessThanOrEqual(
      geometry.panelClientWidth
    );
    expect(geometry.pickerScrollWidth).toBeLessThanOrEqual(
      geometry.pickerClientWidth
    );
    expect(geometry.headerScrollWidth).toBeLessThanOrEqual(
      geometry.headerClientWidth
    );
    expect(geometry.restoreRight).toBeLessThanOrEqual(
      geometry.contentRight - geometry.contentPadding.right
    );
    expect(geometry.restoreRight).toBeLessThanOrEqual(geometry.panelRight);
    expect(geometry.contentPadding).toEqual({
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    });
    expect(geometry.headerLeft).toBeGreaterThanOrEqual(
      geometry.contentLeft + geometry.contentPadding.left
    );
    expect(geometry.headerRight).toBeLessThanOrEqual(
      geometry.contentRight - geometry.contentPadding.right
    );
    expect(geometry.pickerPadding).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(geometry.sectionGap).toBe(8);
    expect(geometry.bottomInset).toBe(10);
    expect(geometry.footerToolbarScrollWidth).toBeLessThanOrEqual(
      geometry.footerToolbarClientWidth
    );
    expect(geometry.footerButtons).toHaveLength(5);
    expect(geometry.footerButtons).toEqual(
      Array.from({ length: 5 }, () => ({ width: 24, height: 24 }))
    );

    if (scenario.constrained) {
      expect(geometry.panelClientHeight).toBe(140);
      expect(geometry.viewportClientHeight).toBe(140);
      expect(geometry.viewportScrollHeight).toBeGreaterThan(
        geometry.viewportClientHeight
      );

      const viewport = panel.locator('[data-slot="scroll-area-viewport"]');
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });

      await expect
        .poll(async () => {
          const panelBox = await panel.boundingBox();
          const footerBox = await panel
            .getByTestId("canvas-inspector-footer")
            .boundingBox();
          if (!panelBox || !footerBox) return null;
          return panelBox.y + panelBox.height - (footerBox.y + footerBox.height);
        })
        .toBe(10);
    }
  });
}
