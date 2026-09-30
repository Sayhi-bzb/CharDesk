import { expect, test, type Page } from "@playwright/test";

const execute = (page: Page, name: string, input: Record<string, unknown>) =>
  page.evaluate(async ({ name, input }) => {
    const context = (document as Document & { modelContext?: {
      getTools(): Promise<Array<{ name: string }>>;
      executeTool(tool: { name: string }, input: string): Promise<unknown>;
    } }).modelContext!;
    const tool = (await context.getTools()).find((item) => item.name === name);
    if (!tool) throw new Error("Tool unavailable: " + name);
    const output = await context.executeTool(tool, JSON.stringify(input));
    return typeof output === "string" ? JSON.parse(output) : output;
  }, { name, input });

const names = (page: Page) => page.evaluate(async () => {
  const context = (document as Document & { modelContext?: {
    getTools(): Promise<Array<{ name: string }>>;
  } }).modelContext;
  return context ? (await context.getTools()).map((tool) => tool.name).sort() : [];
});
const ready = async (page: Page) => {
  await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
};
const editableNames = ["chardesk_canvas_list", "chardesk_canvas_read", "chardesk_canvas_search", "chardesk_canvas_write", "chardesk_read_materials"];
const readOnlyNames = editableNames.filter((name) => name !== "chardesk_canvas_write");

test.describe("WebMCP native Canvas", () => {
  test("discovers only Canvas and Materials capabilities", async ({ page }) => {
    await page.goto("/?webmcp=polyfill");
    await ready(page);
    await expect.poll(() => names(page)).toEqual(editableNames);
    const reference = await execute(page, "chardesk_read_materials", {});
    expect(reference).toMatchObject({ format: "text/markdown", content: expect.any(String) });
    expect(reference.content.length).toBeGreaterThan(100);
  });

  test("reads and pans without changing the human camera", async ({ page }) => {
    await page.goto("/?webmcp=polyfill");
    await ready(page);
    await execute(page, "chardesk_canvas_write", { at: [-20, -10], content: "**Sample**" });
    const zoom = await page.getByTestId("zoom-reset").textContent();
    const text = await execute(page, "chardesk_canvas_read", { viewport: [-20, -10, 80, 24] });
    expect(text).toMatchObject({ mode: "text", step: 1 });
    expect(text.content).toContain("Sample");
    expect(text.content).toContain("styles:");
    const moved = await execute(page, "chardesk_canvas_read", { viewport: [10, -10, 80, 24] });
    expect(moved.viewport[0]).toBe(text.viewport[0] + 30);
    expect(await execute(page, "chardesk_canvas_read", { viewport: [-20, -10, 160, 48] }))
      .toMatchObject({ mode: "projection", step: 2 });
    const density = await execute(page, "chardesk_canvas_read", { viewport: [-20, -10, 800, 240] });
    expect(density).toMatchObject({ mode: "density", step: 10 });
    expect(density.content).toContain("Styles omitted:");
    await expect(page.getByTestId("zoom-reset")).toHaveText(zoom!);
  });

  test("writes rendered Unicode and searches the resulting Cells", async ({ page }) => {
    await page.goto("/?webmcp=polyfill");
    await ready(page);
    const written = await execute(page, "chardesk_canvas_write", { at: [-20, -10], content: "Hello, 世界\nABCD" });
    expect(written).toMatchObject({ bounds: [-20, -10, 11, 2] });
    expect((await execute(page, "chardesk_canvas_read", { viewport: written.bounds })).content).toContain("Hello, 世界");
    await execute(page, "chardesk_canvas_write", { at: [-20, -9], content: "X " });
    expect((await execute(page, "chardesk_canvas_read", { viewport: [-20, -9, 4, 1] })).content).toContain("X CD");
    const markdown = await execute(page, "chardesk_canvas_write", { at: [100, 50], content: "**Rendered** [link](https://example.com)" });
    const rendered = await execute(page, "chardesk_canvas_read", { viewport: markdown.bounds });
    expect(rendered.content).toContain("Rendered");
    expect(rendered.content).not.toContain("**Rendered**");
    expect(rendered.content).toContain("bold");
    expect(rendered.content).toContain('link:"https://example.com"');
    expect((await execute(page, "chardesk_canvas_search", { query: "Rendered" })).matches).toHaveLength(1);
  });

  test("registers independently in top-level pages", async ({ context, page }) => {
    await page.goto("/?webmcp=polyfill");
    await ready(page);
    const second = await context.newPage();
    await second.goto("/?webmcp=polyfill");
    await ready(second);
    await expect.poll(() => names(second)).toEqual(editableNames);
    await page.close();
    await expect.poll(() => names(second)).toEqual(editableNames);
  });

  test("local document previews expose no write or legacy file tools", async ({ page }) => {
    await page.goto("/s/0123456789abcdefABCDEF/?webmcp=polyfill");
    await ready(page);
    await expect.poll(() => names(page)).toEqual(readOnlyNames);
  });

  test("retired routes without identity return to Workspace and create nothing", async ({ page }) => {
    await page.goto("/blackboard?webmcp=polyfill");
    await expect(page).toHaveURL(/workspace$/);
    await expect(page.getByRole("table", { name: "My workspace" })).toBeVisible();
    await expect(page.locator('[data-work-kind="retired"]')).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "disposed");
  });
});
