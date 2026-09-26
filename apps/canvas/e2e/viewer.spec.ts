import { expect, test } from "@playwright/test";

const SOURCE = "┌─────────┐\n│ Human → LLM │\n└─────────┘";

const inspectNativeSelection = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((element) => {
    const root = element.getRootNode() as ShadowRoot & {
      getSelection?: () => Selection | null;
    };
    const computed = getComputedStyle(element);
    return {
      text: root.getSelection?.()?.toString() || getSelection()?.toString() || "",
      userSelect:
        computed.getPropertyValue("user-select") ||
        computed.getPropertyValue("-webkit-user-select"),
    };
  });

test.describe("CharDesk Viewer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/packages/viewer/test-fixture.html");
  });

  test("renders selectable Unicode text and ANSI presentation", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const document = viewer.locator("pre[part='document']");

    await expect(document).toHaveText(SOURCE);
    const firstRun = document.locator(".run").first();
    await expect(firstRun).toHaveText("┌─────────┐");
    expect(
      await firstRun.evaluate((element) =>
        element.style.getPropertyValue("--run-fg")
      )
    ).toBe("#dc2626");

    await viewer.evaluate((element) => {
      (element as HTMLElement & { interaction: "text" }).interaction = "text";
    });
    await document.selectText();
    const selection = await inspectNativeSelection(document);
    expect(selection.userSelect).toBe("text");
    if (selection.text) expect(selection.text).toBe(SOURCE);
  });

  test("uses semantic system cursors for content, links, and cell selection", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const document = viewer.locator("pre[part='document']");
    expect(
      await document.evaluate((element) => getComputedStyle(element).cursor)
    ).toBe("default");

    await viewer.evaluate((element) => {
      (element as HTMLElement & { source: string }).source =
        "\n\n\u001b]8;;https://chardesk.com\u001b\\link\u001b]8;;\u001b\\";
    });
    const link = document.locator("a");
    await expect(link).toHaveText("link");
    expect(await link.evaluate((element) => getComputedStyle(element).cursor)).toBe(
      "pointer"
    );
    await expect(viewer.locator("[part='hover']")).toHaveCount(0);
  });

  test("reveals compact reading controls on hover and keyboard focus", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const toolbar = viewer.locator("[part='toolbar']");
    const viewport = viewer.locator("[part='viewport']");

    expect(await toolbar.evaluate((element) => getComputedStyle(element).opacity)).toBe(
      "0"
    );
    await viewer.hover();
    await expect
      .poll(() =>
        toolbar.evaluate((element) => getComputedStyle(element).opacity)
      )
      .toBe("1");
    expect(await toolbar.getAttribute("role")).toBe("toolbar");
    await expect(toolbar.locator("button")).toHaveCount(5);
    await expect(toolbar.locator("svg[aria-hidden='true']")).toHaveCount(5);
    await expect(viewer.locator("[part='zoom-value']")).toHaveCount(0);
    await expect(viewer.locator("[part='coordinate']")).toHaveCount(0);
    await expect(viewer.locator("[part~='copy-selection']")).toHaveCount(0);

    const zoomControls = viewer.locator("[part='zoom-controls']");
    const copyControls = viewer.locator("[part='copy-controls']");
    expect(
      await zoomControls.evaluate((element) => ({
        left: getComputedStyle(element).left,
        bottom: getComputedStyle(element).bottom,
      }))
    ).toEqual({ left: "8px", bottom: "8px" });
    expect(
      await copyControls.evaluate((element) => ({
        top: getComputedStyle(element).top,
        right: getComputedStyle(element).right,
      }))
    ).toEqual({ top: "8px", right: "8px" });
    expect(
      await toolbar.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        shadow: getComputedStyle(element).boxShadow,
      }))
    ).toEqual({ background: "rgba(0, 0, 0, 0)", shadow: "none" });

    const zoomOut = viewer.getByRole("button", { name: "Zoom out" });
    expect(await zoomOut.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgba(0, 0, 0, 0)");
    await zoomOut.hover();
    expect(await zoomOut.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgba(0, 0, 0, 0)");

    await page.mouse.move(0, 0);
    await viewport.focus();
    await expect
      .poll(() =>
        toolbar.evaluate((element) => getComputedStyle(element).opacity)
      )
      .toBe("1");
  });

  test("keeps controls visible and compact on touch-sized hosts", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/packages/viewer/test-fixture.html");
    const viewer = page.locator("chardesk-viewer");
    await viewer.evaluate((element) => {
      element.style.width = "360px";
    });
    const toolbar = viewer.locator("[part='toolbar']");

    expect(await toolbar.evaluate((element) => getComputedStyle(element).opacity)).toBe(
      "1"
    );
    const groups = viewer.locator("[part$='-controls']");
    await expect(groups).toHaveCount(2);
    for (const group of await groups.all()) {
      expect(await group.evaluate((element) => getComputedStyle(element).pointerEvents))
        .toBe("auto");
    }
    await context.close();
  });

  test("adapts its neutral surface to the host color scheme", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const root = viewer.locator("[part='root']");
    await page.emulateMedia({ colorScheme: "light" });
    const light = await root.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await root.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );

    expect(light).not.toBe(dark);
  });

  test("gives the focused cell cursor a static frame without a hover cell", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const cursor = viewer.locator("[part='cursor']");
    const viewport = viewer.locator("[part='viewport']");
    await expect(viewer.locator("[part='hover']")).toHaveCount(0);

    await viewer.evaluate((element) => {
      (element as HTMLElement & {
        setCursor(point: { x: number; y: number }): void;
      }).setCursor({ x: 1, y: 1 });
    });
    await expect(cursor).toBeVisible();
    expect(
      await cursor.evaluate((element) => ({
        border: getComputedStyle(element).borderTopStyle,
        shadow: getComputedStyle(element).boxShadow,
        opacity: getComputedStyle(element).opacity,
      }))
    ).toMatchObject({ border: "none", opacity: "0.45" });
    expect(await cursor.evaluate((element) => getComputedStyle(element).boxShadow)).toContain(
      "inset"
    );

    await viewport.focus();
    expect(await cursor.evaluate((element) => getComputedStyle(element).opacity)).toBe(
      "1"
    );
  });

  test("only hits cells inside the document grid", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const document = viewer.locator("pre[part='document']");
    await viewer.evaluate((element) => {
      (element as HTMLElement & { source: string }).source = "A C\nA";
    });
    await expect(document).toHaveText("A C\nA");

    const documentBox = await document.boundingBox();
    const measureBox = await viewer.locator(".measure").boundingBox();
    expect(documentBox).not.toBeNull();
    expect(measureBox).not.toBeNull();
    const cellWidth = measureBox!.width / 10;
    const lineHeight = measureBox!.height;

    await page.mouse.click(
      documentBox!.x + 16 + cellWidth * 1.5,
      documentBox!.y + 16 + lineHeight * 1.5
    );
    expect(
      await viewer.evaluate(
        (element) =>
          (element as HTMLElement & { cursor: { x: number; y: number } | null })
            .cursor
      )
    ).toEqual({ x: 1, y: 1 });

    await viewer.evaluate((element) => {
      (element as HTMLElement & {
        setCursor(point: { x: number; y: number }): void;
      }).setCursor({ x: 2, y: 1 });
    });
    await page.mouse.click(
      documentBox!.x + 8,
      documentBox!.y + 16 + lineHeight * 1.5
    );
    expect(
      await viewer.evaluate(
        (element) =>
          (element as HTMLElement & { cursor: { x: number; y: number } | null })
            .cursor
      )
    ).toEqual({ x: 2, y: 1 });

    await page.mouse.move(
      documentBox!.x + 8,
      documentBox!.y + 16 + lineHeight * 1.5
    );
    await page.mouse.down();
    await page.mouse.move(documentBox!.x + 4, documentBox!.y + 4);
    await page.mouse.up();
    expect(
      await viewer.evaluate(
        (element) =>
          (element as HTMLElement & { selection: unknown | null }).selection
      )
    ).toBeNull();
  });

  test("zooms without replacing the source fallback", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const root = viewer.locator("[part='root']");
    const stage = viewer.locator("[part='stage']");
    await viewer.evaluate((element) => {
      (element as HTMLElement & {
        fitToViewport(mode: "width"): void;
      }).fitToViewport("width");
    });
    await expect
      .poll(() =>
        viewer.locator("[part='viewport']").evaluate((element) =>
          element.style.getPropertyValue("--chardesk-auto-viewport-height")
        )
      )
      .not.toBe("");
    const before = await root.boundingBox();
    const zoomBefore = await viewer.evaluate(
      (element) => (element as HTMLElement & { zoom: number }).zoom
    );
    const stageHeightBefore = await stage.evaluate((element) =>
      Number.parseFloat(element.style.height)
    );
    await viewer.hover({ position: { x: 8, y: 8 } });
    await viewer.getByRole("button", { name: "Zoom in" }).click();
    const after = await root.boundingBox();
    const stageHeightAfter = await stage.evaluate((element) =>
      Number.parseFloat(element.style.height)
    );

    expect(
      await viewer.evaluate((element) =>
        (element as HTMLElement & { zoom: number }).zoom
      )
    ).toBeCloseTo(Math.min(4, zoomBefore + 0.1));
    expect(after?.width).toBeCloseTo(before!.width);
    expect(after?.height).toBeCloseTo(before!.height);
    expect(stageHeightAfter).toBeGreaterThan(stageHeightBefore);
    await expect(viewer.locator("pre[data-chardesk-source]")).toContainText(
      "Human → LLM"
    );

    await viewer.evaluate((element) => {
      (element as HTMLElement & { resetZoom(): void }).resetZoom();
    });
    expect((await root.boundingBox())?.height).toBeCloseTo(before!.height);
  });

  test("caps automatic character size and centers a narrow document", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    await viewer.evaluate((element) => {
      const target = element as HTMLElement & {
        source: string;
        fitToViewport(mode: "width"): void;
      };
      target.style.setProperty("--chardesk-font-size", "15px");
      target.style.setProperty("--chardesk-fit-max-font-size", "20px");
      target.source = "A";
      target.fitToViewport("width");
    });

    await expect
      .poll(() =>
        viewer.evaluate((element) =>
          (element as HTMLElement & { zoom: number }).zoom
        )
      )
      .toBeCloseTo(20 / 15, 4);
    const geometry = await viewer.evaluate((element) => {
      const viewport = element.shadowRoot!.querySelector(
        "[part='viewport']"
      )!.getBoundingClientRect();
      const surface = element.shadowRoot!.querySelector(
        ".surface"
      )!.getBoundingClientRect();
      const document = element.shadowRoot!.querySelector(
        "[part='document']"
      )!;
      const zoom = (element as HTMLElement & { zoom: number }).zoom;
      return {
        centerDelta:
          (surface.left + surface.right) / 2 -
          (viewport.left + viewport.right) / 2,
        effectiveFontSize:
          Number.parseFloat(getComputedStyle(document).fontSize) * zoom,
      };
    });
    expect(geometry.effectiveFontSize).toBeCloseTo(20, 4);
    expect(Math.abs(geometry.centerDelta)).toBeLessThan(1);
  });

  test("allows manual zoom beyond the automatic character-size cap", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    await viewer.evaluate((element) => {
      const target = element as HTMLElement & {
        source: string;
        zoom: number;
        fitToViewport(mode: "width"): void;
      };
      target.source = "A";
      target.fitToViewport("width");
      target.zoom = 2;
    });

    expect(
      await viewer.evaluate(
        (element) => (element as HTMLElement & { zoom: number }).zoom
      )
    ).toBe(2);
    expect(await viewer.getAttribute("fit")).toBe("none");
  });

  test("recalculates frame height when the source changes", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const root = viewer.locator("[part='root']");
    const before = await root.boundingBox();

    await viewer.evaluate((element) => {
      const target = element as HTMLElement & { source: string };
      target.source = `${target.source}\nnew row\nanother row`;
    });

    await expect
      .poll(async () => (await root.boundingBox())?.height)
      .toBeGreaterThan(before!.height);
  });

  test("navigates and extends a cell selection with the keyboard", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const viewport = viewer.locator("[part='viewport']");
    await viewer.evaluate((element) => {
      (element as HTMLElement & {
        setCursor(point: { x: number; y: number }): void;
      }).setCursor({ x: 0, y: 0 });
    });
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");

    expect(
      await viewer.evaluate((element) =>
        (element as HTMLElement & {
          selection: { rect: Record<string, number> } | null;
        }).selection
      )
    ).toEqual({
      anchor: { x: 1, y: 0 },
      focus: { x: 1, y: 1 },
      rect: { left: 1, top: 0, right: 1, bottom: 1 },
    });
    await expect(viewer.locator("[part='cursor']")).toBeVisible();
  });

  test("uses persistent cell rectangles in grid mode and native selection in text mode", async ({ page }) => {
    const viewer = page.locator("chardesk-viewer");
    const document = viewer.locator("pre[part='document']");
    const documentBox = await document.boundingBox();
    const measureBox = await viewer.locator(".measure").boundingBox();
    expect(documentBox).not.toBeNull();
    expect(measureBox).not.toBeNull();
    const cellWidth = measureBox!.width / 10;
    const lineHeight = measureBox!.height;

    await page.mouse.move(
      documentBox!.x + 16 + cellWidth * 1.5,
      documentBox!.y + 16 + lineHeight * 1.5
    );
    expect(
      await document.evaluate((element) => getComputedStyle(element).cursor)
    ).toBe("default");
    await page.mouse.down();
    await page.mouse.move(
      documentBox!.x + documentBox!.width + 24,
      documentBox!.y + documentBox!.height + 24
    );
    await page.mouse.up();

    expect(
      await viewer.evaluate((element) =>
        (element as HTMLElement & {
          selection: { rect: Record<string, number> } | null;
        }).selection?.rect
      )
    ).toEqual({ left: 1, top: 1, right: 14, bottom: 2 });
    const selectionBox = await viewer.locator("[part='selection']").boundingBox();
    expect(selectionBox?.width).toBeCloseTo(cellWidth * 14);
    expect(selectionBox?.height).toBeCloseTo(lineHeight * 2);
    const gridNativeSelection = await inspectNativeSelection(document);
    expect(gridNativeSelection).toEqual({ text: "", userSelect: "none" });

    await page.mouse.click(
      documentBox!.x + 16 + cellWidth / 2,
      documentBox!.y + 16 + lineHeight / 2
    );
    expect(
      await viewer.evaluate((element) => ({
        cursor: (element as HTMLElement & { cursor: unknown }).cursor,
        selection: (element as HTMLElement & { selection: unknown }).selection,
      }))
    ).toEqual({ cursor: { x: 0, y: 0 }, selection: null });

    await viewer.evaluate((element) => {
      (element as HTMLElement & { interaction: "text" }).interaction = "text";
    });
    await document.selectText();
    const nativeSelection = await inspectNativeSelection(document);
    expect(nativeSelection.userSelect).toBe("text");
    if (nativeSelection.text) expect(nativeSelection.text).toBe(SOURCE);
  });

  test("keeps the light-DOM Unicode fallback without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/packages/viewer/test-fixture.html");

    const fallback = page.locator(
      "chardesk-viewer > pre[data-chardesk-source]"
    );
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("Human → LLM");
    await context.close();
  });

  test("includes a responsive product Host alongside the test fixture", async ({ page }) => {
    await page.goto("/packages/viewer/demo.html");
    const viewers = page.locator("chardesk-viewer");

    await expect(page.getByRole("heading", { name: "Text you can see." })).toBeVisible();
    await expect(viewers).toHaveCount(2);
    await expect(viewers.first().locator("[part='toolbar']")).not.toHaveAttribute(
      "hidden"
    );
    await expect(viewers.last().locator("[part='toolbar']")).toHaveAttribute(
      "hidden"
    );
    await expect(viewers.first().locator("[part='document']")).toContainText(
      "LLM-readable text"
    );
  });
});
