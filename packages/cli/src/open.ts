import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { startDocumentPreview, type DocumentPreviewSession } from "./preview-server.js";
import { parseCharDeskDocumentEnvelope } from "@chardesk/document";
import launchBrowser from "open";
import {
  CharDeskCliCommandError,
  resolveCharDeskInput,
  type CharDeskInputRequest,
} from "./input.js";
import { compileSource } from "./render.js";
import { renderSourceInRasterProcess } from "./raster-process.js";

type OpenSessionOptions = {
  request: CharDeskInputRequest;
  cwd: string;
  port?: number;
  runtimeRoot?: string;
  sessionId?: string;
  idleTimeoutMs?: number;
};

type ManagedSessionRecord = {
  version: 4;
  runtimeVersion: 2;
  cliVersion: string;
  sessionId: string;
  pid: number;
  input: string;
  url: string;
  startedAt: number;
};

type ManagedOpenResult = ManagedSessionRecord & {
  status: "opened" | "reused" | "fallback";
  runtimeReady: boolean;
  fallbackOutput?: string;
  message?: string;
  lastActivityAt: number;
  idleExpiresAt: number;
};

type ManagedSessionHealth = {
  status: string;
  runtimeReady: boolean;
  sessionId: string;
  lastActivityAt: number;
  idleExpiresAt: number;
};

const CLI_VERSION = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const SESSION_ROOT = join(tmpdir(), "chardesk-sessions-v2");
const LEGACY_SESSION_ROOT = join(tmpdir(), "chardesk-sessions-v1");
const SESSION_RECORD_VERSION = 4;
const RUNTIME_VERSION = 2;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const SESSION_LOCK_STALE_MS = 15_000;
const SESSION_LOCK_TIMEOUT_MS = 20_000;
const SESSION_START_TIMEOUT_MS = 20_000;
const SESSION_START_ERROR_LIMIT = 4_096;
const runtimeRoot = () => new URL("./runtime/", import.meta.url).pathname;

const resolveOpenInput = async (cwd: string, input: string) => {
  const requested = resolve(cwd, input);
  const checked = await realpath(requested);
  if ((await stat(checked)).isDirectory() || !checked.endsWith(".chardesk")) {
    throw new CharDeskCliCommandError("invalid-live-input", "open requires a .chardesk file. Convert legacy works with chardesk migrate first.");
  }
  return checked;
};

const sessionKey = (input: string) => createHash("sha256").update(input).digest("hex").slice(0, 24);
const sessionFileForInput = (input: string, root = SESSION_ROOT) =>
  join(root, `${sessionKey(input)}.json`);

const delay = (milliseconds: number) => new Promise((resolveDelay) =>
  setTimeout(resolveDelay, milliseconds)
);

const writeSession = async (path: string, record: ManagedSessionRecord) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

const withSessionLock = async <T>(sessionFile: string, action: () => Promise<T>) => {
  const lock = `${sessionFile}.lock`;
  const token = randomBytes(12).toString("hex");
  const deadline = Date.now() + SESSION_LOCK_TIMEOUT_MS;
  await mkdir(dirname(sessionFile), { recursive: true });
  while (true) {
    try {
      await mkdir(lock);
      await writeFile(join(lock, "owner.json"), JSON.stringify({ token, pid: process.pid, createdAt: Date.now() }));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lock).then((value) => Date.now() - value.mtimeMs).catch(() => 0);
      if (age > SESSION_LOCK_STALE_MS) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new CharDeskCliCommandError("session-lock-timeout", "CharDesk local Canvas startup is busy.");
      }
      await delay(80);
    }
  }
  try {
    return await action();
  } finally {
    const owner = await readFile(join(lock, "owner.json"), "utf8")
      .then((value) => JSON.parse(value) as { token?: string })
      .catch(() => null);
    if (owner?.token === token) await rm(lock, { recursive: true, force: true });
  }
};

