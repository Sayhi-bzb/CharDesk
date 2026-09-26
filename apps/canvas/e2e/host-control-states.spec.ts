import { expect, test, type Locator, type Page } from "@playwright/test";

const STORAGE_KEY = "chardesk-persistence";

const readHoverStyle = async (control: Locator) => {
  await control.hover();
  await control.page().waitForTimeout(250);
  await control.hover();
  await control.page().waitForTimeout(50);
  return control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });
};

const expectPersistentStyleOnHover = async (control: Locator) => {
  await control.page().mouse.move(0, 0);
  await control.page().waitForTimeout(150);
  const persistentStyle = await control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });

  await expect(readHoverStyle(control)).resolves.toEqual(persistentStyle);
};

const expectHostContainer = async (container: Locator, elevated = true) => {
  await expect(container).toBeVisible();
  await expect(container).toHaveCSS("border-top-width", "0px");
  await expect(container).toHaveCSS("border-right-width", "0px");
  await expect(container).toHaveCSS("border-bottom-width", "0px");
  await expect(container).toHaveCSS("border-left-width", "0px");
  await expect(container).toHaveCSS("border-radius", "12px");
  const background = await container.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  const shadowState = await container.evaluate((element) => {
    const shadow = window.getComputedStyle(element).boxShadow;
    const colors = shadow.match(/rgba?\([^)]+\)/g) ?? [];
    const hasVisibleShadow =
      shadow !== "none" &&
      colors.some((color) => {
        if (!color.startsWith("rgba")) return true;
        const channels = color.match(/[\d.]+/g) ?? [];
        return Number(channels[3] ?? 1) > 0;
      });
    return { hasVisibleShadow, shadow, className: element.className };
  });
  expect(shadowState.hasVisibleShadow, JSON.stringify(shadowState)).toBe(
    elevated
  );
};

const expectHostIconGeometry = async (control: Locator) => {
  await expect(control).toHaveCSS("width", "32px");
  await expect(control).toHaveCSS("height", "32px");
  await expect(control.locator("svg").first()).toHaveCSS("width", "16px");
  await expect(control.locator("svg").first()).toHaveCSS("height", "16px");
};

const expectCompactIconGeometry = async (control: Locator) => {
  await expect(control).toHaveCSS("width", "28px");
  await expect(control).toHaveCSS("height", "28px");
  await expect(control.locator("svg").first()).toHaveCSS("width", "16px");
  await expect(control.locator("svg").first()).toHaveCSS("height", "16px");
};

const expectHostFocus = async (control: Locator) => {
  await control.focus();
  await control.page().keyboard.press("Shift+Tab");
  await control.page().keyboard.press("Tab");
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "none");
  const focusRing = await control.evaluate(
    (element) => window.getComputedStyle(element).boxShadow
  );
  expect(focusRing).not.toBe("none");
};

const expectIconCentered = async (control: Locator) => {
  const controlBox = await control.boundingBox();
  const iconBox = await control.locator("svg").first().boundingBox();
  expect(controlBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(
    Math.abs(
      controlBox!.x + controlBox!.width / 2 - (iconBox!.x + iconBox!.width / 2)
    )
  ).toBeLessThan(0.75);
  expect(
    Math.abs(
      controlBox!.y +
        controlBox!.height / 2 -
        (iconBox!.y + iconBox!.height / 2)
    )
  ).toBeLessThan(0.75);
};

const seedHostState = async (
  page: Page,
  viewport: { width: number; height: number },
  dark: boolean
) => {
  const offset = viewport.width < 600 ? { x: 80, y: 100 } : { x: 180, y: 130 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.evaluate(
    ({ storageKey, offset }) => {
      const sessions = [
        {
          id: "host-a",
          name: "Alpha",
          mode: "freeform",
          scene: [],
          grid: [
            ["0,0", { char: "A", color: "#111827" }],
            ["1,0", { char: "B", color: "#111827" }],
          ],
          viewport: { offset, zoom: 1 },
        },
        {
          id: "host-b",
          name: "Beta",
          mode: "freeform",
          scene: [],
          grid: [],
          viewport: { offset, zoom: 1 },
        },
        {
          id: "host-c",
          name: "Gamma",
          mode: "freeform",
          scene: [],
          grid: [],
          viewport: { offset, zoom: 1 },
        },
      ];
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: {
            offset,
            zoom: 1,
            canvasMode: "freeform",
            structuredScene: [],
            structuredComponents: [],
            brushChar: "#",
            brushColor: "#111827",
            showGrid: true,
            exportShowGrid: false,
            canvasSessions: sessions,
            activeCanvasId: "host-a",
            grid: sessions[0].grid,
          },
          version: 0,
        })
      );
    },
    { storageKey: STORAGE_KEY, offset }
  );
  await page.reload();
  await page.evaluate((useDarkTheme) => {
    document.documentElement.classList.toggle("dark", useDarkTheme);
  }, dark);

  const inspectorControl = page.getByRole("button", {
    name: "Toggle inspector",
  });
  if ((await inspectorControl.getAttribute("aria-expanded")) === "true") {
    await inspectorControl.click();
  }

  const surface = page.getByTestId("canvas-editor-surface");
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box!.x + offset.x + 2, box!.y + offset.y + 8);
  await page.mouse.down();
  await page.mouse.move(box!.x + offset.x + 15, box!.y + offset.y + 8, {
    steps: 3,
  });
  await page.mouse.up();

  return { surface };
};

