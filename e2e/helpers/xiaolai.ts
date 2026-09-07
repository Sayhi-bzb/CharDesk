import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const downloads = new Map<string, Promise<Buffer>>();

// Opt-in live probe: curl honors the developer's network proxy. No font bytes
// are persisted or substituted, and normal regression runs stay offline.
export async function routeLiveXiaolai(page: Page) {
  await page.route("https://fontsapi.zeoseven.com/282/main/**", async (route) => {
    const url = route.request().url();
    let pending = downloads.get(url);
    if (!pending) {
      pending = execFileAsync("curl", ["-fsSL", "--max-time", "45", url], {
        encoding: "buffer", maxBuffer: 16 * 1024 * 1024,
      }).then(({ stdout }) => stdout);
      downloads.set(url, pending);
    }
    try {
      const body = await pending;
      const css = url.endsWith(".css");
      await route.fulfill({
        contentType: css ? "text/css" : "font/woff2",
        headers: { "access-control-allow-origin": "*" },
        // Ensure the audit measures downloaded bytes, not an installed face.
        body: css ? body.toString("utf8").replaceAll(/local\([^)]*\),/g, "") : body,
      });
    } catch (error) {
      downloads.delete(url);
      await route.abort();
      throw error;
    }
  });
}
