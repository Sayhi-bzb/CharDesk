import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDocumentPreview } from "./preview-server.js";

const roots: string[] = [];
const close: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(close.splice(0).map((stop) => stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "chardesk-blackboard-server-"));
  const client = join(root, "app");
  roots.push(root);
  await mkdir(client);
  await writeFile(join(client, "index.html"), "<!doctype html><title>Blackboard</title>");
  const board = { root, path: join(root, "document.chardesk") };
  const running = await startDocumentPreview({ board, port: 0, appRoot: client });
  close.push(running.close);
  return { root, board, running };
};

describe("Blackboard Reader", () => {
  it("keeps an active reader leased and closes after client activity stops", async () => {
    const root = await mkdtemp(join(tmpdir(), "chardesk-blackboard-lease-"));
    const client = join(root, "app");
    roots.push(root);
    await mkdir(client);
    await writeFile(join(client, "index.html"), "<!doctype html><title>Blackboard</title>");
    const board = { root, path: join(root, "document.chardesk") };
    await writeFile(board.path, "Live");
    const running = await startDocumentPreview({
      board,
      port: 0,
      appRoot: client,
      prefix: "/s/0123456789abcdefABCDEF",
      sessionId: "lease-session",
      idleTimeoutMs: 200,
    });
    close.push(running.close);

    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
    const response = await fetch(new URL("document", running.url));
    expect(response.status).toBe(200);
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
    const health = await (await fetch(new URL("health", running.url))).json();
    expect(health).toMatchObject({
      status: "ready",
      sessionId: "lease-session",
      runtimeReady: false,
    });
    expect(health.idleExpiresAt).toBeGreaterThan(health.lastActivityAt);

    await expect(Promise.race([
      running.closed.then(() => "closed"),
      new Promise((resolveWait) => setTimeout(() => resolveWait("timeout"), 1_000)),
    ])).resolves.toBe("closed");
  });

  it("serves a missing board, revisions, and unchanged responses", async () => {
    const { board, running } = await fixture();
    expect((await fetch(new URL("document", running.url))).status).toBe(404);

    const source = "[1;32m登录[0m 👩‍💻";
    await writeFile(board.path, source);
    const current = await fetch(new URL("document", running.url));
    expect(current.status).toBe(200);
    expect(current.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(current.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(current.headers.get("x-chardesk-source-name")).toBe("document.chardesk");
    expect(await current.text()).toBe(source);

    const unchanged = await fetch(new URL("document", running.url), {
      headers: { "If-None-Match": current.headers.get("etag")! },
    });
    expect(unchanged.status).toBe(304);

    await writeFile(board.path, "[999mcurrent source[0m");
    const diagnostic = await fetch(new URL("document", running.url), {
      headers: { "If-None-Match": current.headers.get("etag")! },
    });
    expect(diagnostic.status).toBe(200);
    expect(diagnostic.headers.get("etag")).not.toBe(current.headers.get("etag"));
    expect(await diagnostic.text()).toBe("[999mcurrent source[0m");
  });

  it("serves the page and rejects writes and static traversal", async () => {
    const { running } = await fixture();
    const rootResponse = await fetch(running.url, { redirect: "manual" });
    const contentSecurityPolicy = rootResponse.headers.get("content-security-policy");
    expect(rootResponse.status).toBe(200);
    expect(contentSecurityPolicy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(contentSecurityPolicy).not.toContain("script-src 'self' 'unsafe-eval'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(await rootResponse.text()).toContain("Blackboard");
    expect((await fetch(new URL("blackboard", running.url))).status).toBe(404);
    expect((await fetch(new URL("document", running.url), { method: "POST" })).status).toBe(405);
    expect((await fetch(`${running.url}%2e%2e/package.json`)).status).toBe(404);
  });

  it("rejects a board symlink that escapes after startup", async () => {
    const { root, board, running } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "chardesk-blackboard-outside-"));
    roots.push(outside);
    const target = join(outside, "outside.chardesk");
    await writeFile(target, "outside");
    await symlink(target, board.path);
    expect((await fetch(new URL("document", running.url))).status).toBe(403);
    expect(root).not.toBe(outside);
  });

});
