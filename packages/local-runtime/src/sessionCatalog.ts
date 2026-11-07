import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';

export type LocalSession = {
  id: string;
  name: string;
  kind: 'managed' | 'external';
  path: string;
  archived: boolean;
  status: 'creating' | 'ready';
  revision: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  removing?: true;
};
export type SessionDeletion = {
  sessionId: string;
  path: string;
  stagedPath: string;
  revision: number;
  proof: string | null;
  state: 'prepared' | 'removed';
};
type SessionRow = Omit<LocalSession, 'archived'> & { archived: number; seed: string | null };
const nameOf = (name: string) => {
  const value = name.trim();
  if (!value || value.length > 200 || /\p{Cc}/u.test(value))
    throw new Error('Use a name of 1–200 printable characters.');
  return value;
};
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/** Incremental metadata transactions; native documents remain the content authority. */
export class LocalSessionCatalog {
  #db: Database;
  #owner = randomUUID();
  #closed = false;
  constructor(readonly path: string) {
    this.#db = new Database(path, { create: true, strict: true });
    try {
      this.#db.exec('PRAGMA busy_timeout = 100; PRAGMA foreign_keys = ON;');
      this.#db
        .transaction(() => {
          const version = (this.#db.query('PRAGMA user_version').get() as { user_version: number })
            .user_version;
          if (version > 3)
            throw new Error(
              'This session catalog needs a newer CharDesk version; it was preserved.'
            );
          if (version === 0) {
            const tables = this.#db
              .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
              )
              .all();
            if (tables.length) throw new Error('Unrecognized session catalog; it was preserved.');
            this.#db.exec(`
            CREATE TABLE sessions (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('managed','external')),
              path TEXT NOT NULL UNIQUE, archived INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL CHECK(status IN ('creating','ready')), seed TEXT,
              revision INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL,
              updatedAt INTEGER NOT NULL, lastOpenedAt INTEGER NOT NULL
            );
            CREATE TABLE write_owners (path TEXT PRIMARY KEY, owner TEXT NOT NULL, pid INTEGER NOT NULL);
            PRAGMA user_version = 1;
          `);
          }
          // Validate the required shape without rewriting a future or damaged database.
          this.#db.query('SELECT id, seed, revision FROM sessions LIMIT 0').all();
          this.#db.query('SELECT path, owner, pid FROM write_owners LIMIT 0').all();
          if (version < 2)
            this.#db.exec(`
            CREATE TABLE session_deletions (
              sessionId TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, stagedPath TEXT NOT NULL UNIQUE,
              revision INTEGER NOT NULL, proof TEXT, state TEXT NOT NULL CHECK(state IN ('prepared','removed'))
            );
            PRAGMA user_version = 2;
          `);
          this.#db
            .query(
              'SELECT sessionId,path,stagedPath,revision,proof,state FROM session_deletions LIMIT 0'
            )
            .all();
          if (version < 3)
            this.#db.exec(`
            CREATE TABLE removed_sessions (id TEXT PRIMARY KEY, path TEXT NOT NULL, removedAt INTEGER NOT NULL);
            CREATE INDEX removed_session_paths ON removed_sessions(path);
            PRAGMA user_version = 3;
          `);
          this.#db.query('SELECT id,path,removedAt FROM removed_sessions LIMIT 0').all();
        })
        .immediate();
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }
  #decode(row: SessionRow | null): LocalSession | null {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      path: row.path,
      archived: Boolean(row.archived),
      status: row.status,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastOpenedAt: row.lastOpenedAt,
      ...(this.deletion(row.id) ? { removing: true as const } : {}),
    };
  }
  get(id: string) {
    return this.#decode(
      this.#db.query<SessionRow, [string]>('SELECT * FROM sessions WHERE id = ?').get(id)
    );
  }
  findPath(path: string) {
    return this.#decode(
      this.#db.query<SessionRow, [string]>('SELECT * FROM sessions WHERE path = ?').get(path)
    );
  }
  list(archived = false) {
    return this.#db
      .query<SessionRow, [number]>(
        'SELECT * FROM sessions WHERE archived = ? ORDER BY lastOpenedAt DESC, createdAt, id'
      )
      .all(Number(archived))
      .map((row) => this.#decode(row)!);
  }
  prepare(id: string, path: string, name: string | undefined, seed: string) {
    return this.#db
      .transaction(() => {
        const total = (
          this.#db.query('SELECT count(*) AS count FROM sessions').get() as { count: number }
        ).count;
        const now = Date.now();
        this.#db
          .query(
            "INSERT INTO sessions (id,name,kind,path,status,seed,createdAt,updatedAt,lastOpenedAt) VALUES (?,?,'managed',?,'creating',?,?,?,?)"
          )
          .run(id, nameOf(name ?? `Canvas ${total + 1}`), path, seed, now, now, now);
        return this.get(id)!;
      })
      .immediate();
  }
  register(path: string, name: string) {
    const now = Date.now();
    this.#db
      .query(
        "INSERT INTO sessions (id,name,kind,path,status,createdAt,updatedAt,lastOpenedAt) VALUES (?,?,'external',?,'ready',?,?,?) ON CONFLICT(path) DO NOTHING"
      )
      .run(randomUUID(), nameOf(name), path, now, now, now);
    return this.findPath(path)!;
  }
  pending() {
    return this.#db.query<SessionRow, []>("SELECT * FROM sessions WHERE status = 'creating'").all();
  }
  ready(id: string) {
    this.#db
      .query(
        "UPDATE sessions SET status = 'ready', seed = NULL, revision = revision + 1, updatedAt = ? WHERE id = ? AND status = 'creating'"
      )
      .run(Date.now(), id);
    return this.get(id)!;
  }
  rename(id: string, name: string, revision: number) {
    const result = this.#db
      .query(
        'UPDATE sessions SET name = ?, revision = revision + 1, updatedAt = ? WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM session_deletions WHERE sessionId = sessions.id)'
      )
      .run(nameOf(name), Date.now(), id, revision);
    if (!result.changes) throw new Error('Session changed. Refresh the list and try again.');
    return this.get(id)!;
  }
  archive(id: string, archived: boolean, revision: number) {
    const result = this.#db
      .query(
        'UPDATE sessions SET archived = ?, revision = revision + 1, updatedAt = ? WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM session_deletions WHERE sessionId = sessions.id)'
      )
      .run(Number(archived), Date.now(), id, revision);
    if (!result.changes) throw new Error('Session changed. Refresh the list and try again.');
    return this.get(id)!;
  }
  touch(id: string) {
    this.#db.query('UPDATE sessions SET lastOpenedAt = ? WHERE id = ?').run(Date.now(), id);
  }
  removeRecord(id: string, revision: number) {
    this.#db
      .transaction(() => {
        const record = this.get(id);
        const result = this.#db
          .query(
            'DELETE FROM sessions WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM session_deletions WHERE sessionId = sessions.id)'
          )
          .run(id, revision);
        if (!result.changes || !record)
          throw new Error('Session changed or removal is pending. Refresh the list and try again.');
        this.#recordRemoval(id, record.path);
      })
      .immediate();
  }
  #recordRemoval(id: string, path: string) {
    this.#db
      .query('INSERT OR IGNORE INTO removed_sessions (id,path,removedAt) VALUES (?,?,?)')
      .run(id, path, Date.now());
  }
  wasRemoved(id: string) {
    return Boolean(this.#db.query('SELECT 1 FROM removed_sessions WHERE id = ?').get(id));
  }
  wasPathRemoved(path: string) {
    return Boolean(
      this.#db.query('SELECT 1 FROM removed_sessions WHERE path = ? LIMIT 1').get(path)
    );
  }
  deletion(id: string) {
    return this.#db
      .query<SessionDeletion, [string]>('SELECT * FROM session_deletions WHERE sessionId = ?')
      .get(id);
  }
  deletions() {
    return this.#db.query<SessionDeletion, []>('SELECT * FROM session_deletions').all();
  }
  prepareDeletion(entry: Omit<SessionDeletion, 'state'>) {
    return this.#db
      .transaction(() => {
        const record = this.get(entry.sessionId);
        if (
          !record ||
          record.kind !== 'managed' ||
          record.path !== entry.path ||
          record.status !== 'ready' ||
          record.revision !== entry.revision ||
          record.removing
        )
          throw new Error('Session changed. Refresh and review removal again.');
        this.#db
          .query(
            "INSERT INTO session_deletions (sessionId,path,stagedPath,revision,proof,state) VALUES (?,?,?,?,?,'prepared')"
          )
          .run(entry.sessionId, entry.path, entry.stagedPath, entry.revision, entry.proof);
        return this.deletion(entry.sessionId)!;
      })
      .immediate();
  }
  commitDeletion(id: string) {
    return this.#db
      .transaction(() => {
        const entry = this.deletion(id);
        if (!entry || entry.state !== 'prepared') throw new Error('Removal is no longer pending.');
        const result = this.#db
          .query(
            "DELETE FROM sessions WHERE id = ? AND revision = ? AND kind = 'managed' AND path = ?"
          )
          .run(id, entry.revision, entry.path);
        if (!result.changes) throw new Error('Session changed during removal; file was preserved.');
        this.#recordRemoval(id, entry.path);
        this.#db
          .query("UPDATE session_deletions SET state = 'removed' WHERE sessionId = ?")
          .run(id);
        return this.deletion(id)!;
      })
      .immediate();
  }
  clearDeletion(id: string, state: SessionDeletion['state']) {
    this.#db
      .query('DELETE FROM session_deletions WHERE sessionId = ? AND state = ?')
      .run(id, state);
  }
  /** No expiry: a paused living writer never loses ownership to another process. */
  claim(path: string) {
    const token = `${this.#owner}:${randomUUID()}`;
    this.#db
      .transaction(() => {
        const existing = this.#db
          .query<{ owner: string; pid: number }, [string]>(
            'SELECT owner,pid FROM write_owners WHERE path = ?'
          )
          .get(path);
        if (existing && !existing.owner.startsWith(`${this.#owner}:`) && isAlive(existing.pid))
          throw new Error(
            'Canvas is open in another CharDesk instance. Close it there before editing.'
          );
        this.#db
          .query(
            'INSERT INTO write_owners (path,owner,pid) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET owner=excluded.owner,pid=excluded.pid'
          )
          .run(path, token, process.pid);
      })
      .immediate();
    const verify = () => {
      if (
        this.#closed ||
        this.#db
          .query<{ owner: string }, [string]>('SELECT owner FROM write_owners WHERE path = ?')
          .get(path)?.owner !== token
      )
        throw new Error('Canvas write ownership changed; save cancelled.');
    };
    return {
      verify,
      release: () => {
        if (!this.#closed)
          this.#db.query('DELETE FROM write_owners WHERE path = ? AND owner = ?').run(path, token);
      },
    };
  }
  close() {
    if (this.#closed) return;
    this.#db.query('DELETE FROM write_owners WHERE owner LIKE ?').run(`${this.#owner}:%`);
    this.#closed = true;
    this.#db.close();
  }
}
