import { resolve } from 'node:path';
import { atomicWrite } from '@chardesk/local-runtime/storage';

export async function deliverExportFile(
  path: string,
  content: string | Uint8Array,
  isCurrent = () => true
) {
  try {
    await atomicWrite(
      resolve(path),
      content,
      async () => {
        if (!isCurrent()) throw new Error('Export cancelled.');
      },
      0o600,
      false
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('The export path already exists. Choose a new path.');
    throw error;
  }
}
