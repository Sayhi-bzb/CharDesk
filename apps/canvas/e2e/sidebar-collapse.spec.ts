import { expect, test } from "@playwright/test";

test.describe("Sidebar collapse", () => {
  test("uses a standalone trigger and expands continuously from the right", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const sidebar = page.locator('[data-slot="sidebar"]');
    const region = page.locator('[data-editor-chrome-region="side-end"]');
    const host = region.locator(":scope > *");
    const container = page.locator('[data-slot="sidebar-container"]');
    const inner = page.locator('[data-slot="sidebar-inner"]');
    const content = page.locator('[data-slot="sidebar-content"]');
    const trigger = page.getByRole("button", { name: "Toggle Sidebar" });

    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(page.locator('[data-slot="sidebar-footer"]')).toHaveCount(0);
    const expandedBox = await region.boundingBox();
    const expandedTriggerBox = await trigger.boundingBox();
    expect(expandedBox).not.toBeNull();
    expect(expandedTriggerBox).not.toBeNull();
    await expect(region).toHaveCSS("transition-duration", "0.18s");
    await expect(region).toHaveCSS("overflow", "visible");
    await expect(region).toHaveCSS(
      "transition-timing-function",
      "cubic-bezier(0.22, 1, 0.36, 1)"
    );
    await expect(container).toHaveClass(/shadow-host/);
    await expect(container).toHaveCSS("border-radius", "12px");
    await expect(container).not.toHaveCSS("box-shadow", "none");
    await expect(container).toHaveCSS("overflow", "hidden");
    await expect(sidebar).toHaveCSS("overflow", "visible");
    await expect(inner).toHaveCSS("overflow", "hidden");
    await expect(container).toHaveCSS(
      "transition-property",
      "--chardesk-sidebar-height, background-color, box-shadow"
    );

    const expandedGeometry = await page.evaluate(() => {
      const regionElement = document.querySelector<HTMLElement>(
        '[data-editor-chrome-region="side-end"]'
      );
      const hostElement = regionElement?.firstElementChild as HTMLElement | null;
      const sidebarElement = document.querySelector<HTMLElement>(
        '[data-slot="sidebar"]'
      );
      const containerElement = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]'
      );
      if (!regionElement || !hostElement || !sidebarElement || !containerElement) {
        return null;
      }
      return {
        regionHeight: regionElement.getBoundingClientRect().height,
        hostHeight: hostElement.getBoundingClientRect().height,
        sidebarHeight: sidebarElement.getBoundingClientRect().height,
        containerHeight: containerElement.getBoundingClientRect().height,
      };
    });
    expect(expandedGeometry).not.toBeNull();
    expect(expandedGeometry!.regionHeight).toBeCloseTo(512, 0);
    expect(expandedGeometry!.regionHeight).toBeLessThan(900);
    expect(expandedGeometry!.hostHeight).toBeCloseTo(
      expandedGeometry!.regionHeight,
      0
    );
    expect(expandedGeometry!.sidebarHeight).toBeCloseTo(
      expandedGeometry!.regionHeight,
      0
    );
    expect(expandedGeometry!.containerHeight).toBeLessThanOrEqual(
      expandedGeometry!.regionHeight + 1
    );
    await expect(host).toHaveCSS("overflow", "visible");

    await page.evaluate(() => {
      const containerElement = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]'
      );
      containerElement?.addEventListener("transitionend", (event) => {
        if (event.propertyName === "--chardesk-sidebar-height") {
          containerElement.dataset.heightTransitionEnded = "true";
        }
      });
    });

    await trigger.click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(sidebar).toHaveAttribute(
      "data-collapsed-appearance",
      "trigger"
    );
    await expect(content).toHaveAttribute("aria-hidden", "true");
    await expect(content).toHaveAttribute("inert", "");
    await expect(container).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(container).toHaveClass(/shadow-none/);
    await expect(container).not.toHaveClass(/shadow-host/);
    await expect(content).toHaveCSS("pointer-events", "none");
    await expect(trigger).toHaveCSS("pointer-events", "auto");
    await expect(sidebar.getByRole("button")).toHaveCount(1);
    await expect(sidebar.getByRole("tab")).toHaveCount(0);
    await page.waitForTimeout(350);
    await expect(container).toHaveAttribute("data-height-transition-ended", "true");

    const collapsedBox = await region.boundingBox();
    const collapsedContainerBox = await container.boundingBox();
    const collapsedTriggerBox = await trigger.boundingBox();
    expect(collapsedBox).not.toBeNull();
    expect(collapsedContainerBox).not.toBeNull();
    expect(collapsedTriggerBox).not.toBeNull();
    expect(collapsedBox!.width).toBeLessThan(expandedBox!.width);
    expect(collapsedContainerBox!.height).toBeCloseTo(48, 0);
    expect(collapsedTriggerBox!.x).toBeGreaterThan(expandedTriggerBox!.x);
    expect(
      Math.abs(
        collapsedBox!.x + collapsedBox!.width -
          (collapsedTriggerBox!.x + collapsedTriggerBox!.width) -
          4
      )
    ).toBeLessThanOrEqual(1);

    await trigger.click();
    await page.waitForTimeout(80);
    const intermediateGeometry = await page.evaluate(() => {
      const regionElement = document.querySelector<HTMLElement>(
        '[data-editor-chrome-region="side-end"]'
      );
      const triggerElement = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-trigger"]'
      );
      const containerElement = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]'
      );
      if (!regionElement || !triggerElement || !containerElement) return null;
      const regionRect = regionElement.getBoundingClientRect();
      const triggerRect = triggerElement.getBoundingClientRect();
      const containerRect = containerElement.getBoundingClientRect();
      return {
        regionWidth: regionRect.width,
        regionHeight: regionRect.height,
        regionX: regionRect.x,
        triggerX: triggerRect.x,
        containerHeight: containerRect.height,
      };
    });
    expect(intermediateGeometry).not.toBeNull();
    expect(intermediateGeometry!.regionWidth).toBeGreaterThan(collapsedBox!.width);
    expect(intermediateGeometry!.regionWidth).toBeLessThan(expandedBox!.width);
    expect(intermediateGeometry!.containerHeight).toBeGreaterThan(
      collapsedContainerBox!.height
    );
    expect(intermediateGeometry!.containerHeight).toBeLessThanOrEqual(
      intermediateGeometry!.regionHeight + 1
    );
    expect(intermediateGeometry!.triggerX).toBeCloseTo(
      intermediateGeometry!.regionX + 4,
      0
    );

    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await page.waitForTimeout(260);
    await expect(page.getByRole("tab", { name: "Essentials" })).toBeVisible();
    const reopenedBox = await region.boundingBox();
    const reopenedTriggerBox = await trigger.boundingBox();
    expect(reopenedBox).not.toBeNull();
    expect(reopenedTriggerBox).not.toBeNull();
    expect(Math.abs(reopenedBox!.width - expandedBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedTriggerBox!.x - expandedTriggerBox!.x)).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: testInfo.outputPath("sidebar-expanded.png"),
      fullPage: true,
    });
  });

  test("keeps expanded content within the chrome region and scrolls internally", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto("/");
    await expect(page.locator('[data-testid="sidebar-view-content"]')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>(
        '[data-editor-chrome-region="side-end"]'
      );
      const host = region?.firstElementChild as HTMLElement | null;
      const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const surface = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]'
      );
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="sidebar-view-content"] [data-slot="scroll-area-viewport"]'
      );
      if (!region || !host || !sidebar || !surface || !viewport) return null;

      viewport.scrollTop = 120;
      return {
        regionHeight: region.getBoundingClientRect().height,
        hostHeight: host.getBoundingClientRect().height,
        sidebarHeight: sidebar.getBoundingClientRect().height,
        surfaceHeight: surface.getBoundingClientRect().height,
        viewportHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.regionHeight).toBeCloseTo(476, 0);
    expect(metrics!.hostHeight).toBeCloseTo(metrics!.regionHeight, 0);
    expect(metrics!.sidebarHeight).toBeCloseTo(metrics!.regionHeight, 0);
    expect(metrics!.surfaceHeight).toBeLessThanOrEqual(metrics!.regionHeight + 1);
    expect(metrics!.scrollHeight).toBeGreaterThan(metrics!.viewportHeight);
    expect(metrics!.scrollTop).toBeGreaterThan(0);
  });

  test("keeps the mobile sheet behavior without a footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("tab", { name: "Essentials" })).toBeVisible();
    await expect(page.locator('[data-slot="sidebar-footer"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: "Essentials" })).not.toBeVisible();
  });

  test("respects reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const sidebar = page.locator('[data-slot="sidebar"]');
    const region = page.locator('[data-editor-chrome-region="side-end"]');
    const container = page.locator('[data-slot="sidebar-container"]');
    await expect(region).toHaveCSS("transition-property", "none");
    await expect(container).toHaveCSS("transition-property", "none");

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(region).toHaveCSS("transition-property", "none");
    await expect(container).toHaveCSS("transition-property", "none");
  });
});
