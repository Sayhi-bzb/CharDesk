import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeCharDeskWorkspace } from "./init.js";
import {
  openManagedSession,
  serveManagedOpenSession,
  startCharDeskOpenSession,
} from "./open.js";

const directories: string[] = [];
const sessions: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("chardesk local Canvas", () => {
  it("reports a detached server failure without waiting for the startup deadline", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-managed-startup-"));
    directories.push(cwd);
    const board = await initializeCharDeskWorkspace({ cwd, directory: "board.chardesk", title: "Startup" });

    const error = await openManagedSession({
      options: { request: { input: board, inputMode: "auto" }, cwd },
      cliEntry: join(cwd, "missing-cli.js"),
      browser: false,
    }).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ code: "open-start-failed" });
    expect(error).toHaveProperty("message", expect.stringContaining("missing-cli.js"));
  }, 10_000);

  it("removes its owned registry record after the idle lease expires", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-managed-lease-"));
    directories.push(cwd);
    const runtimeRoot = join(cwd, "runtime");
    await mkdir(runtimeRoot);
    await writeFile(join(runtimeRoot, "index.html"), "<!doctype html><title>Local Canvas</title>");
    const board = await initializeCharDeskWorkspace({ cwd, directory: "board.chardesk", title: "Lease" });
    const sessionFile = join(cwd, "session.json");

    await expect(serveManagedOpenSession({
      options: {
        request: { input: board, inputMode: "auto" },
        cwd,
        runtimeRoot,
        idleTimeoutMs: 120,
      },
      sessionFile,
    })).resolves.toBe(0);
    await expect(access(sessionFile)).rejects.toThrow();
  });

  it("serves a tokenized same-origin runtime and live board projection", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-open-"));
    directories.push(cwd);
    const runtimeRoot = join(cwd, "runtime");
    await mkdir(join(runtimeRoot, "assets"), { recursive: true });
    await writeFile(
      join(runtimeRoot, "index.html"),
      '<!doctype html><title>Local Canvas</title><script src="./assets/app.js"></script>',
    );
    await writeFile(join(runtimeRoot, "assets/app.js"), "export const ready = true;");
    const board = await initializeCharDeskWorkspace({ cwd, directory: "board.chardesk", title: "Live" });
    const session = await startCharDeskOpenSession({
      request: { input: board, inputMode: "auto" },
      cwd,
      runtimeRoot,
    });
    sessions.push(session);

    expect(session.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/s\/[A-Za-z0-9_-]{22}\/$/u);
    const root = await fetch(session.url, { redirect: "manual" });
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("Local Canvas");
    expect(await (await fetch(new URL("assets/app.js", session.url))).text())
      .toContain("ready = true");
    expect((await fetch(new URL("/board", session.url))).status).toBe(404);

    const projection = await fetch(new URL("document", session.url));
    expect(projection.status).toBe(200);
    expect(await projection.text()).toContain("Live");

    const before = await (await fetch(new URL("health", session.url))).json();
    expect(before).toEqual({ status: "ready", runtimeReady: false });
    expect((await fetch(new URL("ready", session.url), { method: "POST" })).status).toBe(204);
    await expect(session.ready).resolves.toBeUndefined();
    const after = await (await fetch(new URL("health", session.url))).json();
    expect(after).toEqual({ status: "ready", runtimeReady: true });

    await writeFile(board, "Revised\n");
    expect(await (await fetch(new URL("document", session.url))).text()).toContain("Revised");
  });
});
