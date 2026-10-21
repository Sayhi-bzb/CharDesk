import { startBroker } from './broker.mjs';

const startupDeadline = setTimeout(() => {
  console.error('CharDesk MCP bridge startup timed out.');
  process.exit(1);
}, 5000);
startupDeadline.unref();
try {
  const broker = await startBroker();
  clearTimeout(startupDeadline);
  const stop = () => { void broker.stop(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await broker.closed;
} catch (error) {
  clearTimeout(startupDeadline);
  if (error.code !== 'EADDRINUSE') {
    console.error(`CharDesk MCP bridge failed to start: ${error.message}`);
    process.exitCode = 1;
  }
}
