import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

const runBinary = (
  cwd: string,
  args: readonly string[],
  input = "",
  env: NodeJS.ProcessEnv = process.env,
) => new Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}>((resolve) => {
  const child = spawn(process.execPath, [
    new URL("../dist/cli.js", import.meta.url).pathname,
    ...args,
  ], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input);
});

describe("chardesk executable", () => {
  it("serializes concurrent opens and sweeps malformed session records", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-cli-concurrent-open-"));
    temporaryDirectories.push(cwd);
    const env = { ...process.env, TMPDIR: cwd };
    expect((await runBinary(cwd, ["init", "board.chardesk", "--title", "Concurrent"], "", env)).code).toBe(0);
    const manifest = join(cwd, "board.chardesk");
    const opened = await Promise.all([
      runBinary(cwd, ["open", "board.chardesk", "--no-browser", "--json"], "", env),
      runBinary(cwd, ["open", manifest, "--no-browser", "--json"], "", env),
    ]);
    const sessions = opened.map((result) => JSON.parse(result.stdout) as { status: string; url: string });
    expect(opened.map((result) => result.code)).toEqual([0, 0]);
    expect(sessions[0]?.url).toBe(sessions[1]?.url);
    expect(sessions.map((session) => session.status).sort()).toEqual(["opened", "reused"]);

    const registry = join(cwd, "chardesk-sessions-v2");
    const records = (await readdir(registry)).filter((name) => name.endsWith(".json"));
    expect(records).toHaveLength(1);
    expect((await runBinary(cwd, ["close", "--all"], "", env)).code).toBe(0);
    await writeFile(join(registry, "malformed.json"), "{");
    expect((await runBinary(cwd, ["status"], "", env)).stdout).toBe("No active CharDesk sessions.\n");
    await expect(access(join(registry, "malformed.json"))).rejects.toThrow();
  }, 20_000);

  it("accepts Agent-authored CharGraph source over stdin", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-cli-bin-"));
    temporaryDirectories.push(cwd);
    const result = await runBinary(cwd, [
      "render", "-", "-o", "binary.png", "--json",
    ], [
      "```mermaid",
      "flowchart LR",
      "  Agent --> PNG",
      "```",
    ].join("\n"));

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rendered",
      renderer: "markdown",
    });
    await expect(access(join(cwd, "binary.png"))).resolves.toBeUndefined();
    expect(Array.from((await readFile(join(cwd, "binary.png"))).slice(0, 4)))
      .toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("inspects stdin without producing an artifact", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-cli-bin-"));
    temporaryDirectories.push(cwd);
    const result = await runBinary(cwd, ["inspect", "-", "--json"], "# Valid");

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "valid",
      renderer: "markdown",
      diagnostics: [],
    });
  });

  it("keeps one live session for every path to the same workspace", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "chardesk-cli-open-"));
    temporaryDirectories.push(cwd);
    const env = { ...process.env, TMPDIR: cwd };
    expect((await runBinary(cwd, ["init", "board.chardesk", "--title", "Live"], "", env)).code).toBe(0);

    const first = JSON.parse((await runBinary(
      cwd,
      ["open", "board.chardesk", "--no-browser", "--json"],
      "",
      env,
    )).stdout) as { status: string; url: string; watching: boolean };
    expect(first).toMatchObject({ status: "opened", watching: true });

    const manifest = join(cwd, "board.chardesk");
    const canonical = await realpath(manifest);
    const recordName = `${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}.json`;
    const recordPath = join(cwd, "chardesk-sessions-v2", recordName);
    const originalRecord = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>;
    await writeFile(manifest, "Revised\n");
    await writeFile(recordPath, JSON.stringify({ ...originalRecord, cliVersion: "0.3.0" }));

    const second = JSON.parse((await runBinary(
      cwd,
      ["open", manifest, "--no-browser", "--json"],
      "",
      env,
    )).stdout) as { status: string; url: string };
    await symlink(manifest, join(cwd, "board-link.chardesk"));
    const third = JSON.parse((await runBinary(
      cwd,
      ["open", "board-link.chardesk", "--no-browser", "--json"],
      "",
      env,
    )).stdout) as { status: string; url: string };
    const currentRecord = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>;

    expect(second).toMatchObject({ status: "reused", url: first.url });
    expect(third).toMatchObject({ status: "reused", url: first.url });
    expect(currentRecord.pid).toBe(originalRecord.pid);
    expect(await (await fetch(new URL("document", first.url))).text()).toContain("Revised");

    const legacyRoot = join(cwd, "chardesk-sessions-v1", "legacy-patch");
    const legacyRecord = join(legacyRoot, "session.json");
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(legacyRecord, JSON.stringify({ ...currentRecord, version: 2 }));
    const migrated = JSON.parse((await runBinary(
      cwd,
      ["open", "board.chardesk", "--no-browser", "--json"],
      "",
      env,
    )).stdout) as { status: string; url: string };
    expect(migrated.status).toBe("opened");
    expect(migrated.url).not.toBe(first.url);
    await expect(access(legacyRecord)).rejects.toThrow();

    const replacementRecord = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>;
    await writeFile(recordPath, JSON.stringify({ ...replacementRecord, runtimeVersion: 99 }));
    const incompatible = JSON.parse((await runBinary(
      cwd,
      ["open", "board.chardesk", "--no-browser", "--json"],
      "",
      env,
    )).stdout) as { status: string; url: string };
    expect(incompatible.status).toBe("opened");
    expect(incompatible.url).not.toBe(migrated.url);

    await new Promise((resolveWait) => setTimeout(resolveWait, 160));
    const status = JSON.parse((await runBinary(
      cwd,
      ["status", "board.chardesk", "--json"],
      "",
      env,
    )).stdout) as { sessions: Array<{ url: string; idleExpiresAt: number }> };
    expect(status.sessions).toHaveLength(1);
    expect(status.sessions[0]?.url).toBe(incompatible.url);
    expect(status.sessions[0]?.idleExpiresAt).toBeGreaterThan(Date.now());

    expect((await runBinary(cwd, ["close", "board.chardesk"], "", env)).code).toBe(0);
  }, 40_000);
});
