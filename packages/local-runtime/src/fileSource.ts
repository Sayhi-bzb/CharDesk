import { readFile, stat } from 'node:fs/promises';
import { sourceDigest } from './storage.ts';

export type FileSourceSnapshot = Readonly<{ source: string | null; digest: string | null }>;
export type FileSourceObservation = Readonly<{
  state: 'current' | 'changed' | 'missing' | 'unreadable';
  digest: string | null;
  error?: string;
}>;

export async function readOptionalFileText(path: string) {
  const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (bytes === null) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Source file is not valid UTF-8.');
  }
}
export async function readFileSource(path: string): Promise<FileSourceSnapshot> {
  const source = await readOptionalFileText(path);
  return { source, digest: sourceDigest(source) };
}

/** One file binding owns the baseline and advisory observation, never editor state. */
export class FileSourceBinding {
  #baseline: FileSourceSnapshot;
  #observation: FileSourceObservation;
  #generation = 0;
  #probe = 0;
  #signature: string | null | undefined;
  constructor(
    readonly path: string,
    source: string | null
  ) {
    this.#baseline = { source, digest: sourceDigest(source) };
    this.#observation = { state: 'current', digest: this.#baseline.digest };
  }
  get baseline() {
    return this.#baseline;
  }
  get observation() {
    return this.#observation;
  }
  read() {
    return readFileSource(this.path);
  }
  accept(source: string) {
    this.#generation++;
    this.#signature = undefined;
    this.#baseline = { source, digest: sourceDigest(source) };
    this.#observation = { state: 'current', digest: this.#baseline.digest };
  }
  /** Poll metadata cheaply; explicit checks/focus and commit checks always read content. */
  async inspectIfChanged() {
    try {
      const signature = await stat(this.path, { bigint: true })
        .then((info) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
      if (signature === this.#signature) return this.#observation;
      this.#signature = signature;
    } catch {
      this.#signature = undefined;
    }
    return this.inspect();
  }
  assertBaseline(snapshot: FileSourceSnapshot) {
    if (snapshot.digest !== this.#baseline.digest || snapshot.source !== this.#baseline.source)
      throw new Error('File changed on disk. Save cancelled; your edits are still in memory.');
  }
  async inspect(read = () => this.read()) {
    const generation = this.#generation,
      probe = ++this.#probe;
    try {
      const snapshot = await read();
      if (generation !== this.#generation || probe !== this.#probe) return this.#observation;
      this.#observation = {
        state:
          snapshot.digest === this.#baseline.digest
            ? 'current'
            : snapshot.source === null
              ? 'missing'
              : 'changed',
        digest: snapshot.digest,
      };
    } catch (error) {
      if (generation === this.#generation && probe === this.#probe)
        this.#observation = {
          state: 'unreadable',
          digest: null,
          error: error instanceof Error ? error.message : String(error),
        };
    }
    return this.#observation;
  }
}
