import { writeFile } from 'node:fs/promises';
import { LocalSessions } from '../../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from '../../../../packages/local-runtime/src/workspace.ts';
import { localCapabilities } from '../../../../packages/local-runtime/src/capabilities.ts';
import { resolveAppPaths } from '../../../../packages/local-runtime/src/appPaths.ts';

const [, , file, ready] = process.argv;
const sessions = await LocalSessions.open(resolveAppPaths());
const workspace = TerminalWorkspace.empty();
await sessions.attach(workspace);
await sessions.openPath(file!);
const runRequest = sessions.content.runRequest.bind(sessions.content);
sessions.content.runRequest = (canvasId, requestId, fingerprint, run) =>
  runRequest(canvasId, requestId, fingerprint, async () => {
    const result = await run();
    await writeFile(ready!, JSON.stringify(result));
    await new Promise(() => {});
  });
setInterval(() => {}, 1000);
await localCapabilities(workspace, sessions, true).execute('canvas_write', {
  at: [0, 0],
  content: 'COMMITTED',
  requestId: 'committed-request',
});
