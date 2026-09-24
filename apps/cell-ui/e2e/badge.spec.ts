import { expect, test, type Locator } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

test.use({ colorScheme: "light" });

const examples = [
  { tone: "neutral", label: "Waiting" },
  { tone: "info", label: "Syncing" },
  { tone: "success", label: "Done" },
  { tone: "warning", label: "Delayed" },
  { tone: "error", label: "Failed" },
] as const;

const badgeCells = async (surface: Locator, id: string) => (await readCellProbe(surface)).cells
  .filter((cell) => cell.ownerId === id || cell.ownerId?.startsWith(`${id}/text`))
  .sort((left, right) => left.x - right.x);

test("Badge lays out every status with only presentation configuration in both themes and narrow viewports", async ({ page }) => {
  await page.goto("/#/components/badge");
  const surface = page.locator('[data-cell-probe="component-badge"]');
  for (const { tone, label } of examples) {
    expect((await badgeCells(surface, `component-badge-${tone}`)).map((cell) => cell.text).join(""))
      .toBe(` ${label} `);
    await expect(surface.locator(`[data-cell-semantic-id="component-badge-${tone}"]`))
      .toHaveAttribute("role", "paragraph");
  }
  await expect(surface.getByRole("button", { name: "tone" })).toHaveCount(0);
  await expect(surface.getByRole("button", { name: "presentation" })).toBeAttached();
  await expect(surface.getByRole("checkbox")).toHaveCount(0);
  expect((await readCellProbe(surface)).text).not.toContain("Activated:");

  for (const scheme of ["light", "dark"] as const) {
    if (await page.locator(".gallery-page").getAttribute("data-gallery-theme") !== scheme) {
      await page.getByRole("button", { name: scheme === "dark" ? "Dark" : "Light" }).click();
    }
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", scheme);
    for (const { tone } of examples) {
      const expected = await page.locator(".gallery-page").evaluate((element, tone) => {
        const style = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.style.color = style.getPropertyValue(`--cell-badge-${tone}-foreground`).trim();
        probe.style.backgroundColor = style.getPropertyValue(`--cell-badge-${tone}`).trim();
        element.append(probe);
        const colors = { color: getComputedStyle(probe).color, backgroundColor: getComputedStyle(probe).backgroundColor };
        probe.remove();
        return colors;
      }, tone);
      await expect.poll(async () => (await badgeCells(surface, `component-badge-${tone}`))[0]?.style)
        .toMatchObject(expected);
    }
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(async () => (await readCellProbe(surface)).viewport.width).toBeLessThan(64);
  const frame = await readCellProbe(surface);
  for (const { tone, label } of examples) {
    const cells = await badgeCells(surface, `component-badge-${tone}`);
    expect(cells.map((cell) => cell.text).join("")).toBe(` ${label} `);
    expect(cells.at(-1)!.x).toBeLessThan(frame.viewport.width);
  }
  expect(frame.text).toContain("presentation");
  expect(frame.text).toContain("─");
});

test("interactive Badge uses transient feedback without a counter; disabled stays inert", async ({ page }) => {
  await page.goto("/#/components/badge");
  const surface = page.locator('[data-cell-probe="component-badge"]');
  const retry = surface.getByRole("button", { name: "Retry" });
  const disabled = surface.getByRole("button", { name: "Disabled" });
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  expect((await badgeCells(surface, "component-badge-retry")).map((cell) => cell.text).join(""))
    .toBe(" Retry ");

  const guard = (await badgeCells(surface, "component-badge-retry"))[0]!;
  const point = await cellPoint(surface, guard.x, guard.y);
  await page.mouse.move(point.x, point.y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "component-badge-retry");
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-badge-retry");
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await retry.focus();
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.down(key);
    await expect(surface).toHaveAttribute("data-cell-press-active", "component-badge-retry");
    await page.keyboard.up(key);
    await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  }
  await retry.evaluate((element: HTMLElement) => element.click());
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  expect((await readCellProbe(surface)).text).not.toContain("Activated:");
  expect((await badgeCells(surface, "component-badge-retry")).map((cell) => cell.text).join(""))
    .toBe(" Retry ");

  const disabledGuard = (await badgeCells(surface, "component-badge-disabled"))[0]!;
  const disabledPoint = await cellPoint(surface, disabledGuard.x, disabledGuard.y);
  await page.mouse.move(disabledPoint.x, disabledPoint.y);
  await expect(surface).not.toHaveAttribute("data-cell-hovered", "component-badge-disabled");
  await page.mouse.down();
  await expect(surface).not.toHaveAttribute("data-cell-press-active", "component-badge-disabled");
  await page.mouse.up();
});
