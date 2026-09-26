import { expect, test, type Locator } from "@playwright/test";
import { wordmark } from "../src/wordmark";

const cellPoint = (surface: Locator, x: number, y: number) => surface.evaluate((element, point) => {
  const probe = (element as HTMLElement & { __chardeskCellProbeV5?: {
    presentation: { metrics: { cellWidth: number; cellHeight: number } };
  } }).__chardeskCellProbeV5!;
  const bounds = element.querySelector("canvas")!.getBoundingClientRect();
  return {
    x: bounds.left + (point.x + 1.5) * probe.presentation.metrics.cellWidth,
    y: bounds.top + (point.y + 1.5) * probe.presentation.metrics.cellHeight,
  };
}, { x, y });

const copyCellRange = (surface: Locator) => surface.evaluate((element) => {
  const clipboard = new DataTransfer();
  element.dispatchEvent(new ClipboardEvent("copy", {
    bubbles: true, cancelable: true, clipboardData: clipboard,
  }));
  return clipboard.getData("text/plain");
});

for (const width of [320, 375, 720, 1440]) {
  test(`Cell UI navigation remains complete at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const surface = page.locator('[data-cell-probe="site-home"]');
    await expect(surface).toBeVisible();
    await expect(page.locator(".site-loading, .site-fallback")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Canvas" })).toHaveAttribute("href", "https://canvas.chardesk.com/");
    await expect(page.getByRole("link", { name: "Open Cell UI" })).toHaveAttribute("href", "https://ui.chardesk.com/");
    await expect.poll(() => surface.evaluate((element) => {
      const probe = (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } }).__chardeskCellProbeV5;
      return probe?.text.includes("Documentation") && probe.text.includes("GitHub");
    })).toBe(true);
    if (width === 1440 || width <= 375) {
      const frameText = await surface.evaluate((element) =>
        (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } }).__chardeskCellProbeV5?.text
      );
      if (width === 1440) {
        expect(frameText).toContain("Visual text for people and agents.");
        expect(wordmark).toHaveLength(6);
        for (const line of wordmark) {
          expect(Array.from(line)).toHaveLength(64);
          expect(frameText).toContain(line.trimEnd());
        }
      } else {
        expect(frameText).toContain("Visual text for");
        expect(frameText).toContain("people and agents.");
        expect(frameText).toContain("CHARDESK");
        expect(frameText).not.toContain(wordmark[0]);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("keyboard reaches the theme control and four product links", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-cell-probe="site-home"]');
  await expect(surface).toBeVisible();
  for (const id of ["site-theme", "site-canvas-link", "site-cell-ui-link", "site-docs", "site-github"]) {
    await page.keyboard.press("Tab");
    await expect.poll(() => surface.evaluate((element) =>
      (element as HTMLElement & { __chardeskCellProbeV5?: { focusedId: string | null } }).__chardeskCellProbeV5?.focusedId
    )).toBe(id);
  }
});

for (const width of [320, 1440]) {
  test(`ordinary drag selects and copies navigation text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const surface = page.locator('[data-cell-probe="site-home"]');
    await expect.poll(() => surface.evaluate((element) =>
      (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } })
        .__chardeskCellProbeV5?.text.includes("Cell UI ↗") ?? false)).toBe(true);
    const rows = (await surface.evaluate((element) =>
      (element as HTMLElement & { __chardeskCellProbeV5: { text: string } })
        .__chardeskCellProbeV5.text)).split("\n");
    const first = rows.findIndex((row) => row.includes("Visual text for"));
    const last = rows.findIndex((row) => row.includes("Cell UI ↗"));
    expect(last).toBeGreaterThan(first);
    const start = await cellPoint(surface, 1, first);
    const end = await cellPoint(surface, 9, last);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(surface).toHaveAttribute("data-cell-range");
    const copied = await copyCellRange(surface);
    expect(copied).toContain("Visual text for");
    expect(copied).toContain(width === 1440
      ? "Visual work people see and agents can revise." : "Shared visual work.");
    expect(page.url()).toBe("http://127.0.0.1:5199/");
  });
}

test("rectangle selection chord remains available on the navigation page", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-cell-probe="site-home"]');
  await expect.poll(() => surface.evaluate((element) =>
    (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } })
      .__chardeskCellProbeV5?.text.includes("Visual text for") ?? false)).toBe(true);
  const rows = (await surface.evaluate((element) =>
    (element as HTMLElement & { __chardeskCellProbeV5: { text: string } })
      .__chardeskCellProbeV5.text)).split("\n");
  const row = rows.findIndex((line) => line.includes("Visual text for"));
  const start = await cellPoint(surface, 1, row);
  const end = await cellPoint(surface, 9, row + 1);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  await expect(surface).toHaveAttribute("data-cell-range", `1,${row},9,2`);
  expect(await copyCellRange(surface)).not.toContain("Visual text for");
});

