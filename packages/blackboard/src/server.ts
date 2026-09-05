import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import {
  isBlackboardManifestPath,
  resolveReadableBoardPath,
  type WorkspaceBoardPath,
} from "./paths.js";
import { resolveBlackboardSource } from "./document.js";
import { compileBlackboardPackage } from "./package.js";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const contentType = (path: string) => {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".woff2": return "font/woff2";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
};

const send = (
  response: ServerResponse,
  status: number,
  body?: Uint8Array | string,
  headers: Record<string, string> = {}
) => {
  response.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  response.end(body);
};

const isInside = (root: string, candidate: string) => {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
};

const defaultAppRoot = fileURLToPath(new URL("../../../dist", import.meta.url));

type BlackboardServerOptions = {
  board: WorkspaceBoardPath;
  port?: number;
  appRoot?: string;
  prefix?: string;
  sessionId?: string;
  idleTimeoutMs?: number;
};

export type BlackboardServerSession = {
  url: string;
  ready: Promise<void>;
  closed: Promise<void>;
  close: () => Promise<void>;
};

const readBoardProjection = async (readable: string) => {
  if (isBlackboardManifestPath(readable)) {
    const compiled = await compileBlackboardPackage(readable);
    return {
      source: serializeCharDeskDocumentEnvelope({
        mode: compiled.mode,
        title: compiled.title,
        body: compiled.source,
      }),
      sourceName: "blackboard.chardesk",
      dependencies: compiled.dependencies,
    };
  }
  const bytes = await readFile(readable);
  return {
    source: resolveBlackboardSource(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    ),
    sourceName: basename(readable),
    dependencies: [readable],
  };
};

const dependencyRevision = async (paths: readonly string[]) => (await Promise.all(paths.map(async (path) => {
  const value = await stat(path);
  return `${path}\0${value.size}\0${value.mtimeMs}\0${value.ctimeMs}`;
}))).join("\n");

