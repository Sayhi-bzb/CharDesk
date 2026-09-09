import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

for (const colorScheme of ["light", "dark"] as const) {
for (const control of [
  { name: "Button", slug: "button", id: "component-button-save", marker: "", sampleOffset: 0 },
  { name: "Toggle", slug: "toggle", id: "component-toggle-bold", marker: "○", sampleOffset: 1 },
  { name: "Radio", slug: "radio", id: "component-radio-dark", marker: "(", sampleOffset: 3 },
  { name: "Menu", slug: "complex", id: "menu-open", marker: "", sampleOffset: 0 },
]) {
test(`${control.name} presents two complete inverse/restore cycles after release (${colorScheme})`, async ({ page }) => {
  await page.emulateMedia({ colorScheme });
  await page.goto(control.slug === "complex" ? "/exp/web-tui/#/__fixtures/all" : `/exp/web-tui/#/components/${control.slug}`);
  if (await page.locator(".gallery-page").getAttribute("data-gallery-theme") !== colorScheme) {
    await page.getByRole("button", { name: colorScheme === "dark" ? "Dark" : "Light", exact: true }).click();
  }
  const probeId = control.slug === "complex" ? "complex" : `component-${control.slug}`;
  const surface = page.locator(`[data-cell-probe="${probeId}"]`);
  await surface.scrollIntoViewIfNeeded();
  await surface.focus();
  const probe = await readCellProbe(surface);
  const cell = probe.cells.find((cell) => cell.ownerId === control.id && cell.text.trim() === control.marker)!;
  expect(cell).toBeDefined();
  const canvas = surface.locator("canvas").first();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + (cell.x + 0.5) * bounds.width / probe.viewport.width,
    bounds.y + (cell.y + 0.5) * bounds.height / probe.viewport.height);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", control.id);
  const reference = await surface.evaluate((element, point) => {
    const surface = element as HTMLElement;
    const canvas = surface.querySelector("canvas")!;
    const pixel = () => Array.from(canvas.getContext("2d")!.getImageData(
      Math.floor((point.x + 0.5) * canvas.width / point.width),
      Math.floor((point.y + 0.5) * canvas.height / point.height), 1, 1,
    ).data);
    const samples: { phase: number | null; time: number; pixel: number[] }[] = [];
    const observer = new MutationObserver(() => {
      const value = surface.getAttribute("data-cell-confirmation-phase");
      const phase = value === null ? null : Number(value);
      if (samples.length && samples.at(-1)!.phase === phase) return;
      samples.push({ phase, time: performance.now(), pixel: pixel() });
      surface.dataset.confirmationSamples = JSON.stringify(samples);
      if (phase === null && samples.length > 1) observer.disconnect();
    });
    observer.observe(surface, { attributes: true, attributeFilter: ["data-cell-confirmation-phase"] });
    return pixel();
  // Sample stable chrome spacing: the value marker itself changes on activation.
  }, { x: cell.x + control.sampleOffset, y: cell.y, width: probe.viewport.width, height: probe.viewport.height });
  await page.mouse.up();
  await expect.poll(async () => JSON.parse(await surface.getAttribute("data-confirmation-samples") ?? "[]").length).toBe(5);
  const samples = JSON.parse(await surface.getAttribute("data-confirmation-samples") ?? "[]") as { phase: number | null; time: number; pixel: number[] }[];
  expect(samples.map((sample) => sample.phase)).toEqual([0, 1, 2, 3, null]);
  expect(samples[0]!.pixel).not.toEqual(reference);
  expect(samples[1]!.pixel).toEqual(reference);
  expect(samples[2]!.pixel).toEqual(samples[0]!.pixel);
  expect(samples[3]!.pixel).toEqual(reference);
  for (let i = 1; i < samples.length; i++) expect(samples[i]!.time - samples[i - 1]!.time).toBeGreaterThanOrEqual(70);
});
}
}

