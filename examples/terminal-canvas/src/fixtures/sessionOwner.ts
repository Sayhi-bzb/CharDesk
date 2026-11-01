import { writeFile } from 'node:fs/promises';
import { LocalSessionCatalog } from '../sessionCatalog.ts';

const [, , database, path, ready] = process.argv;
const catalog = new LocalSessionCatalog(database!);
catalog.claim(path!);
await writeFile(ready!, 'ready');
setInterval(() => {}, 1000);
