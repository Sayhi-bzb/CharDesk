import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AccountStore, BackupLimitError, MAX_ACCOUNT_BACKUP_BYTES, MAX_BACKUP_BYTES,
  type AuthProvider, type CloudWork,
} from "./account-store.js";
import { verifyGoogleIdToken, type GoogleIdentity } from "./google-identity.js";

const SESSION_COOKIE = "chardesk_session";
const STATE_COOKIE = "chardesk_oauth_state";
const SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AccountApiOptions = {
  store: AccountStore;
  github?: { clientId: string; clientSecret: string };
  google?: { clientId: string; clientSecret: string };
  publicOrigin: string;
  appOrigin: string;
  allowedOrigins: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
  verifyGoogleToken?: (idToken: string, clientId: string) => Promise<GoogleIdentity>;
};

const cookies = (request: IncomingMessage) => Object.fromEntries(
  (request.headers.cookie ?? "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }),
);

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

class RequestTooLargeError extends Error {}

const readBody = async (request: IncomingMessage, limit = 4096): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > limit) throw new RequestTooLargeError("Request too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const validTitle = (value: unknown) => typeof value === "string" &&
  value.trim().length > 0 && value.trim().length <= 120;
const validContent = (kind: CloudWork["kind"], value: unknown): value is string => {
  if (typeof value !== "string") return false;
  if (kind !== "blackboard") return value.startsWith("---\nchardesk: document/v1\n") &&
    value.includes(`\nmode: ${kind === "slides" ? "slide" : "freeform"}\n`);
  try {
    const source: unknown = JSON.parse(value);
    if (!source || typeof source !== "object" || Array.isArray(source)) return false;
    const envelope = source as Record<string, unknown>;
    if (envelope.chardesk !== "blackboard/source-v1" || !Array.isArray(envelope.files)) return false;
    const paths = new Set<string>();
    for (const file of envelope.files) {
      if (!file || typeof file !== "object" || Array.isArray(file)) return false;
      const entry = file as Record<string, unknown>;
      if (typeof entry.path !== "string" || typeof entry.content !== "string" ||
        entry.path.length === 0 || entry.path.startsWith("/") || entry.path.includes("\\") ||
        /^[a-z]:/iu.test(entry.path) || entry.path.split("/").some((part) => !part || part === "." || part === "..") ||
        paths.has(entry.path)) return false;
      paths.add(entry.path);
    }
    return paths.has("blackboard.yaml");
  } catch { return false; }
};

const secureCookie = (publicOrigin: string) => new URL(publicOrigin).protocol === "https:" ? "; Secure" : "";
const cookie = (name: string, value: string, maxAge: number, publicOrigin: string) =>
  `${name}=${value}; HttpOnly; Path=/v1/account; SameSite=Lax; Max-Age=${maxAge}${secureCookie(publicOrigin)}`;

const sameState = (left: string | undefined, right: string | null) => {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const createAccountApi = ({
  store, github, google, publicOrigin, appOrigin, allowedOrigins,
  fetchImpl = fetch, verifyGoogleToken = verifyGoogleIdToken,
}: AccountApiOptions) => {
  if (!github && !google) throw new Error("At least one account provider is required.");
  for (const origin of [publicOrigin, appOrigin]) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
      throw new Error("Account origins must be HTTPS origins or loopback development origins.");
    }
  }
  const availableProviders: AuthProvider[] = [github && "github", google && "google"]
    .filter((provider): provider is AuthProvider => Boolean(provider));
  const callback = (provider: AuthProvider) =>
    `${publicOrigin}/v1/account/${provider === "github" ? "callback" : "google/callback"}`;
  const returnToAccount = (status?: string) =>
    `${appOrigin}/workspace?view=account${status ? `&auth=${encodeURIComponent(status)}` : ""}`;
  const beginOAuth = (provider: AuthProvider, intent: "login" | "link",
    userId: string | null = null, sessionToken: string | null = null) => {
    const credentials = provider === "github" ? github : google;
    if (!credentials) return null;
    const state = randomBytes(32).toString("base64url");
    const nonce = provider === "google" ? randomBytes(32).toString("base64url") : null;
    store.createOAuthFlow(state, provider, intent, nonce, userId, sessionToken);
    const authorize = new URL(provider === "github"
      ? "https://github.com/login/oauth/authorize" : "https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", credentials.clientId);
    authorize.searchParams.set("redirect_uri", callback(provider));
    authorize.searchParams.set("state", state);
    if (provider === "github") authorize.searchParams.set("scope", "");
    else {
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "openid profile");
      authorize.searchParams.set("nonce", nonce!);
    }
    return { url: authorize.href, state };
  };
  const readIdentity = async (provider: AuthProvider, code: string) => {
    if (provider === "github") {
      const tokenResponse = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: github!.clientId, client_secret: github!.clientSecret,
          code, redirect_uri: callback(provider) }),
      });
      if (!tokenResponse.ok) throw new Error("OAuth exchange failed");
      const tokenBody = await tokenResponse.json() as { access_token?: string };
      if (!tokenBody.access_token) throw new Error("Missing access token");
      const userResponse = await fetchImpl("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenBody.access_token}`,
          Accept: "application/vnd.github+json", "User-Agent": "CharDesk" },
      });
      if (!userResponse.ok) throw new Error("GitHub identity failed");
      const user = await userResponse.json() as { id?: number; login?: string; avatar_url?: string };
      if (!Number.isSafeInteger(user.id) || !user.login) throw new Error("Invalid GitHub identity");
      return { subject: String(user.id), login: user.login, avatarUrl: user.avatar_url ?? null, nonce: null };
    }
    const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: google!.clientId, client_secret: google!.clientSecret,
        redirect_uri: callback(provider), grant_type: "authorization_code" }),
    });
    if (!tokenResponse.ok) throw new Error("Google OAuth exchange failed");
    const tokenBody = await tokenResponse.json() as { id_token?: string };
    if (!tokenBody.id_token) throw new Error("Missing Google ID token");
    return verifyGoogleToken(tokenBody.id_token, google!.clientId);
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? "/", publicOrigin);
    if (!url.pathname.startsWith("/v1/account/")) return false;

    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(origin && allowedOrigins.has(origin) ? 204 : 403).end();
      return true;
    }
    if (origin && !allowedOrigins.has(origin)) {
      json(response, 403, { error: "Origin not allowed" });
      return true;
    }

    const loginProvider = url.pathname === "/v1/account/login" || url.pathname === "/v1/account/github/login"
      ? "github" : url.pathname === "/v1/account/google/login" ? "google" : null;
    if (loginProvider && request.method === "GET") {
      const flow = beginOAuth(loginProvider, "login");
      if (!flow) json(response, 404, { error: "Provider unavailable" });
      else {
        response.setHeader("Set-Cookie", cookie(STATE_COOKIE, flow.state, 600, publicOrigin));
        response.writeHead(302, { Location: flow.url, "cache-control": "no-store" }).end();
      }
      return true;
    }

    const callbackProvider = url.pathname === "/v1/account/callback" ? "github"
      : url.pathname === "/v1/account/google/callback" ? "google" : null;
    if (callbackProvider && request.method === "GET") {
      if (!availableProviders.includes(callbackProvider)) {
        json(response, 404, { error: "Provider unavailable" });
        return true;
      }
      const state = cookies(request)[STATE_COOKIE];
      response.setHeader("Set-Cookie", cookie(STATE_COOKIE, "", 0, publicOrigin));
      if (!state || !sameState(state, url.searchParams.get("state"))) {
        json(response, 400, { error: "Invalid OAuth state" });
        return true;
      }
      const session = cookies(request)[SESSION_COOKIE] ?? null;
      const flow = store.consumeOAuthFlow(state, callbackProvider, session);
      if (!flow || (flow.intent === "link" && store.getUser(session!)?.id !== flow.userId)) {
        json(response, 400, { error: "Invalid OAuth flow" });
        return true;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        response.writeHead(302, { Location: returnToAccount(url.searchParams.get("error") === "access_denied"
          ? "cancelled" : "failed"), "cache-control": "no-store" }).end();
        return true;
      }
      try {
        const identity = await readIdentity(callbackProvider, code);
        if (callbackProvider === "google" && (!identity.nonce || !flow.nonceHash ||
          !timingSafeEqual(Buffer.from(hash(identity.nonce)), Buffer.from(flow.nonceHash)))) {
          throw new Error("Invalid Google nonce");
        }
        if (flow.intent === "link") {
          const result = store.linkIdentity(flow.userId!, callbackProvider, identity.subject);
          response.writeHead(302, { Location: returnToAccount(result === "conflict" ? "identity-in-use" : "linked"),
            "cache-control": "no-store" }).end();
        } else {
          const user = store.userForIdentity(callbackProvider, identity.subject, identity);
          const nextSession = randomBytes(32).toString("base64url");
          store.createSession(user.id, nextSession, Date.now() + SESSION_AGE_SECONDS * 1000);
          response.setHeader("Set-Cookie", [cookie(STATE_COOKIE, "", 0, publicOrigin),
            cookie(SESSION_COOKIE, nextSession, SESSION_AGE_SECONDS, publicOrigin)]);
          response.writeHead(302, { Location: returnToAccount(), "cache-control": "no-store" }).end();
        }
      } catch {
        response.writeHead(302, { Location: returnToAccount("failed"), "cache-control": "no-store" }).end();
      }
      return true;
    }

    const session = cookies(request)[SESSION_COOKIE];
    const user = session ? store.getUser(session) : null;
    if (url.pathname === "/v1/account/me" && request.method === "GET") {
      json(response, 200, { user, availableProviders,
        linkedProviders: user ? store.linkedProviders(user.id) : [] });
      return true;
    }
    if (!user) {
      json(response, 401, { error: "Sign in required" });
      return true;
    }
    if (request.method !== "GET" && (!origin || !allowedOrigins.has(origin))) {
      json(response, 403, { error: "Invalid request origin" });
      return true;
    }
    const linkProvider = /^\/v1\/account\/identities\/(github|google)\/link$/.exec(url.pathname)?.[1] as
      AuthProvider | undefined;
    if (linkProvider && request.method === "POST") {
      if (store.linkedProviders(user.id).includes(linkProvider)) {
        json(response, 409, { error: "Provider already linked" });
      } else {
        const flow = beginOAuth(linkProvider, "link", user.id, session);
        if (!flow) json(response, 404, { error: "Provider unavailable" });
        else {
          response.setHeader("Set-Cookie", cookie(STATE_COOKIE, flow.state, 600, publicOrigin));
          json(response, 200, { authorizeUrl: flow.url });
        }
      }
      return true;
    }
    if (url.pathname === "/v1/account/logout" && request.method === "POST") {
      store.deleteSession(session!);
      response.setHeader("Set-Cookie", cookie(SESSION_COOKIE, "", 0, publicOrigin));
      json(response, 200, { ok: true });
      return true;
    }
    if (url.pathname === "/v1/account/works/backups" && request.method === "POST") {
      try {
        const body = await readBody(request, 2 * MAX_BACKUP_BYTES + 4096) as {
          kind?: string; title?: string; content?: string; conflictWith?: string;
        };
        if ((body.kind !== "canvas" && body.kind !== "slides" && body.kind !== "blackboard") ||
          !validTitle(body.title) || !validContent(body.kind, body.content) ||
          (body.conflictWith !== undefined && !/^[0-9a-f-]{36}$/.test(body.conflictWith))) {
          json(response, 400, { error: "Invalid backup" });
        } else {
          json(response, 201, { work: store.createBackup(user.id, body.kind, body.title!.trim(), body.content,
            body.conflictWith ?? null) });
        }
      } catch (error) {
        if (error instanceof RequestTooLargeError || error instanceof BackupLimitError) {
          json(response, 413, { error: error.message });
        } else json(response, 400, { error: "Invalid request body" });
      }
      return true;
    }
    if (url.pathname === "/v1/account/works") {
      if (request.method === "GET") json(response, 200, {
        works: store.listWorks(user.id),
        limits: { maxWorkBytes: MAX_BACKUP_BYTES, maxAccountBytes: MAX_ACCOUNT_BACKUP_BYTES,
          usedBytes: store.backupUsage(user.id) },
      });
      else if (request.method === "POST") {
        try {
          const body = await readBody(request) as { kind?: CloudWork["kind"]; title?: string };
          if (!["canvas", "slides", "blackboard"].includes(body.kind ?? "") || !validTitle(body.title)) {
            json(response, 400, { error: "Invalid work" });
          } else json(response, 201, { work: store.createWork(user.id, body.kind!, body.title!.trim()) });
        } catch { json(response, 400, { error: "Invalid request body" }); }
      } else json(response, 405, { error: "Method not allowed" });
      return true;
    }
    const workId = /^\/v1\/account\/works\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
    const contentWorkId = /^\/v1\/account\/works\/([0-9a-f-]{36})\/content$/.exec(url.pathname)?.[1];
    if (contentWorkId && request.method === "GET") {
      const backup = store.readBackup(user.id, contentWorkId);
      if (backup === null) json(response, 404, { error: "Backup not found" });
      else json(response, 200, backup);
      return true;
    }
    if (contentWorkId && request.method === "PUT") {
      try {
        const body = await readBody(request, 2 * MAX_BACKUP_BYTES + 4096) as {
          title?: string; content?: string; expectedRevision?: number;
        };
        const work = store.listWorks(user.id).find(({ id }) => id === contentWorkId);
        if (!work || work.contentStatus !== "uploaded") {
          json(response, 404, { error: "Backup not found" });
        } else if (!validTitle(body.title) || !validContent(work.kind, body.content) ||
          !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision ?? 0) < 1) {
          json(response, 400, { error: "Invalid backup update" });
        } else {
          const result = store.updateBackup(user.id, contentWorkId, body.expectedRevision!, body.title!.trim(), body.content);
          if (result.status === "updated") json(response, 200, { work: result.work });
          else json(response, result.status === "conflict" ? 409 : 404, { error: result.status });
        }
      } catch (error) {
        if (error instanceof RequestTooLargeError || error instanceof BackupLimitError) {
          json(response, 413, { error: error.message });
        } else json(response, 400, { error: "Invalid request body" });
      }
      return true;
    }
    if (workId && request.method === "DELETE") {
      json(response, store.deleteWork(user.id, workId) ? 200 : 404, { ok: true });
      return true;
    }
    if (workId && request.method === "PATCH") {
      try {
        const body = await readBody(request) as { title?: string };
        if (!validTitle(body.title)) json(response, 400, { error: "Invalid title" });
        else if (store.listWorks(user.id).some((work) => work.id === workId && work.contentStatus === "uploaded")) {
          json(response, 409, { error: "Uploaded work title follows its source" });
        }
        else json(response, store.renameWork(user.id, workId, body.title!.trim()) ? 200 : 404, { ok: true });
      } catch { json(response, 400, { error: "Invalid request body" }); }
      return true;
    }
    json(response, 404, { error: "Not found" });
    return true;
  };
  return { handle };
};
