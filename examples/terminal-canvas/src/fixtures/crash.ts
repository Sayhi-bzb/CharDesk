import { writeFile } from 'node:fs/promises';
import { TerminalWorkspace } from '../workspace.ts';
import { WorkspacePersistence } from '../persistence.ts';

const [, , checkpoint, path, ready] = process.argv;
const workspace = await TerminalWorkspace.open(path!);
workspace.model.commands.pointAt({ x: -7, y: -8 });
workspace.model.commands.insert('CRASH');
const persistence = await WorkspacePersistence.open(checkpoint!);
persistence.start(workspace, { autosaveMs: -1 });
await persistence.flush();
await writeFile(ready!, 'ready');
setInterval(() => {}, 1000);
