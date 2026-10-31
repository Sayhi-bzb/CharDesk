import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import type { CanvasDocumentAddress } from '@chardesk/editor-core/canvasDocumentModel';
import { TerminalCanvas } from './model.ts';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { atomicWrite, sourceDigest } from './storage.ts';

export const readOptional = async (path: string) => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};
export async function resolveCanvasFilePath(input: string) {
  const path = resolve(input);
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(await realpath(dirname(path)), basename(path));
  }
}

export class CanvasFile {
  #source: string | null;
  #digest: string | null;
  #saving = false;
  address?: CanvasDocumentAddress;
  constructor(
    readonly path: string,
    readonly title: string,
    source: string | null
  ) {
    this.#source = source;
    this.#digest = sourceDigest(source);
  }
  get baselineSource() {
    return this.#source;
  }
  get baselineDigest() {
    return this.#digest;
  }

  static async open(input: string, initialBody = '', options: FreeformEditorSessionOptions = {}) {
    const path = await resolveCanvasFilePath(input);
    const source = await readOptional(path);
    const parsed = source === null ? null : parseCanvasDocument(source);
    const model = new TerminalCanvas(source === null ? initialBody : '', {
      ...options,
      ...(parsed ? { document: parsed.document } : {}),
    });
    const file = new CanvasFile(path, parsed?.title ?? basename(path, '.chardesk'), source);
    file.address = model.documents.getActiveAddress();
    return { file, model };
  }

  async save(model: TerminalCanvas) {
    if (this.#saving) throw new Error('Save is already in progress.');
    this.#saving = true;
    try {
      const address = this.address ?? model.documents.getActiveAddress();
      const document = model.documents.getDocumentDraft(address.documentId);
      if (!document) throw new Error('Document is no longer open.');
      const version = model.versionAt(address);
      const source = serializeCanvasDocument(document, this.title);
      if ((await readOptional(this.path)) !== this.#source) {
        throw new Error('File changed on disk. Save cancelled; your edits are still in memory.');
      }
      const mode = await stat(this.path)
        .then((info) => info.mode & 0o777)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return 0o600;
        });
      await atomicWrite(
        this.path,
        source,
        async () => {
          if ((await readOptional(this.path)) !== this.#source)
            throw new Error(
              'File changed on disk. Save cancelled; your edits are still in memory.'
            );
        },
        mode
      );
      this.#source = source;
      this.#digest = sourceDigest(source);
      model.markSavedAt(address, version);
    } finally {
      this.#saving = false;
    }
  }
}