const sessionEndpoint = (value: Record<string, unknown>, endpoint: string) => {
  if (typeof value.url !== "string") return null;
  try {
    const url = new URL(endpoint, value.url.endsWith("/") ? value.url : `${value.url}/`);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      ? url
      : null;
  } catch {
    return null;
  }
};

const retireSession = async (value: Record<string, unknown>, path: string) => {
  const closeUrl = sessionEndpoint(value, "close");
  if (closeUrl) {
    await fetch(closeUrl, {
      method: "POST",
      signal: AbortSignal.timeout(1_000),
    }).catch(() => undefined);
  }
  await rm(path, { force: true });
};

const cleanLegacySessions = async () => {
  let directories;
  try {
    directories = await readdir(LEGACY_SESSION_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(directories.filter((entry) => entry.isDirectory()).map(async (directory) => {
    const root = join(LEGACY_SESSION_ROOT, directory.name);
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      return;
    }
    await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
      const path = join(root, name);
      try {
        const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        await retireSession(value, path);
      } catch {
        await rm(path, { force: true });
      }
    }));
  }));
};

const readSession = async (path: string): Promise<ManagedSessionRecord | null> => {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (value.version !== SESSION_RECORD_VERSION || value.runtimeVersion !== RUNTIME_VERSION) {
      await retireSession(value, path);
      return null;
    }
    const valid = typeof value.cliVersion === "string"
      && typeof value.sessionId === "string"
      && typeof value.pid === "number"
      && typeof value.input === "string"
      && typeof value.url === "string"
      && typeof value.startedAt === "number";
    if (!valid) {
      await retireSession(value, path);
      return null;
    }
    return value as ManagedSessionRecord;
  } catch {
    await rm(path, { force: true });
    return null;
  }
};

