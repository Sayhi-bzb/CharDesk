import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  AgentIdentity,
  AgentInboxStorage,
  CanvasAgentActivity,
  AgentActivityStatus,
  ActivityReceipt,
  AgentInvocation,
  AgentInvocationDetails,
} from './agents.ts';

export class LocalAgentInboxStore implements AgentInboxStorage {
  readonly #db: Database;
  readonly #owner = randomUUID();
  #closed = false;
  constructor(readonly path: string) {
    this.#db = new Database(path, { create: true, strict: true });
    try {
      this.#db.exec('PRAGMA busy_timeout = 500; PRAGMA synchronous = FULL;');
      this.#db
        .transaction(() => {
          const { user_version: version } = this.#db.query('PRAGMA user_version').get() as {
            user_version: number;
          };
          if (version > 2) throw new Error('Agent inbox needs a newer CharDesk version.');
          if (!version) {
            const tables = this.#db
              .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
              )
              .all();
            if (tables.length) throw new Error('Unrecognized agent inbox; it was preserved.');
            this.#db.exec(`CREATE TABLE agent_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT, canvasId TEXT NOT NULL, agentId TEXT NOT NULL,
            name TEXT NOT NULL, operation TEXT NOT NULL, status TEXT NOT NULL,
            startedAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1, readRevision INTEGER NOT NULL DEFAULT 0,
            owner TEXT NOT NULL, pid INTEGER NOT NULL
          );
          CREATE INDEX agent_activity_canvas ON agent_activity(canvasId, id DESC);
          PRAGMA user_version = 1;`);
          }
          if (version < 2)
            this.#db.exec(`ALTER TABLE agent_activity ADD COLUMN argvJson TEXT;
            ALTER TABLE agent_activity ADD COLUMN inputJson TEXT; PRAGMA user_version = 2;`);
          this.#db
            .query(
              'SELECT id, canvasId, agentId, name, operation, status, startedAt, updatedAt, revision, readRevision, owner, pid FROM agent_activity LIMIT 0'
            )
            .all();
        })
        .immediate();
      const owners = this.#db
        .query<{ owner: string; pid: number }, []>(
          "SELECT DISTINCT owner, pid FROM agent_activity WHERE status = 'working'"
        )
        .all();
      for (const { owner, pid } of owners) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') this.#interrupt(owner);
        }
      }
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }
  create(
    canvasId: string,
    identity: AgentIdentity,
    operation: string,
    now: number,
    invocation?: AgentInvocation
  ) {
    return Number(
      this.#db
        .query(
          `INSERT INTO agent_activity
      (canvasId, agentId, name, operation, status, startedAt, updatedAt, owner, pid, argvJson, inputJson)
      VALUES (?, ?, ?, ?, 'working', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          canvasId,
          identity.id,
          identity.name,
          operation,
          now,
          now,
          this.#owner,
          process.pid,
          invocation?.argv ? JSON.stringify(invocation.argv) : null,
          invocation?.input ? JSON.stringify(invocation.input) : null
        ).lastInsertRowid
    );
  }
  details(canvasId: string, id: number): AgentInvocationDetails | undefined {
    const row = this.#db
      .query<{ argvJson: string | null; inputJson: string | null }, [string, number]>(
        'SELECT argvJson, inputJson FROM agent_activity WHERE canvasId = ? AND id = ?'
      )
      .get(canvasId, id);
    return row
      ? { argv: row.argvJson ? JSON.parse(row.argvJson) : null, input: row.inputJson }
      : undefined;
  }
  finish(id: number, status: Exclude<AgentActivityStatus, 'working'>, now: number) {
    this.#db
      .query(
        `UPDATE agent_activity SET status = ?, updatedAt = ?, revision = revision + 1
      WHERE id = ? AND owner = ? AND status = 'working'`
      )
      .run(status, now, id, this.#owner);
  }
  #where(read: boolean) {
    return read ? 'readRevision >= revision' : 'readRevision < revision';
  }
  list(canvasId: string, read: boolean, limit: number, offset: number) {
    return this.#db
      .query<CanvasAgentActivity, [string, number, number]>(
        `SELECT id, canvasId, agentId, name,
      operation, status, startedAt, updatedAt, revision, readRevision FROM agent_activity
      WHERE canvasId = ? AND ${this.#where(read)} ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(canvasId, limit, offset);
  }
  count(canvasId: string, read: boolean) {
    return this.#db
      .query<{ count: number }, [string]>(
        `SELECT COUNT(*) AS count FROM agent_activity
      WHERE canvasId = ? AND ${this.#where(read)}`
      )
      .get(canvasId)!.count;
  }
  markRead(canvasId: string, seen: readonly ActivityReceipt[]) {
    this.#db
      .transaction(() => {
        for (const { id, revision } of seen)
          this.#db
            .query(
              `UPDATE agent_activity SET readRevision = MAX(readRevision, MIN(revision, ?))
          WHERE canvasId = ? AND id = ?`
            )
            .run(revision, canvasId, id);
      })
      .immediate();
  }
  markAllRead(canvasId: string) {
    this.#db
      .query(
        'UPDATE agent_activity SET readRevision = revision WHERE canvasId = ? AND readRevision < revision'
      )
      .run(canvasId);
  }
  #interrupt(owner: string) {
    this.#db
      .query(
        `UPDATE agent_activity SET status = 'interrupted', updatedAt = ?, revision = revision + 1
      WHERE owner = ? AND status = 'working'`
      )
      .run(Date.now(), owner);
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#interrupt(this.#owner);
    } finally {
      this.#db.close();
    }
  }
}
