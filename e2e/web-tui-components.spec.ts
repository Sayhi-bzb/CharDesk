import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { galleryFontSelect } from "./helpers/gallery-font-select";

const navigationGroups = [
  {
    name: "Components",
    links: [
      ["Button", "#/components/button"],
      ["Select", "#/components/select"],
      ["Slider", "#/components/slider"],
      ["Checkbox", "#/components/checkbox"],
      ["Input", "#/components/input"],
      ["ScrollArea", "#/components/scroll-area"],
    ],
  },
  {
    name: "Primitives",
    links: [
      ["Text", "#/components/text"],
      ["Box", "#/components/box"],
    ],
  },
  {
    name: "Collections",
    links: [["List", "#/components/list"]],
  },
] as const;

test("component catalog drives concise, addressable documentation", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(page.locator(".gallery-brand")).toHaveAttribute("href", "#/components/button");
  await expect(nav.getByRole("link")).toHaveCount(9);
  for (const groupDefinition of navigationGroups) {
    const group = nav.getByRole("group", { name: groupDefinition.name });
    await expect(group).toBeVisible();
    await expect(group.getByRole("link")).toHaveText(groupDefinition.links.map(([name]) => name));
    for (const [name, href] of groupDefinition.links) {
      await expect(group.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
  }
  await expect(nav.getByRole("link", { name: "Button", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distribution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API" })).toBeVisible();
  await expect(page.getByText("private workspace package", { exact: false })).toBeVisible();
  await expect(page.getByText("not published to npm", { exact: false })).toBeVisible();
  await expect(page.locator(".docs-preview canvas")).toHaveCount(1);
  await expect(galleryFontSelect(page).locator("canvas")).toHaveCount(1);
  await expect(page.locator("#core, #complex, #editor, #overlay, #virtualization")).toHaveCount(0);

  await nav.getByRole("link", { name: "Box", exact: true }).click();
  await expect(page).toHaveURL(/#\/components\/box$/);
  await expect(page.getByRole("heading", { name: "Box", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Box", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("unknown component routes fail honestly", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/missing");
  await expect(page.getByRole("heading", { name: "Component not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Button" })).toHaveAttribute("href", "#/components/button");
});

test("Text and Box expose Cell-native content and layout", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/text");
  const text = await readCellProbe(page.locator('[data-cell-probe="component-text"]'));
  for (const line of [
    "◆ Plain text · READY",
    "→ Unicode: 世界 👋",
    "↔ Move: ← ↑ ↓ →",
    "✓ Status: PASS · IDLE",
    "∞ Math: ≠ ≤ ≥ ± × ÷",
    "▓ Signal: ░▒▓█",
    "⣿ Cell: \ue0b0 \uee03 \uf5ee",
    "Legacy: \u{1fb95} \u{1fbb0} \u{1fbc5}",
    "↳ Wraps on integer Cell",
  ]) expect(text.text).toContain(line);
  expect(text.viewport).toEqual({ width: 36, height: 14 });
  const wrappedRows = new Set(text.cells
    .filter((cell) => cell.ownerId === "component-text-wrap" && cell.text !== " ")
    .map((cell) => cell.y));
  expect(wrappedRows.size).toBeGreaterThan(1);

  await page.goto("/exp/web-tui/#/components/box");
  const box = await readCellProbe(page.locator('[data-cell-probe="component-box"]'));
  expect(box.text).toContain("Nested boxes");
  expect(box.text).toContain("Left");
  expect(box.text).toContain("Right");
  expect(box.cells.filter((cell) => cell.text === "┌").length).toBe(3);
});

test("Input edits Unicode through the real textbox and Cell frame", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/input");
  const surface = page.getByLabel("Input component");
  const input = page.getByRole("textbox", { name: "File name" });

  await expect(page.getByRole("heading", { name: "Input", level: 1 })).toBeVisible();
  await expect(input).toHaveValue("notes.txt");
  const initial = await readCellProbe(surface);
  expect(initial.viewport).toEqual({ width: 36, height: 4 });
  expect(initial.text).toContain("File name\n┌──────────────────────────────────┐");
  expect(initial.text).toContain("│notes.txt");

  await input.fill("世界 👋");
  await expect(input).toHaveValue("世界 👋");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("│世界 👋");
});

test("Button shares pointer, keyboard, disabled, and semantic behavior", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
  const surface = page.getByLabel("Button component");
  const save = page.getByRole("button", { name: "Save document" });
  const disabled = page.getByRole("button", { name: "Disabled" });

  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(save).not.toHaveAttribute("aria-disabled");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  const initial = await readCellProbe(surface);
  const saveCell = initial.cells.find((cell) => cell.ownerId === "component-button-save");
  const canvasBounds = await surface.locator("canvas").boundingBox();
  expect(saveCell).toBeDefined();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.click(
    canvasBounds!.x + (saveCell!.x + 0.5) * canvasBounds!.width / initial.viewport.width,
    canvasBounds!.y + (saveCell!.y + 0.5) * canvasBounds!.height / initial.viewport.height,
  );
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("✓ Saved");

  await page.reload();
  const reloadedSurface = page.getByLabel("Button component");
  await surface.focus();
  await expect(page.getByRole("button", { name: "Save document" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readCellProbe(reloadedSurface)).text).toContain("✓ Saved");

  await page.getByRole("button", { name: "Disabled" }).evaluate((element: HTMLElement) => element.click());
  await expect(reloadedSurface).toHaveAttribute("data-cell-focused", "component-button-save");
});

test("Select opens a Cell listbox and commits only explicit activation", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/select");
  const surface = page.getByLabel("Select component");
  const trigger = page.getByRole("button", { name: "Theme" });

  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await surface.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toBeAttached();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Dark" })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "System" })).toBeFocused();
  await expect(page.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect((await readCellProbe(surface)).text).toContain("Dark");

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("System");

  await trigger.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "Light" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Light");
});

test("Checkbox exposes copy-stable tri-state controls through every input channel", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/checkbox");
  const surface = page.getByLabel("Checkbox component");
  const autosave = page.getByRole("checkbox", { name: "Autosave" });
  const wordWrap = page.getByRole("checkbox", { name: "Word wrap" });
  const selectAll = page.getByRole("checkbox", { name: "Select all" });
  const disabled = page.getByRole("checkbox", { name: "Disabled" });

  await expect(page.getByRole("checkbox")).toHaveCount(4);
  await expect(autosave).toHaveAttribute("aria-checked", "true");
  await expect(wordWrap).toHaveAttribute("aria-checked", "false");
  await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  expect((await readCellProbe(surface)).text).toContain([
    "[x] Autosave",
    "[ ] Word wrap",
    "[-] Select all",
    "[ ] Disabled",
  ].join("\n"));

  await surface.focus();
  await expect(autosave).toBeFocused();
  await page.keyboard.press("Space");
  await expect(autosave).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("ArrowDown");
  await expect(wordWrap).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(wordWrap).toHaveAttribute("aria-checked", "true");

  const probe = await readCellProbe(surface);
  const selectAllCell = probe.cells.find((cell) => cell.ownerId === "component-checkbox-select-all");
  const canvasBounds = await surface.locator("canvas").boundingBox();
  expect(selectAllCell).toBeDefined();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.click(
    canvasBounds!.x + (selectAllCell!.x + 0.5) * canvasBounds!.width / probe.viewport.width,
    canvasBounds!.y + (selectAllCell!.y + 0.5) * canvasBounds!.height / probe.viewport.height,
  );
  await expect(selectAll).toHaveAttribute("aria-checked", "true");
  await expect(surface).toHaveAttribute("data-cell-focused", "component-checkbox-select-all");

  await autosave.evaluate((element: HTMLElement) => element.click());
  await expect(autosave).toHaveAttribute("aria-checked", "true");
  await expect(surface).toHaveAttribute("data-cell-focused", "component-checkbox-autosave");
  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(disabled).toHaveAttribute("aria-checked", "false");
  await expect(surface).toHaveAttribute("data-cell-focused", "component-checkbox-autosave");
});

test("Slider shares stepped keyboard, precise pointer, and numeric semantics", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/slider");
  const surface = page.getByLabel("Slider component");
  const volume = page.getByRole("slider", { name: "Volume" });
  const disabled = page.getByRole("slider", { name: "Disabled" });

  await expect(page.getByRole("slider")).toHaveCount(5);
  await expect(volume).toHaveAttribute("aria-valuemin", "0");
  await expect(volume).toHaveAttribute("aria-valuemax", "100");
  await expect(volume).toHaveAttribute("aria-valuenow", "50");
  await expect(volume).toHaveAttribute("aria-valuetext", "50 percent");
  await expect(volume).toHaveAttribute("aria-orientation", "horizontal");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  const initial = await readCellProbe(surface);
  expect(initial.text).toContain("Volume                  50\n━━━━━━━━━━━━━┃────────────");
  expect(initial.text).toContain("Minimum                 0\n┃─────────────────────────");
  expect(initial.text).toContain("Maximum                 100\n━━━━━━━━━━━━━━━━━━━━━━━━━┃");

  await surface.focus();
  await expect(volume).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveAttribute("aria-valuenow", "51");
  await page.keyboard.press("End");
  await expect(volume).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("Home");
  await page.keyboard.press("PageUp");
  await expect(volume).toHaveAttribute("aria-valuenow", "10");

  const probe = await readCellProbe(surface);
  const targetCell = probe.cells.find((cell) => (
    cell.ownerId === "component-slider-volume" && cell.x === 20
  ));
  const disabledCell = probe.cells.find((cell) => cell.ownerId === "component-slider-disabled");
  const canvasBounds = await surface.locator("canvas").boundingBox();
  expect(targetCell).toBeDefined();
  expect(disabledCell).toBeDefined();
  expect(canvasBounds).not.toBeNull();
  const cellWidth = canvasBounds!.width / probe.viewport.width;
  const cellHeight = canvasBounds!.height / probe.viewport.height;
  await page.mouse.click(
    canvasBounds!.x + (targetCell!.x + 0.5) * cellWidth,
    canvasBounds!.y + (targetCell!.y + 0.5) * cellHeight,
  );
  await expect(volume).toHaveAttribute("aria-valuenow", "80");

  await page.mouse.move(canvasBounds!.x + 5.5 * cellWidth, canvasBounds!.y + 1.5 * cellHeight);
  await page.mouse.down();
  await page.mouse.move(canvasBounds!.x + 15.5 * cellWidth, canvasBounds!.y + 1.5 * cellHeight, { steps: 4 });
  await page.mouse.up();
  await expect(volume).toHaveAttribute("aria-valuenow", "60");

  await page.mouse.click(
    canvasBounds!.x + (disabledCell!.x + 0.5) * cellWidth,
    canvasBounds!.y + (disabledCell!.y + 0.5) * cellHeight,
  );
  await expect(disabled).toHaveAttribute("aria-valuenow", "40");
});

test("Cell Range clears when Preview focus moves outside its Surface", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/text");
  const surface = page.getByLabel("Text component");
  const canvas = surface.locator("canvas");
  const probe = await readCellProbe(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const selectRange = async () => {
    await page.keyboard.down("Alt");
    await page.keyboard.down("Meta");
    await page.mouse.move(bounds!.x + bounds!.width / probe.viewport.width / 2, bounds!.y + bounds!.height / probe.viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
    await page.keyboard.up("Alt");
    await expect(surface).toHaveAttribute("data-cell-range");
  };

  await selectRange();
  await page.getByRole("heading", { name: "Text", level: 1 }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");

  await selectRange();
  await page.getByRole("button", { name: /^(Dark|Light)$/ }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("List shares focus, selection, disabled state, and semantic actions", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/list");
  const surface = page.getByLabel("List component");
  const beta = page.getByRole("option", { name: "Beta" });
  const disabled = page.getByRole("option", { name: "Disabled" });
  await expect(page.getByRole("option")).toHaveCount(4);
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  await surface.focus();
  await expect(beta).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Gamma" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Alpha" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "component-list-alpha");
  await expect(page.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
});

test("ScrollArea responds to keyboard, wheel, and thumb drag without scrolling the page", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const initial = await readCellProbe(surface);

  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(initial.text);
  const paged = await readCellProbe(surface);
  const pageY = await page.evaluate(() => window.scrollY);
  await canvas.hover({ position: { x: 80, y: 50 } });
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(paged.text);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);

  const beforeDrag = await readCellProbe(surface);
  const thumb = beforeDrag.cells.find((cell) => "█▀▄".includes(cell.text)
    && cell.ownerId === "component-scroll-area");
  expect(thumb).toBeDefined();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const cellWidth = bounds!.width / beforeDrag.viewport.width;
  const cellHeight = bounds!.height / beforeDrag.viewport.height;
  await page.mouse.move(bounds!.x + (thumb!.x + 0.5) * cellWidth, bounds!.y + (thumb!.y + 0.5) * cellHeight);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + (thumb!.x + 0.5) * cellWidth,
    bounds!.y + Math.min(beforeDrag.viewport.height - 1.5, thumb!.y + 2.5) * cellHeight,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(beforeDrag.text);
});