const health = async (session: ManagedSessionRecord) => {
  try {
    const response = await fetch(new URL("health", session.url), {
      cache: "no-store",
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return null;
    const current = await response.json() as Partial<ManagedSessionHealth>;
    return current.status === "ready"
      && current.sessionId === session.sessionId
      && typeof current.runtimeReady === "boolean"
      && typeof current.lastActivityAt === "number"
      && typeof current.idleExpiresAt === "number"
      ? current as ManagedSessionHealth
      : null;
  } catch {
    return null;
  }
};

const waitFor = async <T>(read: () => Promise<T | null>, timeout = 8_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(80);
  }
  return null;
};

const removeOwnedSession = async (path: string, sessionId: string) => {
  const current = await readFile(path, "utf8")
    .then((value) => JSON.parse(value) as { sessionId?: string })
    .catch(() => null);
  if (current?.sessionId === sessionId) await rm(path, { force: true });
};

const validateSource = async (options: OpenSessionOptions) => {
  const readable = await resolveOpenInput(options.cwd, options.request.input);
  const document = parseCharDeskDocumentEnvelope(await readFile(readable, "utf8"));
  if (document?.mode === "slide") return;
  const input = await resolveCharDeskInput({ request: options.request, cwd: options.cwd });
  if (document && !input.source.trim()) return;
  const compiled = await compileSource({ source: input.source, inputMode: input.inputMode });
  if (compiled.diagnostics.length > 0) {
    throw new CharDeskCliCommandError(
      "invalid-source",
      compiled.diagnostics.map((item) => item.message).join("\n"),
    );
  }
};

const renderFallback = async (options: OpenSessionOptions, input: string) => {
  const resolved = await resolveCharDeskInput({ request: options.request, cwd: options.cwd });
  const rendered = await renderSourceInRasterProcess({
    source: resolved.source,
    inputMode: resolved.inputMode,
    scale: 2,
    padding: 16,
  });
  const output = join(tmpdir(), `chardesk-${sessionKey(input)}.png`);
  await writeFile(output, rendered.bytes);
  return output;
};

export const startCharDeskOpenSession = async (
  options: OpenSessionOptions,
): Promise<DocumentPreviewSession> => {
  if (options.request.input === "-") {
    throw new CharDeskCliCommandError("invalid-live-input", "open requires a file or directory path.");
  }
  await validateSource(options);
  const input = await resolveOpenInput(options.cwd, options.request.input);
  const token = randomBytes(16).toString("base64url");
  return startDocumentPreview({
    board: { root: dirname(input), path: input },
    port: options.port ?? 0,
    appRoot: options.runtimeRoot ?? runtimeRoot(),
    prefix: `/s/${token}`,
    sessionId: options.sessionId,
    idleTimeoutMs: options.idleTimeoutMs,
  });
};

export const launchCharDeskOpenSession = async (session: DocumentPreviewSession) => {
  await launchBrowser(session.url);
};

export const waitForOpenSession = async (session: DocumentPreviewSession) => {
  await new Promise<void>((resolveWait) => {
    const close = () => void session.close().finally(resolveWait);
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
};

export const serveManagedOpenSession = async ({
  options,
  sessionFile,
}: {
  options: OpenSessionOptions;
  sessionFile: string;
}) => {
  const input = await resolveOpenInput(options.cwd, options.request.input);
  const sessionId = randomBytes(16).toString("base64url");
  const running = await startCharDeskOpenSession({
    ...options,
    sessionId,
    idleTimeoutMs: options.idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS,
  });
  const record: ManagedSessionRecord = {
    version: SESSION_RECORD_VERSION,
    runtimeVersion: RUNTIME_VERSION,
    cliVersion: CLI_VERSION,
    sessionId,
    pid: process.pid,
    input,
    url: running.url,
    startedAt: Date.now(),
  };
  await writeSession(sessionFile, record);
  const removeRecord = () => withSessionLock(sessionFile, () =>
    removeOwnedSession(sessionFile, sessionId)
  );
  const close = () => void running.close().catch(() => undefined);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  await running.closed;
  await removeRecord();
  return 0;
};

export const openManagedSession = async ({
  options,
  cliEntry,
  browser = true,
}: {
  options: OpenSessionOptions;
  cliEntry: string;
  browser?: boolean;
}): Promise<ManagedOpenResult> => {
  if (options.request.input === "-") {
    throw new CharDeskCliCommandError("invalid-live-input", "open requires a file or directory path.");
  }
  await validateSource(options);
  await cleanLegacySessions();
  const input = await resolveOpenInput(options.cwd, options.request.input);
  const sessionFile = sessionFileForInput(input);
  const ensured = await withSessionLock(sessionFile, async () => {
    const existing = await readSession(sessionFile);
    const existingHealth = existing ? await waitFor(() => health(existing), 640) : null;
    if (existing && existingHealth) {
      return { session: existing, current: existingHealth, status: "reused" as const };
    }
    if (existing) await removeOwnedSession(sessionFile, existing.sessionId);
    const args = [cliEntry, "__serve", input, "--session-file", sessionFile];
    if (options.port) args.push("--port", String(options.port));
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let spawnError: Error | undefined;
    let startupError = "";
    child.once("error", (error) => { spawnError = error; });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      startupError = `${startupError}${chunk}`.slice(-SESSION_START_ERROR_LIMIT);
    });
    child.unref();
    const failureMessage = () => {
      const detail = startupError.trim();
      if (detail) return `CharDesk local Canvas did not start: ${detail}`;
      if (spawnError) return `CharDesk local Canvas did not start: ${spawnError.message}`;
      if (child.exitCode !== null) {
        return `CharDesk local Canvas exited during startup with code ${child.exitCode}.`;
      }
      if (child.signalCode !== null) {
        return `CharDesk local Canvas exited during startup after ${child.signalCode}.`;
      }
      return `CharDesk local Canvas did not start within ${SESSION_START_TIMEOUT_MS / 1_000} seconds.`;
    };
    try {
      const opened = await waitFor(async () => {
        if (spawnError || child.exitCode !== null || child.signalCode !== null) {
          throw new CharDeskCliCommandError("open-start-failed", failureMessage());
        }
        const session = await readSession(sessionFile);
        const current = session ? await health(session) : null;
        return session && current ? { session, current } : null;
      }, SESSION_START_TIMEOUT_MS);
      if (!opened) {
        child.kill("SIGTERM");
        throw new CharDeskCliCommandError("open-start-failed", failureMessage());
      }
      return { ...opened, status: "opened" as const };
    } finally {
      child.stderr?.destroy();
    }
  });
  const active = {
    ...ensured.session,
    runtimeReady: ensured.current.runtimeReady,
    lastActivityAt: ensured.current.lastActivityAt,
    idleExpiresAt: ensured.current.idleExpiresAt,
  };
  if (!browser) return { ...active, status: ensured.status };
  if (ensured.status === "reused") {
    try {
      await launchBrowser(active.url);
      const ready = active.runtimeReady
        ? ensured.current
        : await waitFor(async () => {
          const current = await health(ensured.session);
          return current?.runtimeReady ? current : null;
        });
      if (ready) return {
        ...active,
        status: "reused",
        runtimeReady: true,
        lastActivityAt: ready.lastActivityAt,
        idleExpiresAt: ready.idleExpiresAt,
      };
    } catch {
      // The PNG fallback below keeps the user-visible result available.
    }
    return {
      ...active,
      status: "fallback",
      runtimeReady: false,
      fallbackOutput: await renderFallback(options, input),
      message: "The browser Canvas was unavailable; generated a PNG fallback.",
    };
  }
  try {
    await launchBrowser(active.url);
    const runtime = await waitFor(async () => {
      const current = await health(ensured.session);
      return current?.runtimeReady ? current : null;
    });
    if (runtime) return {
      ...active,
      status: "opened",
      runtimeReady: true,
      lastActivityAt: runtime.lastActivityAt,
      idleExpiresAt: runtime.idleExpiresAt,
    };
  } catch {
    // The PNG fallback below keeps the user-visible result available.
  }
  return {
    ...active,
    status: "fallback",
    runtimeReady: false,
    fallbackOutput: await renderFallback(options, input),
    message: "The browser Canvas was unavailable; generated a PNG fallback.",
  };
};

export const listManagedSessions = async (input?: string, cwd = process.cwd()) => {
  await cleanLegacySessions();
  const readActive = (sessionFile: string) => withSessionLock(sessionFile, async () => {
    const session = await readSession(sessionFile);
    if (!session) return null;
    const current = await waitFor(() => health(session), 640);
    if (!current) {
      await removeOwnedSession(sessionFile, session.sessionId);
      return null;
    }
    return {
      ...session,
      runtimeReady: current.runtimeReady,
      lastActivityAt: current.lastActivityAt,
      idleExpiresAt: current.idleExpiresAt,
    };
  });
  if (input) {
    const resolved = await resolveOpenInput(cwd, input);
    const session = await readActive(sessionFileForInput(resolved));
    return session ? [session] : [];
  }
  let names: string[];
  try {
    names = await readdir(SESSION_ROOT);
  } catch {
    return [];
  }
  const sessions = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) =>
    readActive(join(SESSION_ROOT, name))
  ));
  return sessions.filter((session): session is NonNullable<typeof session> => !!session);
};

export const closeManagedSessions = async (input?: string, cwd = process.cwd()) => {
  const sessions = await listManagedSessions(input, cwd);
  await Promise.all(sessions.map(async (session) => {
    const response = await fetch(new URL("close", session.url), {
      method: "POST",
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) {
      throw new CharDeskCliCommandError("close-failed", `Could not close ${session.input}.`);
    }
    await waitFor(async () => await health(session) ? null : true, 3_000);
    const sessionFile = sessionFileForInput(session.input);
    await withSessionLock(sessionFile, () => removeOwnedSession(sessionFile, session.sessionId));
  }));
  return sessions.length;
};