test("discrete Cell controls share press and activation-flash feedback", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
  const buttonSurface = page.getByLabel("Button component");
  const initial = await readCellProbe(buttonSurface);
  const saveCell = initial.cells.find((cell) => cell.ownerId === "component-button-save");
  const canvas = buttonSurface.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  expect(saveCell).toBeDefined();
  expect(bounds).not.toBeNull();
  const point = {
    x: bounds!.x + (saveCell!.x + 0.5) * bounds!.width / initial.viewport.width,
    y: bounds!.y + (saveCell!.y + 0.5) * bounds!.height / initial.viewport.height,
  };

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(buttonSurface).toHaveAttribute("data-cell-press-active", "component-button-save");
  const pressed = await readCellProbe(buttonSurface);
  const pressedCell = pressed.cells.find((cell) => (
    cell.ownerId === "component-button-save" && cell.x === saveCell!.x && cell.y === saveCell!.y
  ));
  expect(pressed.text).toContain("Save");
  expect(pressed.text).not.toContain("Saved");
  expect(pressedCell?.style.backgroundColor).toBeTruthy();
  expect(pressedCell?.style.color).toBeTruthy();

  await page.mouse.move(bounds!.x + bounds!.width + 10, point.y);
  await expect(buttonSurface).not.toHaveAttribute("data-cell-press-active");
  await page.mouse.move(point.x, point.y);
  await expect(buttonSurface).toHaveAttribute("data-cell-press-active", "component-button-save");
  await buttonSurface.evaluate((element) => {
    const probe = element as HTMLElement & {
      __cellActivationFlashTransitions?: (string | null)[];
    };
    probe.__cellActivationFlashTransitions = [];
    new MutationObserver(() => {
      probe.__cellActivationFlashTransitions?.push(
        probe.getAttribute("data-cell-activation-flash")
      );
    }).observe(probe, {
      attributes: true,
      attributeFilter: ["data-cell-activation-flash"],
    });
  });
  await page.mouse.up();
  await expect(buttonSurface).not.toHaveAttribute("data-cell-press-active");
  await expect.poll(() => buttonSurface.evaluate((element) => (
    element as HTMLElement & {
      __cellActivationFlashTransitions?: (string | null)[];
    }
  ).__cellActivationFlashTransitions), { timeout: 1_000 }).toEqual([
    "component-button-save",
    null,
    "component-button-save",
    null,
  ]);
  await expect(buttonSurface).not.toHaveAttribute("data-cell-activation-flash");
  expect((await readCellProbe(buttonSurface)).text).not.toContain("Saved");

  await page.goto("/exp/web-tui/#/components/select");
  const selectSurface = page.getByLabel("Select component");
  await selectSurface.focus();
  await page.keyboard.down("Enter");
  await expect(selectSurface).toHaveAttribute("data-cell-press-active", "component-select-trigger");
  await expect(page.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.up("Enter");
  await expect(selectSurface).not.toHaveAttribute("data-cell-press-active");
  await expect(selectSurface).not.toHaveAttribute("data-cell-activation-flash");
  await page.keyboard.press("ArrowDown");
  await expect(selectSurface).toHaveAttribute("data-cell-focused", "component-select-system");
  await selectSurface.evaluate((element) => {
    const probe = element as HTMLElement & {
      __cellSelectFlashTransitions?: (string | null)[];
    };
    probe.__cellSelectFlashTransitions = [];
    new MutationObserver(() => {
      probe.__cellSelectFlashTransitions?.push(
        probe.getAttribute("data-cell-activation-flash")
      );
    }).observe(probe, {
      attributes: true,
      attributeFilter: ["data-cell-activation-flash"],
    });
  });
  await page.keyboard.down("Enter");
  await expect(page.getByRole("option", { name: "System" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toBeVisible();
  await expect(selectSurface).toHaveAttribute("data-cell-press-active", "component-select-system");
  await page.keyboard.up("Enter");
  await expect(selectSurface).not.toHaveAttribute("data-cell-press-active");
  await expect.poll(() => selectSurface.evaluate((element) => (
    element as HTMLElement & {
      __cellSelectFlashTransitions?: (string | null)[];
    }
  ).__cellSelectFlashTransitions), { timeout: 1_000 }).toEqual([
    "component-select-system",
    null,
    "component-select-system",
    null,
  ]);
  await expect(page.getByRole("listbox", { name: "Theme options" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-expanded", "false");

  await page.goto("/exp/web-tui/#/components/checkbox");
  const checkboxSurface = page.getByLabel("Checkbox component");
  const autosave = page.getByRole("checkbox", { name: "Autosave" });
  await checkboxSurface.focus();
  await page.keyboard.down("Space");
  await expect(checkboxSurface).toHaveAttribute("data-cell-press-active", "component-checkbox-autosave");
  await expect(autosave).toHaveAttribute("aria-checked", "false");
  await page.keyboard.up("Space");
  await expect(checkboxSurface).not.toHaveAttribute("data-cell-press-active");
  await expect(checkboxSurface).toHaveAttribute("data-cell-activation-flash", "component-checkbox-autosave");
});