test("clicking a navigation link does not start a selection", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-cell-probe="site-home"]');
  await expect.poll(() => surface.evaluate((element) =>
    (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } })
      .__chardeskCellProbeV5?.text.includes("Documentation ↗") ?? false)).toBe(true);
  const rows = (await surface.evaluate((element) =>
    (element as HTMLElement & { __chardeskCellProbeV5: { text: string } })
      .__chardeskCellProbeV5.text)).split("\n");
  const y = rows.findIndex((row) => row.includes("Documentation ↗"));
  const x = rows[y]!.indexOf("Documentation ↗") + 2;
  const point = await cellPoint(surface, x, y);
  await page.mouse.click(point.x, point.y);
  await expect(page).toHaveURL(/\/docs\/$/u);
});

test("theme toggle keeps the page and canvas guard in sync across reloads", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-cell-probe="site-home"]');
  const linkColor = () => surface.evaluate((element) => {
    const probe = (element as HTMLElement & { __chardeskCellProbeV5?: {
      cells: { ownerId: string | null; style: { color?: string } }[];
    } }).__chardeskCellProbeV5;
    return probe?.cells.find((cell) => cell.ownerId === "site-canvas-link")?.style.color;
  });
  const clickThemeCell = async () => {
    await expect.poll(() => surface.evaluate((element) => {
      const probe = (element as HTMLElement & { __chardeskCellProbeV5?: {
        cells: { text: string }[];
      } }).__chardeskCellProbeV5;
      return probe?.cells.some((cell) => cell.text === "") ?? false;
    })).toBe(true);
    const point = await surface.evaluate((element) => {
      const probe = (element as HTMLElement & { __chardeskCellProbeV5?: {
        cells: { x: number; y: number; text: string }[];
        presentation: { metrics: { cellWidth: number; cellHeight: number } };
      } }).__chardeskCellProbeV5!;
      const cell = probe.cells.find((entry) => entry.text === "")!;
      const bounds = element.querySelector("canvas")!.getBoundingClientRect();
      return {
        x: bounds.left + (cell.x + 1.5) * probe.presentation.metrics.cellWidth,
        y: bounds.top + (cell.y + 1.5) * probe.presentation.metrics.cellHeight,
      };
    });
    await page.mouse.click(point.x, point.y);
  };
  const guardColor = () => surface.locator("canvas").first().evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data;
    return `rgb(${pixels[0]}, ${pixels[1]}, ${pixels[2]})`;
  });
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect.poll(guardColor).toBe("rgb(255, 255, 255)");
  await expect.poll(linkColor).toBe("#0969da");
  expect(await page.evaluate(async () => (await document.fonts.load("12px 'Symbols Nerd Font Mono'", "")).length))
    .toBeGreaterThan(0);
  await clickThemeCell();
  await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect.poll(guardColor).toBe("rgb(0, 0, 0)");
  await expect.poll(linkColor).toBe("#58a6ff");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");
  await expect.poll(guardColor).toBe("rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Switch to light theme" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-site-theme", "light");
  await expect.poll(guardColor).toBe("rgb(255, 255, 255)");
});

test("static product links remain when JavaScript is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5199/");
  await expect(page.locator(".site-fallback a")).toHaveCount(4);
  await expect(page.locator(".site-loading")).toBeHidden();
  await expect(page.locator(".site-startup-title:visible")).toHaveText("Welcome to CharDesk");
  await expect(page.locator(".site-fallback h1")).toHaveText("Visual text for people and agents.");
  expect(await page.evaluate(() => ({
    bodyMargin: getComputedStyle(document.body).margin,
    shellDisplay: getComputedStyle(document.querySelector(".site-shell")!).display,
    startupBorder: getComputedStyle(document.querySelector(".site-fallback")!).borderTopWidth,
  }))).toEqual({ bodyMargin: "0px", shellDisplay: "grid", startupBorder: "0px" });
  await context.close();
});

test("loading state replaces the HTML fallback until Cell UI is ready", async ({ page }) => {
  await page.route(/\/src\/main\.tsx/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".site-loading")).toBeVisible();
  await expect(page.locator(".site-fallback")).toBeHidden();
  await expect(page.locator(".site-loading-links")).toBeHidden();
  await expect(page.locator(".site-loading-links a")).toHaveCount(4);
  expect(await page.locator(".site-startup-body img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".site-loading-links")).toBeVisible({ timeout: 7000 });
});

test("saved dark theme applies before the React surface loads", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("chardesk-site-theme", "dark"));
  await page.route(/\/src\/main\.tsx/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".site-loading")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#000000");
});
