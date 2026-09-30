import { readFile } from "node:fs/promises";

try {
  const { bridgeUrl, pid } = JSON.parse(await readFile(new URL("../../.pi/chardesk-bridge.local.json", import.meta.url), "utf8"));
  process.kill(pid, 0);
  console.log(bridgeUrl);
} catch {
  console.error("Start Pi from the CharDesk repository and approve its chardesk MCP server first.");
  process.exitCode = 1;
}
