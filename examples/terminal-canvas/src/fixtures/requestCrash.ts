import { writeFile } from 'node:fs/promises';
import { LocalCanvasStore } from '../../../../packages/local-runtime/src/canvasStore.ts';

const [, , path, ready] = process.argv;
const store = new LocalCanvasStore(path!);
setInterval(() => {}, 1000);
await store.runRequest('canvas', 'interrupted', 'fingerprint', async () => {
  await writeFile(ready!, 'reserved');
  await new Promise(() => {});
});
