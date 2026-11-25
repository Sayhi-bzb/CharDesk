import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';

type VersionRow = {
  digest: string | null;
  version: string;
  pendingDigest: string | null;
  pendingVersion: string | null;
};
export type ContentRecovery = {
  baselineDigest: string | null;
  source: string;
  version: string;
  copyId: string | null;
};

export class LocalCanvasStore {
  readonly #db: Database;
  #closed = false;
  readonly #requests = new Map<string, Promise<unknown>>();
  constructor(readonly path: string) {
    this.#db = new Database(path, { create: true, strict: true });
    try {
      this.#db.exec('PRAGMA busy_timeout = 100; PRAGMA synchronous = FULL;');
      this.#db
        .transaction(() => {
          const { user_version: version } = this.#db.query('PRAGMA user_version').get() as {
            user_version: number;
          };
          if (version > 3)
            throw new Error('Canvas runtime storage needs a newer CharDesk version.');
          if (version === 0) {
            const tables = this.#db
              .query(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
              )
              .all();
            if (tables.length)
              throw new Error('Unrecognized Canvas runtime storage; it was preserved.');
            this.#db.exec(`
          CREATE TABLE content_versions (
            canvasId TEXT PRIMARY KEY, digest TEXT, version TEXT NOT NULL,
            pendingDigest TEXT, pendingVersion TEXT
          );
          PRAGMA user_version = 1;
        `);
          }
          this.#db
            .query(
              'SELECT canvasId, digest, version, pendingDigest, pendingVersion FROM content_versions LIMIT 0'
            )
            .all();
          if (version < 2)
            this.#db.exec(`
            CREATE TABLE requests (
              canvasId TEXT NOT NULL, requestId TEXT NOT NULL, fingerprint TEXT NOT NULL,
              result TEXT, PRIMARY KEY(canvasId, requestId)
            );
            PRAGMA user_version = 2;
          `);
          this.#db
            .query('SELECT canvasId, requestId, fingerprint, result FROM requests LIMIT 0')
            .all();
          if (version < 3)
            this.#db.exec(`
            CREATE TABLE content_recovery (
              canvasId TEXT PRIMARY KEY, baselineDigest TEXT, source TEXT NOT NULL,
              version TEXT NOT NULL, copyId TEXT
            );
            PRAGMA user_version = 3;
          `);
          this.#db
            .query(
              'SELECT canvasId, baselineDigest, source, version, copyId FROM content_recovery LIMIT 0'
            )
            .all();
        })
        .immediate();
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  versionFor(canvasId: string, digest: string): string {
    return this.#db
      .transaction(() => {
        const row = this.#db
          .query<VersionRow, [string]>('SELECT * FROM content_versions WHERE canvasId = ?')
          .get(canvasId);
        let version: string;
        if (row?.pendingDigest === digest && row.pendingVersion) version = row.pendingVersion;
        else if (row?.digest === digest) version = row.version;
        else version = randomUUID();
        if (row?.pendingDigest === digest && row.pendingVersion)
          this.#settleRecovery(canvasId, row.digest, digest, version);
        this.#db
          .query(
            `INSERT INTO content_versions (canvasId, digest, version) VALUES (?, ?, ?)
        ON CONFLICT(canvasId) DO UPDATE SET digest = excluded.digest, version = excluded.version,
        pendingDigest = NULL, pendingVersion = NULL`
          )
          .run(canvasId, digest, version);
        return version;
      })
      .immediate();
  }

  prepareVersion(canvasId: string, digest: string, version: string) {
    this.#db
      .query(
        `INSERT INTO content_versions (canvasId, version, pendingDigest, pendingVersion)
      VALUES (?, ?, ?, ?) ON CONFLICT(canvasId) DO UPDATE SET
      pendingDigest = excluded.pendingDigest, pendingVersion = excluded.pendingVersion`
      )
      .run(canvasId, version, digest, version);
  }

  acceptVersion(canvasId: string, digest: string, version: string) {
    this.#db
      .transaction(() => {
        const row = this.#db
          .query<VersionRow, [string]>('SELECT * FROM content_versions WHERE canvasId = ?')
          .get(canvasId);
        if (row?.pendingDigest !== digest || row.pendingVersion !== version) return;
        this.#db
          .query(
            `UPDATE content_versions SET digest = ?, version = ?, pendingDigest = NULL, pendingVersion = NULL
      WHERE canvasId = ? AND pendingDigest = ? AND pendingVersion = ?`
          )
          .run(digest, version, canvasId, digest, version);
        this.#settleRecovery(canvasId, row.digest, digest, version);
      })
      .immediate();
  }

  #settleRecovery(
    canvasId: string,
    previousDigest: string | null,
    digest: string,
    version: string
  ) {
    this.#db
      .query('DELETE FROM content_recovery WHERE canvasId = ? AND version = ?')
      .run(canvasId, version);
    this.#db
      .query(
        'UPDATE content_recovery SET baselineDigest = ? WHERE canvasId = ? AND baselineDigest IS ?'
      )
      .run(digest, canvasId, previousDigest);
  }

  retainRecovery(canvasId: string, baselineDigest: string | null, source: string, version: string) {
    this.#db
      .query(
        `INSERT INTO content_recovery (canvasId, baselineDigest, source, version) VALUES (?, ?, ?, ?)
      ON CONFLICT(canvasId) DO UPDATE SET baselineDigest = excluded.baselineDigest,
      source = excluded.source, version = excluded.version, copyId = NULL`
      )
      .run(canvasId, baselineDigest, source, version);
  }

  recoveryFor(canvasId: string) {
    return this.#db
      .query<ContentRecovery, [string]>('SELECT * FROM content_recovery WHERE canvasId = ?')
      .get(canvasId);
  }

  recoveryCopyId(canvasId: string): string {
    this.#db
      .query('UPDATE content_recovery SET copyId = COALESCE(copyId, ?) WHERE canvasId = ?')
      .run(randomUUID(), canvasId);
    const id = this.recoveryFor(canvasId)!.copyId!;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Invalid recovery Canvas identity; runtime storage was preserved.');
    return id;
  }

  clearRecovery(canvasId: string, version: string) {
    this.#db
      .query('DELETE FROM content_recovery WHERE canvasId = ? AND version = ?')
      .run(canvasId, version);
  }

  runRequest(
    canvasId: string,
    requestId: string,
    fingerprint: string,
    run: () => Promise<unknown>
  ): Promise<unknown> {
    const key = JSON.stringify([canvasId, requestId]);
    const row = this.#db
      .transaction(() => {
        const existing = this.#db
          .query<{ fingerprint: string; result: string | null }, [string, string]>(
            'SELECT fingerprint, result FROM requests WHERE canvasId = ? AND requestId = ?'
          )
          .get(canvasId, requestId);
        if (!existing)
          this.#db
            .query('INSERT INTO requests (canvasId, requestId, fingerprint) VALUES (?, ?, ?)')
            .run(canvasId, requestId, fingerprint);
        return existing;
      })
      .immediate();
    if (row) {
      if (row.fingerprint !== fingerprint)
        return Promise.resolve({
          ok: false,
          code: 'request_id_conflict',
          message: 'This requestId was already used with different parameters.',
        });
      if (row.result !== null) return Promise.resolve(JSON.parse(row.result));
      return (
        this.#requests.get(key) ??
        Promise.resolve({
          ok: false,
          code: 'execution_unknown',
          message:
            'The previous owner stopped before recording this request result. Inspect the Canvas before issuing a new requestId; this request was not replayed.',
        })
      );
    }
    const pending = Promise.resolve()
      .then(run)
      .then(
        (result) => result,
        (error: unknown) => ({ ok: false, code: 'operation_failed', message: String(error) })
      )
      .then((result) => {
        try {
          const encoded = JSON.stringify(result ?? null);
          this.#db
            .query(
              'UPDATE requests SET result = ? WHERE canvasId = ? AND requestId = ? AND fingerprint = ?'
            )
            .run(encoded, canvasId, requestId, fingerprint);
          return JSON.parse(encoded) as unknown;
        } catch (error) {
          return {
            ok: false,
            code: 'execution_unknown',
            message: `The operation result could not be recorded. Inspect before retrying: ${String(error)}`,
          };
        }
      })
      .finally(() => this.#requests.delete(key));
    this.#requests.set(key, pending);
    return pending;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#db.close();
  }
}