for (const scenario of [
  {
    name: "desktop light",
    viewport: { width: 1440, height: 900 },
    dark: false,
  },
  { name: "desktop dark", viewport: { width: 1440, height: 900 }, dark: true },
  { name: "mobile light", viewport: { width: 390, height: 844 }, dark: false },
  { name: "mobile dark", viewport: { width: 390, height: 844 }, dark: true },
]) {
  test(`Host controls match Selection Toolbar hover in ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await seedHostState(page, scenario.viewport, scenario.dark);

    const selectionControl = page.getByRole("button", {
      name: "Toggle bold",
    });
    await expect(selectionControl).toBeVisible();
    await expectHostContainer(page.locator('[data-selection-toolbar="true"]'));
    await expectHostIconGeometry(selectionControl);
    await expectHostFocus(selectionControl);
    const expectedHover = await readHoverStyle(selectionControl);
    expect(expectedHover.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    await selectionControl.click();
    await expectPersistentStyleOnHover(selectionControl);

    const dockControl = page.getByRole("button", { name: "Box", exact: true });
    await expectHostContainer(page.getByTestId("tool-dock"));
    await expectHostIconGeometry(dockControl);
    await expect(readHoverStyle(dockControl)).resolves.toEqual(expectedHover);

    const activeDockItem = page.locator('[data-toolbar-item="select"]');
    const dockItem = page.locator('[data-toolbar-item="shape-group"]');
    const adjacentDockItem = page.locator('[data-toolbar-item="bg"]');
    const submenuTrigger = dockItem.locator(
      '[data-toolbar-submenu-trigger="true"]'
    );
    await expectHostIconGeometry(submenuTrigger);
    const activeDockBackground = await activeDockItem.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );
    await expectPersistentStyleOnHover(activeDockItem);
    await submenuTrigger.hover();
    await expect(dockItem).toHaveCSS("background-color", activeDockBackground);
    await expect(dockControl).toHaveCSS(
      "color",
      await activeDockItem
        .getByRole("button", { name: "Select", exact: true })
        .evaluate((element) => window.getComputedStyle(element).color)
    );
    await expect(adjacentDockItem).not.toHaveCSS(
      "background-color",
      activeDockBackground
    );
    await expect(submenuTrigger).toHaveCSS("border-left-width", "0px");

    const inspectorControl = page.getByRole("button", {
      name: "Toggle inspector",
    });
    await inspectorControl.click();
    const ansiPaletteTab = page.getByRole("tab", { name: "ANSI 16" });
    const presetsPaletteTab = page.getByRole("tab", { name: "Presets" });
    await expectCompactIconGeometry(ansiPaletteTab);
    await expectCompactIconGeometry(presetsPaletteTab);
    await expectIconCentered(ansiPaletteTab);
    await expectIconCentered(presetsPaletteTab);
    await expect(ansiPaletteTab).toHaveCSS(
      "background-color",
      activeDockBackground
    );
    await expect(readHoverStyle(presetsPaletteTab)).resolves.toEqual(
      expectedHover
    );
    await inspectorControl.click();
    await expect(page.getByTestId("canvas-inspector-panel")).toBeHidden();

    const railOrientation =
      scenario.viewport.width < 600 ? "horizontal" : "vertical";
    if (railOrientation === "horizontal") {
      await page.getByRole("button", { name: "Open library" }).click();
    }
    const sidebarControl = page
      .getByTestId(`character-view-rail-${railOrientation}`)
      .getByRole("tab", { name: "Nerd Icons" });
    await expectHostContainer(
      page.getByTestId(`character-view-rail-${railOrientation}`),
      false
    );
    await expectHostIconGeometry(sidebarControl);
    await expect(readHoverStyle(sidebarControl)).resolves.toEqual(
      expectedHover
    );
    if (railOrientation === "horizontal") {
      await page.keyboard.press("Escape");
    }

    const sidebarToggle = page.getByRole("button", { name: "Toggle Sidebar" });
    await expectHostIconGeometry(sidebarToggle);

    if (scenario.viewport.width >= 600) {
      const desktopSidebar = page.locator(
        `[data-slot="sidebar"][data-collapsed-appearance="trigger"]`
      );
      const sidebarSurface = desktopSidebar.locator(
        `[data-slot="sidebar-container"]`
      );
      await sidebarToggle.click();
      await expect(desktopSidebar).toHaveAttribute("data-state", "collapsed");
      await expect(sidebarSurface).toHaveClass(/shadow-none/);
      await expect(sidebarSurface).not.toHaveClass(/shadow-host/);
      await expect(sidebarSurface).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)"
      );
      await sidebarToggle.click();
      await expect(desktopSidebar).toHaveAttribute("data-state", "expanded");
      await expect(sidebarSurface).toHaveClass(/shadow-host/);
    }

    if (scenario.viewport.width >= 600) {
      await expectHostContainer(page.getByTestId("zoom-control"));
    }

    const appMenuControl = page.getByRole("button", { name: "Open menu" });
    await expectHostIconGeometry(appMenuControl);
    await expect(readHoverStyle(appMenuControl)).resolves.toEqual(
      expectedHover
    );
    await appMenuControl.click();
    await expectPersistentStyleOnHover(appMenuControl);
    await page.keyboard.press("Escape");

    const helpControl = page.getByRole("button", { name: "Help" });
    await expectHostIconGeometry(helpControl);
    await expect(readHoverStyle(helpControl)).resolves.toEqual(expectedHover);

    const breadcrumbControl = page.getByRole("button", {
      name: "Select canvas",
    });
    await expect(breadcrumbControl).toHaveCSS("height", "32px");
    await expect(breadcrumbControl.locator("svg")).toHaveCount(2);
    for (const breadcrumbIcon of await breadcrumbControl.locator("svg").all()) {
      await expect(breadcrumbIcon).toHaveCSS("width", "16px");
      await expect(breadcrumbIcon).toHaveCSS("height", "16px");
    }
    await expect(readHoverStyle(breadcrumbControl)).resolves.toEqual(
      expectedHover
    );
    await breadcrumbControl.click();

    const canvasPanel = page.getByRole("dialog", { name: "Select canvas" });
    await expectHostContainer(canvasPanel);
    await expect(canvasPanel).toHaveClass(/shadow-overlay/);
    const sessionControl = page.getByRole("button", {
      name: "Beta",
      exact: true,
    });
    const sessionItem = page.locator('[data-canvas-session-row="host-b"]');
    await expect(sessionControl).toBeVisible();
    await sessionControl.hover();
    await expect(sessionItem).toHaveCSS(
      "background-color",
      activeDockBackground
    );
    await expect(sessionControl).toHaveCSS("color", expectedHover.color);
    const adjacentSessionItem = page.locator(
      '[data-canvas-session-row="host-c"]'
    );
    const manageControl = page.getByRole("button", { name: "Manage Beta" });
    await manageControl.hover();
    await expect(sessionItem).toHaveCSS(
      "background-color",
      activeDockBackground
    );
    await expect(sessionControl).toHaveCSS("color", expectedHover.color);
    await expect(adjacentSessionItem).not.toHaveCSS(
      "background-color",
      activeDockBackground
    );

    await page.screenshot({
      path: testInfo.outputPath(
        `host-controls-${scenario.name.replace(" ", "-")}.png`
      ),
      fullPage: true,
    });
  });

  test(`Persistent host states survive hover in ${scenario.name}`, async ({
    page,
  }) => {
    await seedHostState(page, scenario.viewport, scenario.dark);

    if (scenario.viewport.width >= 600) {
      const gridControl = page.getByTestId("zoom-grid");
      await gridControl.click();
      await expect(gridControl).toHaveAttribute("aria-pressed", "true");
      await expectPersistentStyleOnHover(gridControl);
    }

    const activeTool = page.locator('[data-toolbar-item="select"]');
    await expectPersistentStyleOnHover(activeTool);

    const appMenuControl = page.getByRole("button", { name: "Open menu" });
    await appMenuControl.click();
    await expect(appMenuControl).toHaveAttribute("aria-expanded", "true");
    await expectPersistentStyleOnHover(appMenuControl);
  });
}