export const startBlackboardServer = async ({
  board,
  port = 7331,
  appRoot = defaultAppRoot,
  prefix = "",
  sessionId,
  idleTimeoutMs,
}: BlackboardServerOptions) => {
  if (prefix && !/^\/s\/[A-Za-z0-9_-]{22}$/u.test(prefix)) {
    throw new Error("Blackboard server prefix must be an opaque session path.");
  }
  let staticRoot: string;
  try {
    staticRoot = await realpath(appRoot);
    await realpath(resolve(staticRoot, "index.html"));
  } catch {
    throw new Error(
      `CharDesk application build not found at ${appRoot}. Run the main application build first.`
    );
  }
  let markReady: (() => void) | undefined;
  let runtimeReady = false;
  let lastActivityAt = Date.now();
  let idleTimer: NodeJS.Timeout | undefined;
  let closePromise: Promise<void> | undefined;
  let projectionCache: {
    readable: string;
    revision: string;
    value: Awaited<ReturnType<typeof readBoardProjection>>;
  } | undefined;
  const ready = new Promise<void>((resolveReady) => { markReady = resolveReady; });
  const idleExpiresAt = () => idleTimeoutMs ? lastActivityAt + idleTimeoutMs : undefined;
  const touch = () => {
    lastActivityAt = Date.now();
    if (!idleTimeoutMs || closePromise) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { void closeServer().catch(() => undefined); }, idleTimeoutMs);
    idleTimer.unref();
  };
  let closeServer = () => Promise.resolve();
  const server = createServer((request, response) => {
    void (async () => {
      const requestedPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (!prefix || requestedPath === prefix || requestedPath.startsWith(`${prefix}/`)) touch();
      if (request.method === "POST" && requestedPath === `${prefix}/ready`) {
        runtimeReady = true;
        markReady?.();
        markReady = undefined;
        send(response, 204);
        return;
      }
      if (prefix && request.method === "POST" && requestedPath === `${prefix}/close`) {
        send(response, 202);
        setImmediate(() => { void closeServer().catch(() => undefined); });
        return;
      }
      if (request.method !== "GET") {
        send(response, 405, undefined, { Allow: "GET" });
        return;
      }
      if (requestedPath === `${prefix}/health`) {
        send(response, 200, JSON.stringify({
          status: "ready",
          runtimeReady,
          ...(sessionId ? { sessionId } : {}),
          ...(idleTimeoutMs ? { lastActivityAt, idleExpiresAt: idleExpiresAt() } : {}),
        }), {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        });
        return;
      }
      if (prefix && !requestedPath.startsWith(`${prefix}/`) && requestedPath !== prefix) {
        send(response, 404);
        return;
      }
      const pathname = prefix ? requestedPath.slice(prefix.length) || "/" : requestedPath;
      if (pathname === "/board") {
        let readable: string;
        try {
          readable = await resolveReadableBoardPath(board);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            send(response, 404, undefined, { "Cache-Control": "no-store" });
            return;
          }
          send(response, 403);
          return;
        }
        let projection: Awaited<ReturnType<typeof readBoardProjection>>;
        try {
          const cachedRevision = projectionCache?.readable === readable
            ? await dependencyRevision(projectionCache.value.dependencies).catch(() => "changed")
            : "changed";
          if (projectionCache?.readable === readable && cachedRevision === projectionCache.revision) {
            projection = projectionCache.value;
          } else {
            projection = await readBoardProjection(readable);
            projectionCache = {
              readable,
              revision: await dependencyRevision(projection.dependencies),
              value: projection,
            };
          }
        } catch (error) {
          send(response, 422, error instanceof Error ? error.message : "Invalid board source.", {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          });
          return;
        }
        const etag = `"${createHash("sha256")
          .update(projection.sourceName)
          .update("\0")
          .update(projection.source)
          .digest("hex")}"`;
        const headers = { "Cache-Control": "no-cache", ETag: etag };
        if (request.headers["if-none-match"] === etag) {
          send(response, 304, undefined, headers);
          return;
        }
        const body = new TextEncoder().encode(projection.source);
        send(response, 200, body, {
          ...headers,
          "Content-Length": String(body.byteLength),
          "Content-Type": "text/plain; charset=utf-8",
          "X-CharDesk-Source-Name": projection.sourceName,
        });
        return;
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        send(response, 400);
        return;
      }
      const asset = resolve(
        staticRoot,
        decoded === "/" || decoded === "/blackboard" ? "index.html" : `.${decoded}`
      );
      if (!isInside(staticRoot, asset)) {
        send(response, 404);
        return;
      }
      try {
        const checked = await realpath(asset);
        if (!isInside(staticRoot, checked)) {
          send(response, 404);
          return;
        }
        const bytes = await readFile(checked);
        send(response, 200, bytes, {
          "Cache-Control": decoded === "/blackboard"
            ? "no-cache"
            : "public, max-age=31536000, immutable",
          "Content-Length": String(bytes.byteLength),
          "Content-Type": contentType(checked),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          send(response, 404);
          return;
        }
        throw error;
      }
    })().catch(() => send(response, 500));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Blackboard server did not bind TCP.");
  const origin = `http://127.0.0.1:${address.port}`;
  const url = `${origin}${prefix}/`;
  const closed = new Promise<void>((resolveClosed) => server.once("close", resolveClosed));
  closeServer = () => {
    if (closePromise) return closePromise;
    if (idleTimer) clearTimeout(idleTimer);
    closePromise = new Promise<void>((resolveClose, reject) => {
      const forceTimer = setTimeout(() => server.closeAllConnections(), 2_000);
      forceTimer.unref();
      server.close((error) => {
        clearTimeout(forceTimer);
        if (error) reject(error);
        else resolveClose();
      });
    });
    return closePromise;
  };
  touch();
  return {
    server,
    url,
    ready,
    closed,
    close: closeServer,
  } satisfies BlackboardServerSession & { server: typeof server };
};
