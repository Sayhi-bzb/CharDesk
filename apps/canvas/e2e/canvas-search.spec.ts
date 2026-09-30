import { expect, test, type Page } from "@playwright/test";

const execute = (page: Page, name: string, input: Record<string, unknown>) => page.evaluate(async ({ name, input }) => {
  const context = (document as Document & { modelContext?: {
    getTools(): Promise<Array<{ name: string; readOnly?: boolean }>>;
    executeTool(tool: { name: string }, input: string): Promise<unknown>;
  } }).modelContext!;
  const tool = (await context.getTools()).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} is unavailable`);
  const result = await context.executeTool(tool, JSON.stringify(input));
  return typeof result === "string" ? JSON.parse(result) : result;
}, { name, input });

test("WebMCP renders, searches, and reads precise Unicode positions without moving the camera", async ({ page }) => {
  await page.goto("/?webmcp=polyfill");
  await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
  await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
  const zoom = await page.getByTestId("zoom-reset").textContent();
  const written = await execute(page, "chardesk_canvas_write", { at: [-100, -50], content: "**Needle** 你é" });
  expect(written).toMatchObject({ bounds: expect.any(Array) });
  const result = await execute(page, "chardesk_canvas_search", { query: "Needle", viewport: [-100, -50, 40, 5] });
  expect(result).toMatchObject({ canvasId: written.canvasId, matches: [{ viewport: [-108, -52, 32, 5], content: expect.stringContaining("Needle") }], next: null });
  expect(result.matches[0].content.split("\n")).toHaveLength(5);
  expect(result.matches[0].content).not.toMatch(/[┌┐└┘│┤┬]/u);
  const view = await execute(page, "chardesk_canvas_read", { viewport: result.matches[0].viewport });
  expect(view.content).toContain("Needle");
  expect(view.content).toContain("bold");
  expect((await execute(page, "chardesk_canvas_search", { query: "**Needle**", viewport: [-100, -50, 40, 5] })).matches).toEqual([]);
  expect((await execute(page, "chardesk_canvas_search", { query: "你é", viewport: [-100, -50, 40, 5] })).matches[0].content).toContain("你é");
  expect((await execute(page, "chardesk_canvas_read", { viewport: [-100, -50, 800, 240] })).mode).toBe("density");
  expect((await execute(page, "chardesk_canvas_search", { query: "Needle", viewport: [-100, -50, 800, 240] })).matches[0].viewport).toEqual([-108, -52, 32, 5]);
  await expect(page.getByTestId("zoom-reset")).toHaveText(zoom!);

  const many = Array.from({ length: 25 }, () => "PageNeedle").join("\n");
  await execute(page, "chardesk_canvas_write", { at: [-100, -100], content: many });
  const input = { query: "PageNeedle", viewport: [-100, -100, 20, 25] };
  const first = await execute(page, "chardesk_canvas_search", input);
  const second = await execute(page, "chardesk_canvas_search", { ...input, after: first.next });
  expect(first.matches).toHaveLength(20);
  expect(second.matches).toHaveLength(5);
  expect(second.next).toBeNull();
  expect(second.matches[0].viewport).toEqual([-108, -82, 32, 5]);
});

test("read-only CLI pages expose Canvas search without write", async ({ page }) => {
  await page.goto("/s/0123456789abcdefABCDEF/?webmcp=polyfill");
  await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
  const names = await page.evaluate(async () => {
    const context = (document as Document & { modelContext?: { getTools(): Promise<Array<{ name: string }>> } }).modelContext!;
    return (await context.getTools()).map(({ name }) => name).sort();
  });
  expect(names).toEqual(["chardesk_canvas_read", "chardesk_canvas_search", "chardesk_read_materials"]);
});
