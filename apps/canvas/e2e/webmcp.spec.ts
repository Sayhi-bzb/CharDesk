import { expect, test } from "@playwright/test";

test.describe("WebMCP", () => {
  test.describe.configure({ mode: "serial" });

  test("copies a Blackboard range through read-only host controls", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/blackboard?webmcp=polyfill");
    await expect(page).toHaveURL(/workspace=/);
    const surface = page.getByTestId("canvas-editor-surface");

    await expect.poll(async () => {
      await surface.click({ position: { x: 320, y: 240 } });
      await page.keyboard.press("Meta+a");
      await surface.click({ button: "right", position: { x: 320, y: 240 } });
      const snapshot = page.getByRole("menuitem", { name: /Snapshot \(PNG\)/ });
      const ready = await snapshot.isEnabled().catch(() => false);
      await page.keyboard.press("Escape");
      return ready;
    }).toBe(true);

    await surface.click({ position: { x: 320, y: 240 } });
    await page.keyboard.press("Meta+a");
    await page.evaluate(() => navigator.clipboard.writeText("marker"));
    await page.keyboard.press("Meta+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("Blackboard");

    await surface.click({ button: "right", position: { x: 320, y: 240 } });
    await expect(page.getByRole("menuitem", { name: "Copy as Text" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Copy as ANSI" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Snapshot \(PNG\)/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Paste/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  });

  test("mounts only Blackboard host surfaces on desktop and phone", async ({ page }) => {
    const assertBlackboardChrome = async () => {
      await expect.poll(() => page.locator("html").getAttribute("data-webmcp-status"))
        .toBe("ready");
      await expect(page.getByRole("button", { name: "Toggle inspector" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
      await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(0);
      await expect(page.locator('[data-toolbar-item="shape-group"]')).toHaveCount(0);
      await expect(page.locator('[data-toolbar-item="bg"]')).toHaveCount(0);
      await expect(page.locator('[data-toolbar-item="fill"]')).toHaveCount(0);
      await expect(page.locator('[data-toolbar-item="pan"]')).toHaveCount(1);
      await expect(page.locator('[data-toolbar-item="select"]')).toHaveCount(1);
    };

    await page.goto("/blackboard?webmcp=polyfill");
    await assertBlackboardChrome();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await assertBlackboardChrome();
  });

  test("discovers and executes CharDesk tools through the development polyfill", async ({ page }) => {
    await page.goto("/blackboard?webmcp=polyfill");
    await expect(page).toHaveURL(/workspace=/);

    await expect.poll(() => page.locator("html").getAttribute("data-webmcp-status"))
      .toBe("ready");
    await expect(page.locator("html")).toHaveAttribute("data-webmcp-provider", "polyfill");
    await expect.poll(async () => page.evaluate(async () => {
      const context = (document as Document & {
        modelContext?: {
          getTools(): Promise<Array<{ name: string }>>;
          executeTool?: (tool: { name: string }, input: string) => Promise<unknown>;
        };
      }).modelContext;
      if (!context?.executeTool) return false;
      const tools = await context.getTools();
      const readMaterials = tools.find(
        ({ name }) => name === "chardesk_read_materials",
      );
      const listFiles = tools.find(({ name }) => name === "chardesk_blackboard_list_files");
      if (!readMaterials || !listFiles) return false;
      const materialOutput = await context.executeTool(readMaterials, "{}");
      const materialResult = typeof materialOutput === "string"
        ? JSON.parse(materialOutput)
        : materialOutput;
      if (
        materialResult?.format !== "text/markdown" ||
        typeof materialResult?.content !== "string" ||
        materialResult.content.length === 0
      ) return false;
      const output = await context.executeTool(listFiles, "{}");
      const files = typeof output === "string" ? JSON.parse(output) : output;
      return Array.isArray(files?.files);
    })).toBe(true);

    const result = await page.evaluate(async () => {
      const context = (document as Document & {
        modelContext?: {
          getTools(): Promise<Array<{ name: string }>>;
          executeTool?: (tool: { name: string }, input: string) => Promise<unknown>;
        };
      }).modelContext;
      if (!context?.executeTool) throw new Error("WebMCP executeTool is unavailable.");
      const tools = await context.getTools();
      const listFiles = tools.find(({ name }) => name === "chardesk_blackboard_list_files");
      if (!listFiles) throw new Error("Blackboard tools were not registered.");
      const output = await context.executeTool(listFiles, "{}");
      return {
        names: tools.map(({ name }) => name).sort(),
        output: typeof output === "string" ? JSON.parse(output) : output,
      };
    });

    expect(result.names).toEqual([
      "chardesk_blackboard_apply_patch",
      "chardesk_blackboard_check",
      "chardesk_blackboard_create_workspace",
      "chardesk_blackboard_delete_file",
      "chardesk_blackboard_list_files",
      "chardesk_blackboard_list_workspaces",
      "chardesk_blackboard_open_workspace",
      "chardesk_blackboard_read_file",
      "chardesk_blackboard_write_file",
      "chardesk_read_materials",
    ]);
    expect(result.output).toMatchObject({
      workspaceId: expect.any(String),
      revision: 1,
      files: ["blackboard.yaml", "panels/welcome.panel"],
    });
  });

  test("creates, opens, and visibly edits a Blackboard from the site root", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?webmcp=polyfill");

    await expect.poll(() => page.locator("html").getAttribute("data-webmcp-status"))
      .toBe("ready");

    const result = await page.evaluate(async () => {
      const context = (document as Document & {
        modelContext?: {
          getTools(): Promise<Array<{ name: string }>>;
          executeTool?: (tool: { name: string }, input: string) => Promise<unknown>;
        };
      }).modelContext;
      if (!context?.executeTool) throw new Error("WebMCP executeTool is unavailable.");
      const tools = new Map((await context.getTools()).map((tool) => [tool.name, tool]));
      const execute = async (name: string, input: Record<string, unknown>) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`${name} was not registered.`);
        const output = await context.executeTool!(tool, JSON.stringify(input));
        return typeof output === "string" ? JSON.parse(output) : output;
      };

      const created = await execute("chardesk_blackboard_create_workspace", {
        title: "Root Agent",
      });
      await execute("chardesk_blackboard_write_file", {
        path: "panels/welcome.panel",
        content: "Visible from chardesk.com/",
      });
      return {
        created,
        listed: await execute("chardesk_blackboard_list_workspaces", {}),
        read: await execute("chardesk_blackboard_read_file", {
          path: "panels/welcome.panel",
        }),
        checked: await execute("chardesk_blackboard_check", {}),
      };
    });

    expect(result.created).toMatchObject({ title: "Root Agent", revision: 1, active: true });
    await expect(page).toHaveURL(new RegExp(`workspace=${result.created.workspaceId}`));
    expect(result.listed.workspaces).toContainEqual(
      expect.objectContaining({
        id: result.created.workspaceId,
        title: "Root Agent",
        active: true,
      }),
    );
    expect(result.read).toMatchObject({
      workspaceId: result.created.workspaceId,
      content: "Visible from chardesk.com/",
    });
    expect(result.checked).toMatchObject({ ok: true, workspaceId: result.created.workspaceId });

    const surface = page.getByTestId("canvas-editor-surface");
    await expect.poll(async () => {
      await surface.click({ position: { x: 320, y: 240 } });
      await page.keyboard.press("Meta+a");
      await page.keyboard.press("Meta+c");
      return page.evaluate(() => navigator.clipboard.readText());
    }).toContain("Visible from chardesk.com/");
  });

  test("registers tools independently in every top-level page", async ({
    context,
    page,
  }) => {
    await page.goto("/?webmcp=polyfill");
    await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
    await expect.poll(() => page.evaluate(async () => {
      const modelContext = (document as Document & {
        modelContext?: { getTools(): Promise<unknown[]> };
      }).modelContext;
      return modelContext ? (await modelContext.getTools()).length : -1;
    })).toBe(10);

    const blackboard = await context.newPage();
    await blackboard.goto("/blackboard?webmcp=polyfill");
    await expect(blackboard.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
    await expect.poll(() => blackboard.evaluate(async () => {
      const modelContext = (document as Document & {
        modelContext?: { getTools(): Promise<unknown[]> };
      }).modelContext;
      return modelContext ? (await modelContext.getTools()).length : -1;
    })).toBe(10);

    await page.close();
    await expect(blackboard.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
    await expect.poll(() => blackboard.evaluate(async () => {
      const modelContext = (document as Document & {
        modelContext?: { getTools(): Promise<unknown[]> };
      }).modelContext;
      return modelContext ? (await modelContext.getTools()).length : -1;
    })).toBe(10);
  });

  test("keeps browser-persistent CRUD out of local CLI reader pages", async ({ page }) => {
    await page.goto("/s/0123456789abcdefABCDEF/?webmcp=polyfill");
    await expect(page.locator("html")).toHaveAttribute("data-webmcp-status", "ready");
    await expect.poll(() => page.evaluate(async () => {
      const modelContext = (document as Document & {
        modelContext?: { getTools(): Promise<Array<{ name: string }>> };
      }).modelContext;
      return modelContext ? (await modelContext.getTools()).map(({ name }) => name) : [];
    })).toEqual(["chardesk_read_materials"]);
  });
});
