import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AccountStore, BackupLimitError, MAX_ACCOUNT_BACKUP_BYTES, MAX_BACKUP_BYTES,
  assertBackupWithinLimits,
} from "./account-store.js";
import { createAccountApi } from "./account-api.js";
import { createSyncServer } from "./server.js";

describe("account catalog", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  it("authenticates with state and keeps works scoped to their owner", async () => {
    const directory = mkdtempSync(join(tmpdir(), "chardesk-account-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const store = new AccountStore(join(directory, "account.db"));
    cleanups.push(() => store.close());
    const github = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("access_token")) return Response.json({ access_token: "github-token" });
      return Response.json({ id: 17, login: "maker", avatar_url: null });
    });
    const server = createSyncServer({
      port: 0,
      logger: () => {},
      accountApi: createAccountApi({ store, github: { clientId: "client", clientSecret: "secret" },
        publicOrigin: "http://127.0.0.1:1234", appOrigin: "http://127.0.0.1:5173",
        allowedOrigins: new Set(["http://127.0.0.1:5173"]), fetchImpl: github }),
    });
    const { port } = await server.listen();
    cleanups.push(server.close);
    const base = `http://127.0.0.1:${port}`;
    const login = await fetch(`${base}/v1/account/login`, { redirect: "manual" });
    const stateCookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const authorize = new URL(login.headers.get("location")!);
    expect(authorize.hostname).toBe("github.com");
    const invalid = await fetch(`${base}/v1/account/callback?code=code&state=wrong`, {
      headers: { Cookie: stateCookie }, redirect: "manual",
    });
    expect(invalid.status).toBe(400);
    expect(github).not.toHaveBeenCalled();

    const callback = await fetch(`${base}/v1/account/callback?code=code&state=${authorize.searchParams.get("state")}`, {
      headers: { Cookie: stateCookie }, redirect: "manual",
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("http://127.0.0.1:5173/workspace?view=account");
    const sessionCookie = callback.headers.getSetCookie().find((value) => value.startsWith("chardesk_session="))!.split(";")[0]!;
    const headers = { Cookie: sessionCookie, Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" };
    const me = await fetch(`${base}/v1/account/me`, { headers });
    expect(await me.json()).toEqual({ user: { id: "github:17", login: "maker", avatarUrl: null },
      availableProviders: ["github"], linkedProviders: ["github"] });
    expect(me.headers.get("access-control-allow-credentials")).toBe("true");

    const created = await fetch(`${base}/v1/account/works`, {
      method: "POST", headers, body: JSON.stringify({ kind: "canvas", title: "Cloud draft" }),
    });
    expect(created.status).toBe(201);
    const { work } = await created.json() as { work: { id: string; contentStatus: string } };
    expect(work.contentStatus).toBe("not-uploaded");
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).works).toHaveLength(1);
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).limits)
      .toEqual({ maxWorkBytes: MAX_BACKUP_BYTES, maxAccountBytes: MAX_ACCOUNT_BACKUP_BYTES, usedBytes: 0 });
    expect((await (await fetch(`${base}/v1/account/works`)).status)).toBe(401);
    expect((await fetch(`${base}/v1/account/works/${work.id}`, {
      method: "DELETE", headers: { ...headers, Origin: "https://attacker.example" },
    })).status).toBe(403);
    expect((await fetch(`${base}/v1/account/works/${work.id}`, { method: "DELETE", headers })).status).toBe(200);
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).works).toHaveLength(0);

    const content = "---\nchardesk: document/v1\nmode: freeform\n---\nHello";
    const mismatched = await fetch(`${base}/v1/account/works/backups`, {
      method: "POST", headers, body: JSON.stringify({ kind: "slides", title: "Wrong kind", content }),
    });
    expect(mismatched.status).toBe(400);
    const oversized = await fetch(`${base}/v1/account/works/backups`, {
      method: "POST", headers, body: JSON.stringify({
        kind: "canvas", title: "Too large", content: content + "A".repeat(MAX_BACKUP_BYTES),
      }),
    });
    expect(oversized.status).toBe(413);
    const backedUp = await fetch(`${base}/v1/account/works/backups`, {
      method: "POST", headers, body: JSON.stringify({ kind: "canvas", title: "Saved canvas", content }),
    });
    expect(backedUp.status).toBe(201);
    const backup = (await backedUp.json() as { work: { id: string; contentStatus: string; contentBytes: number } }).work;
    expect(backup).toMatchObject({ contentStatus: "uploaded", contentBytes: Buffer.byteLength(content) });
    expect(await (await fetch(`${base}/v1/account/works/${backup.id}/content`, { headers })).json())
      .toEqual({ title: "Saved canvas", content, revision: 1 });
    expect((await fetch(`${base}/v1/account/works/${backup.id}`, {
      method: "PATCH", headers, body: JSON.stringify({ title: "Unversioned rename" }),
    })).status).toBe(409);
    const updatedContent = `${content}!`;
    const update = await fetch(`${base}/v1/account/works/${backup.id}/content`, {
      method: "PUT", headers, body: JSON.stringify({ title: "Saved canvas 2", content: updatedContent, expectedRevision: 1 }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).work).toMatchObject({ title: "Saved canvas 2", revision: 2 });
    const conflict = await fetch(`${base}/v1/account/works/${backup.id}/content`, {
      method: "PUT", headers, body: JSON.stringify({ title: "Stale", content, expectedRevision: 1 }),
    });
    expect(conflict.status).toBe(409);
    expect(await (await fetch(`${base}/v1/account/works/${backup.id}/content`, { headers })).json())
      .toEqual({ title: "Saved canvas 2", content: updatedContent, revision: 2 });
    expect((await fetch(`${base}/v1/account/works/${backup.id}/content`)).status).toBe(401);
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).works)
      .toMatchObject([{ id: backup.id, contentStatus: "uploaded" }]);
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).limits.usedBytes)
      .toBe(Buffer.byteLength(updatedContent));
    expect((await fetch(`${base}/v1/account/works/${backup.id}`, { method: "DELETE", headers })).status).toBe(200);
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).limits.usedBytes).toBe(0);
    expect((await fetch(`${base}/v1/account/works/${backup.id}/content`, { headers })).status).toBe(404);
    expect((await fetch(`${base}/v1/account/works/backups`, {
      method: "POST", headers, body: JSON.stringify({ kind: "canvas", title: "Orphan conflict",
        content, conflictWith: backup.id }),
    })).status).toBe(400);

    const blackboardSource = JSON.stringify({ chardesk: "blackboard/source-v1", files: [
      { path: "blackboard.yaml", content: "draft manifest" },
      { path: "panels/one.panel", content: "# Source" },
    ] });
    const board = await fetch(`${base}/v1/account/works/backups`, {
      method: "POST", headers, body: JSON.stringify({ kind: "blackboard", title: "Source board", content: blackboardSource }),
    });
    expect(board.status).toBe(400);
    const boardId = store.createBackup("github:17", "blackboard", "Source board", blackboardSource).id;
    expect((await fetch(`${base}/v1/account/works/${boardId}/content`, { method: "PUT", headers,
      body: JSON.stringify({ title: "Board 2", content: blackboardSource, expectedRevision: 1 }),
    })).status).toBe(400);
    expect((await fetch(`${base}/v1/account/works/${boardId}/content`, { method: "PUT", headers,
      body: JSON.stringify({ title: "Stale", content: blackboardSource, expectedRevision: 1 }),
    })).status).toBe(400);
    const migrationUrl = `${base}/v1/account/works/${boardId}/migrate`;
    expect((await fetch(migrationUrl, { method: "POST", headers, body: JSON.stringify({ expectedRevision: 2, kind: "canvas", content }) })).status).toBe(409);
    const migrated = await fetch(migrationUrl, { method: "POST", headers, body: JSON.stringify({ expectedRevision: 1, kind: "canvas", content }) });
    expect(migrated.status).toBe(200);
    expect((await migrated.json()).work).toMatchObject({ id: boardId, kind: "canvas", revision: 2, hasSourceBackup: true });
    expect(await (await fetch(`${base}/v1/account/works/${boardId}/source-backup`, { headers })).json()).toEqual({ content: blackboardSource, revision: 1 });
    expect((await (await fetch(`${base}/v1/account/works`, { headers })).json()).limits.usedBytes).toBe(Buffer.byteLength(content) + Buffer.byteLength(blackboardSource));
    expect((await fetch(migrationUrl, { method: "POST", headers, body: JSON.stringify({ expectedRevision: 1, kind: "slides", content: content.replace("freeform", "slide") }) })).status).toBe(200);
    expect(store.readBackup("github:17", boardId)).toMatchObject({ content, revision: 2 });
    expect((await fetch(`${base}/v1/account/works/backups`, { method: "POST", headers,
      body: JSON.stringify({ kind: "blackboard", title: "Traversal", content: JSON.stringify({
        chardesk: "blackboard/source-v1", files: [
          { path: "blackboard.yaml", content: "draft" }, { path: "../outside", content: "bad" },
        ],
      }) }),
    })).status).toBe(400);
  });

  it("persists the catalog and isolates another user's entries", () => {
    const directory = mkdtempSync(join(tmpdir(), "chardesk-account-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "account.db");
    const first = new AccountStore(path);
    first.upsertUser({ id: "github:1", login: "one", avatarUrl: null });
    first.upsertUser({ id: "github:2", login: "two", avatarUrl: null });
    const work = first.createWork("github:1", "slides", "Private slides");
    const backup = first.createBackup("github:1", "canvas", "Private canvas",
      "---\nchardesk: document/v1\nmode: freeform\n---\nPrivate");
    const conflict = first.createBackup("github:1", "canvas", "Conflict copy",
      "---\nchardesk: document/v1\nmode: freeform\n---\nChanged", backup.id);
    expect(conflict.conflictWith).toBe(backup.id);
    expect(() => first.createBackup("github:2", "canvas", "Invalid parent",
      "---\nchardesk: document/v1\nmode: freeform\n---\nChanged", backup.id)).toThrow();
    expect(first.listWorks("github:2")).toEqual([]);
    expect(first.readBackup("github:2", backup.id)).toBeNull();
    expect(first.renameWork("github:1", backup.id, "Unversioned rename")).toBe(false);
    expect(first.updateBackup("github:2", backup.id, 1, "Stolen", "not owned"))
      .toEqual({ status: "not-found" });
    expect(first.renameWork("github:2", work.id, "Stolen")).toBe(false);
    expect(first.deleteWork("github:2", work.id)).toBe(false);
    first.close();
    const reopened = new AccountStore(path);
    cleanups.push(() => reopened.close());
    expect(reopened.listWorks("github:1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: work.id, title: "Private slides" }),
      expect.objectContaining({ id: backup.id, contentStatus: "uploaded" }),
      expect.objectContaining({ id: conflict.id, conflictWith: backup.id }),
    ]));
    expect(reopened.readBackup("github:1", backup.id)?.content).toContain("Private");
    expect(reopened.linkedProviders("github:1")).toEqual(["github"]);
    expect(reopened.userForIdentity("github", "1", { login: "renamed", avatarUrl: null }))
      .toEqual({ id: "github:1", login: "renamed", avatarUrl: null });
  });

  it("links Google only through an authenticated one-time flow and preserves the GitHub account", async () => {
    const store = new AccountStore(":memory:");
    cleanups.push(() => store.close());
    store.userForIdentity("github", "17", { login: "maker", avatarUrl: null });
    const work = store.createWork("github:17", "canvas", "Existing work");
    store.createSession("github:17", "session-one", Date.now() + 60_000);
    store.userForIdentity("github", "18", { login: "other", avatarUrl: null });
    store.createSession("github:18", "session-two", Date.now() + 60_000);
    let googleSubject = "google-sub-1";
    let googleNonce = "";
    const verifyGoogleToken = vi.fn(async () => ({ subject: googleSubject,
      login: "Same email is not an identity", avatarUrl: null, nonce: googleNonce }));
    const tokenFetch = vi.fn<typeof fetch>(async () => Response.json({ id_token: "verified-by-mock" }));
    const server = createSyncServer({ port: 0, logger: () => {}, accountApi: createAccountApi({
      store, github: { clientId: "github-client", clientSecret: "github-secret" },
      google: { clientId: "google-client", clientSecret: "google-secret" },
      publicOrigin: "http://127.0.0.1:1234", appOrigin: "http://127.0.0.1:5173",
      allowedOrigins: new Set(["http://127.0.0.1:5173"]), fetchImpl: tokenFetch, verifyGoogleToken,
    }) });
    const { port } = await server.listen();
    cleanups.push(server.close);
    const base = `http://127.0.0.1:${port}`;
    const origin = "http://127.0.0.1:5173";
    const link = await fetch(`${base}/v1/account/identities/google/link`, {
      method: "POST", headers: { Origin: origin, Cookie: "chardesk_session=session-one" },
    });
    expect(link.status).toBe(200);
    const authorize = new URL((await link.json() as { authorizeUrl: string }).authorizeUrl);
    expect(authorize.hostname).toBe("accounts.google.com");
    expect(authorize.searchParams.get("scope")).toBe("openid profile");
    expect(authorize.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:1234/v1/account/google/callback");
    googleNonce = authorize.searchParams.get("nonce")!;
    const state = authorize.searchParams.get("state")!;
    const stateCookie = link.headers.get("set-cookie")!.split(";")[0]!;
    const callbackUrl = `${base}/v1/account/google/callback?code=code&state=${state}`;
    const callback = await fetch(callbackUrl, {
      headers: { Cookie: `chardesk_session=session-one; ${stateCookie}` }, redirect: "manual",
    });
    expect(callback.headers.get("location")).toBe(`${origin}/workspace?view=account&auth=linked`);
    expect(store.linkedProviders("github:17")).toEqual(["github", "google"]);
    expect(store.userForIdentity("google", googleSubject, { login: "different", avatarUrl: null }).id)
      .toBe("github:17");
    expect(store.listWorks("github:17")[0]?.id).toBe(work.id);
    expect((await fetch(callbackUrl, {
      headers: { Cookie: `chardesk_session=session-one; ${stateCookie}` }, redirect: "manual",
    })).status).toBe(400);
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    expect((await fetch(`${base}/v1/account/identities/google/link`, {
      method: "POST", headers: { Origin: origin, Cookie: "chardesk_session=session-one" },
    })).status).toBe(409);

    const login = await fetch(`${base}/v1/account/google/login`, { redirect: "manual" });
    const loginAuthorize = new URL(login.headers.get("location")!);
    googleNonce = loginAuthorize.searchParams.get("nonce")!;
    const loginCookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const signedIn = await fetch(`${base}/v1/account/google/callback?code=code&state=${loginAuthorize.searchParams.get("state")}`, {
      headers: { Cookie: loginCookie }, redirect: "manual",
    });
    const sessionCookie = signedIn.headers.getSetCookie().find((value) => value.startsWith("chardesk_session="))!.split(";")[0]!;
    expect((await (await fetch(`${base}/v1/account/me`, { headers: { Cookie: sessionCookie } })).json()).user.id)
      .toBe("github:17");
    expect(verifyGoogleToken).toHaveBeenCalledWith("verified-by-mock", "google-client");

    googleSubject = "google-sub-2";
    const separateLogin = await fetch(`${base}/v1/account/google/login`, { redirect: "manual" });
    const separateAuthorize = new URL(separateLogin.headers.get("location")!);
    googleNonce = separateAuthorize.searchParams.get("nonce")!;
    const separateCookie = separateLogin.headers.get("set-cookie")!.split(";")[0]!;
    await fetch(`${base}/v1/account/google/callback?code=code&state=${separateAuthorize.searchParams.get("state")}`, {
      headers: { Cookie: separateCookie }, redirect: "manual",
    });
    const separateUser = store.userForIdentity("google", googleSubject, { login: "same email", avatarUrl: null });
    expect(separateUser.id).not.toBe("github:17");
    const conflictLink = await fetch(`${base}/v1/account/identities/google/link`, {
      method: "POST", headers: { Origin: origin, Cookie: "chardesk_session=session-two" },
    });
    const conflictAuthorize = new URL((await conflictLink.json() as { authorizeUrl: string }).authorizeUrl);
    googleNonce = conflictAuthorize.searchParams.get("nonce")!;
    const conflictCookie = conflictLink.headers.get("set-cookie")!.split(";")[0]!;
    const conflictCallback = await fetch(`${base}/v1/account/google/callback?code=code&state=${conflictAuthorize.searchParams.get("state")}`, {
      headers: { Cookie: `chardesk_session=session-two; ${conflictCookie}` }, redirect: "manual",
    });
    expect(conflictCallback.headers.get("location")).toBe(`${origin}/workspace?view=account&auth=identity-in-use`);
    expect(store.linkedProviders("github:18")).toEqual(["github"]);
    expect(store.listWorks(separateUser.id)).toEqual([]);
  });

  it("rejects a swapped linking session and an invalid Google nonce", async () => {
    const store = new AccountStore(":memory:");
    cleanups.push(() => store.close());
    store.userForIdentity("github", "1", { login: "one", avatarUrl: null });
    store.userForIdentity("github", "2", { login: "two", avatarUrl: null });
    store.createSession("github:1", "session-one", Date.now() + 60_000);
    store.createSession("github:2", "session-two", Date.now() + 60_000);
    const server = createSyncServer({ port: 0, logger: () => {}, accountApi: createAccountApi({
      store, google: { clientId: "client", clientSecret: "secret" },
      publicOrigin: "http://127.0.0.1:1234", appOrigin: "http://127.0.0.1:5173",
      allowedOrigins: new Set(["http://127.0.0.1:5173"]),
      fetchImpl: async () => Response.json({ id_token: "token" }),
      verifyGoogleToken: async () => ({ subject: "sub", login: "Google", avatarUrl: null, nonce: "wrong" }),
    }) });
    const { port } = await server.listen();
    cleanups.push(server.close);
    const base = `http://127.0.0.1:${port}`;
    const linked = await fetch(`${base}/v1/account/identities/google/link`, {
      method: "POST", headers: { Origin: "http://127.0.0.1:5173", Cookie: "chardesk_session=session-one" },
    });
    const authorize = new URL((await linked.json() as { authorizeUrl: string }).authorizeUrl);
    const stateCookie = linked.headers.get("set-cookie")!.split(";")[0]!;
    const callback = `${base}/v1/account/google/callback?code=code&state=${authorize.searchParams.get("state")}`;
    expect((await fetch(callback, { headers: { Cookie: `chardesk_session=session-two; ${stateCookie}` },
      redirect: "manual" })).status).toBe(400);
    expect(store.linkedProviders("github:1")).toEqual(["github"]);
    const login = await fetch(`${base}/v1/account/google/login`, { redirect: "manual" });
    const loginAuthorize = new URL(login.headers.get("location")!);
    const loginCookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const badNonce = await fetch(`${base}/v1/account/google/callback?code=code&state=${loginAuthorize.searchParams.get("state")}`, {
      headers: { Cookie: loginCookie }, redirect: "manual",
    });
    expect(badNonce.headers.get("location")).toContain("auth=failed");
    expect(store.linkedProviders("github:1")).toEqual(["github"]);
  });

  it("enforces per-work and per-account backup limits", () => {
    expect(() => assertBackupWithinLimits(MAX_BACKUP_BYTES + 1, 0))
      .toThrowError(BackupLimitError);
    expect(() => assertBackupWithinLimits(1, MAX_ACCOUNT_BACKUP_BYTES))
      .toThrowError(BackupLimitError);
    expect(() => assertBackupWithinLimits(MAX_BACKUP_BYTES, MAX_ACCOUNT_BACKUP_BYTES - MAX_BACKUP_BYTES))
      .not.toThrow();
  });

  it("migrates existing uploaded content to revision one", () => {
    const directory = mkdtempSync(join(tmpdir(), "chardesk-account-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "account.db");
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT NOT NULL, avatar_url TEXT);
      CREATE TABLE works (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
        title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE work_content (work_id TEXT PRIMARY KEY, content TEXT NOT NULL, bytes INTEGER NOT NULL);
      INSERT INTO users VALUES ('github:1', 'one', NULL);
      INSERT INTO works VALUES ('work-1', 'github:1', 'canvas', 'Old', '2026-01-01', '2026-01-01');
      INSERT INTO work_content VALUES ('work-1', 'legacy content', 14);`);
    legacy.close();
    const store = new AccountStore(path);
    cleanups.push(() => store.close());
    expect(store.readBackup("github:1", "work-1")).toEqual({ title: "Old", content: "legacy content", revision: 1 });
    expect(store.listWorks("github:1")[0]).toMatchObject({ revision: 1, contentBytes: 14 });
    expect(store.linkedProviders("github:1")).toEqual(["github"]);
  });
});
