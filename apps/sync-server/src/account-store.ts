import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type AccountUser = { id: string; login: string; avatarUrl: string | null };
export type CloudWork = {
  id: string;
  kind: "canvas" | "slides" | "blackboard";
  title: string;
  createdAt: string;
  updatedAt: string;
  contentStatus: "not-uploaded" | "uploaded";
  contentBytes: number | null;
  revision: number | null;
  conflictWith: string | null;
};

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_ACCOUNT_BACKUP_BYTES = 100 * 1024 * 1024;

export class BackupLimitError extends Error {
  constructor(readonly kind: "work" | "account") {
    super(`Backup exceeds ${kind} storage limit`);
  }
}

export const assertBackupWithinLimits = (bytes: number, usedBytes: number) => {
  if (bytes <= 0 || bytes > MAX_BACKUP_BYTES) throw new BackupLimitError("work");
  if (usedBytes + bytes > MAX_ACCOUNT_BACKUP_BYTES) throw new BackupLimitError("account");
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class AccountStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, login TEXT NOT NULL, avatar_url TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS works (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('canvas', 'slides', 'blackboard')),
        title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        conflict_with TEXT
      );
      CREATE INDEX IF NOT EXISTS works_user_updated ON works(user_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS work_content (
        work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        bytes INTEGER NOT NULL CHECK (bytes > 0),
        revision INTEGER NOT NULL DEFAULT 1
      );
    `);
    const workColumns = this.#db.prepare("PRAGMA table_info(works)").all() as { name: string }[];
    if (!workColumns.some(({ name }) => name === "conflict_with")) {
      this.#db.exec("ALTER TABLE works ADD COLUMN conflict_with TEXT");
    }
    const columns = this.#db.prepare("PRAGMA table_info(work_content)").all() as { name: string }[];
    if (!columns.some(({ name }) => name === "revision")) {
      this.#db.exec("ALTER TABLE work_content ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
    }
  }

  upsertUser(user: AccountUser) {
    this.#db.prepare(`INSERT INTO users(id, login, avatar_url) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url`)
      .run(user.id, user.login, user.avatarUrl);
  }

  createSession(userId: string, token: string, expiresAt: number) {
    this.#db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    this.#db.prepare("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), userId, expiresAt);
  }

  getUser(token: string, now = Date.now()): AccountUser | null {
    const row = this.#db.prepare(`SELECT users.id, users.login, users.avatar_url AS avatarUrl
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(hashToken(token), now) as AccountUser | undefined;
    return row ?? null;
  }

  deleteSession(token: string) {
    this.#db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  listWorks(userId: string): CloudWork[] {
    return this.#db.prepare(`SELECT works.id, works.kind, works.title,
        works.created_at AS createdAt, works.updated_at AS updatedAt,
        CASE WHEN work_content.work_id IS NULL THEN 'not-uploaded' ELSE 'uploaded' END AS contentStatus,
        work_content.bytes AS contentBytes, work_content.revision,
        works.conflict_with AS conflictWith
      FROM works LEFT JOIN work_content ON work_content.work_id = works.id
      WHERE works.user_id = ? ORDER BY works.updated_at DESC`).all(userId) as CloudWork[];
  }

  backupUsage(userId: string): number {
    const row = this.#db.prepare(`SELECT COALESCE(SUM(work_content.bytes), 0) AS bytes
      FROM work_content JOIN works ON works.id = work_content.work_id
      WHERE works.user_id = ?`).get(userId) as { bytes: number };
    return row.bytes;
  }

  createWork(userId: string, kind: CloudWork["kind"], title: string): CloudWork {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#db.prepare("INSERT INTO works(id, user_id, kind, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, kind, title, now, now);
    return { id, kind, title, createdAt: now, updatedAt: now, contentStatus: "not-uploaded", contentBytes: null,
      revision: null, conflictWith: null };
  }

  createBackup(userId: string, kind: CloudWork["kind"], title: string, content: string,
    conflictWith: string | null = null): CloudWork {
    const bytes = Buffer.byteLength(content, "utf8");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      if (conflictWith) {
        const parent = this.#db.prepare(`SELECT works.id FROM works JOIN work_content ON work_content.work_id = works.id
          WHERE works.id = ? AND works.user_id = ? AND works.kind = ?`).get(conflictWith, userId, kind);
        if (!parent) throw new Error("Invalid conflict parent");
      }
      assertBackupWithinLimits(bytes, this.backupUsage(userId));
      this.#db.prepare(`INSERT INTO works(id, user_id, kind, title, created_at, updated_at, conflict_with)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, kind, title, now, now, conflictWith);
      this.#db.prepare("INSERT INTO work_content(work_id, content, bytes) VALUES (?, ?, ?)")
        .run(id, content, bytes);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return { id, kind, title, createdAt: now, updatedAt: now, contentStatus: "uploaded", contentBytes: bytes,
      revision: 1, conflictWith };
  }

  updateBackup(userId: string, workId: string, expectedRevision: number, title: string, content: string):
    { status: "updated"; work: CloudWork } | { status: "conflict" | "not-found" } {
    const bytes = Buffer.byteLength(content, "utf8");
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.#db.prepare(`SELECT works.id, works.kind, works.created_at AS createdAt,
        works.conflict_with AS conflictWith,
        work_content.bytes AS contentBytes, work_content.revision FROM works
        JOIN work_content ON work_content.work_id = works.id
        WHERE works.id = ? AND works.user_id = ?`).get(workId, userId) as
        { id: string; kind: CloudWork["kind"]; createdAt: string; contentBytes: number;
          revision: number; conflictWith: string | null } | undefined;
      if (!previous) { this.#db.exec("ROLLBACK"); return { status: "not-found" }; }
      if (previous.revision !== expectedRevision) { this.#db.exec("ROLLBACK"); return { status: "conflict" }; }
      assertBackupWithinLimits(bytes, this.backupUsage(userId) - previous.contentBytes);
      const updatedAt = new Date().toISOString();
      this.#db.prepare("UPDATE work_content SET content = ?, bytes = ?, revision = revision + 1 WHERE work_id = ?")
        .run(content, bytes, workId);
      this.#db.prepare("UPDATE works SET title = ?, updated_at = ? WHERE id = ?")
        .run(title, updatedAt, workId);
      this.#db.exec("COMMIT");
      return { status: "updated", work: { id: workId, kind: previous.kind, title,
        createdAt: previous.createdAt, updatedAt, contentStatus: "uploaded", contentBytes: bytes,
        revision: expectedRevision + 1, conflictWith: previous.conflictWith } };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  readBackup(userId: string, workId: string): { title: string; content: string; revision: number } | null {
    const row = this.#db.prepare(`SELECT works.title, work_content.content, work_content.revision FROM work_content
      JOIN works ON works.id = work_content.work_id
      WHERE works.id = ? AND works.user_id = ?`).get(workId, userId) as
      { title: string; content: string; revision: number } | undefined;
    return row ?? null;
  }

  renameWork(userId: string, id: string, title: string): boolean {
    return this.#db.prepare(`UPDATE works SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?
      AND NOT EXISTS (SELECT 1 FROM work_content WHERE work_content.work_id = works.id)`)
      .run(title, new Date().toISOString(), id, userId).changes > 0;
  }

  deleteWork(userId: string, id: string): boolean {
    return this.#db.prepare("DELETE FROM works WHERE id = ? AND user_id = ?")
      .run(id, userId).changes > 0;
  }

  close() { this.#db.close(); }
}
