import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import type { CanvasDocumentAddress } from '@chardesk/editor-core/canvasDocumentModel';
import { TerminalCanvas } from './model.ts';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { atomicWrite } from './storage.ts';
import { FileSourceBinding, readOptionalFileText as readOptional } from './fileSource.ts';

export { readOptional };
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
  readonly source: FileSourceBinding;
  #saving = false;
  address?: CanvasDocumentAddress;
  writeGuard?: () => void;
  constructor(
    readonly path: string,
    readonly title: string,
    source: string | null
  ) {
    this.source = new FileSourceBinding(path, source);
  }
  get baselineSource() {
    return this.source.baseline.source;
  }
  get baselineDigest() {
    return this.source.baseline.digest;
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
    this.writeGuard?.();
    if (this.#saving) throw new Error('Save is already in progress.');
    this.#saving = true;
    try {
      const address = this.address ?? model.documents.getActiveAddress();
      const document = model.documents.getDocumentDraft(address.documentId);
      if (!document) throw new Error('Document is no longer open.');
      const version = model.versionAt(address);
      const source = serializeCanvasDocument(document, this.title);
      this.source.assertBaseline(await this.source.read());
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
          this.writeGuard?.();
          this.source.assertBaseline(await this.source.read());
        },
        mode
      );
      this.source.accept(source);
      model.markSavedAt(address, version);
    } finally {
      this.#saving = false;
    }
  }
}
