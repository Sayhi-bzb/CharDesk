import { expect, test } from "@playwright/test";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' ws:",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

test("Gallery initializes Yoga under the production-equivalent WASM CSP", async ({ page }) => {
  const pageErrors: string[] = [];
  let refreshPreamble = "";
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/__csp_refresh_preamble.js") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: refreshPreamble,
      });
      return;
    }
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    const inlineScripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
    const refresh = inlineScripts.find((match) => match[1]?.includes("/@react-refresh"));
    if (!refresh?.[0] || !refresh[1]) throw new Error("Vite React refresh preamble was not found.");
    refreshPreamble = refresh[1];
    const headers = { ...response.headers(), "content-security-policy": CSP };
    delete headers["content-length"];
    await route.fulfill({
      response,
      body: html.replace(
        refresh[0],
        '<script type="module" src="/__csp_refresh_preamble.js"></script>'
      ),
      headers,
    });
  });

  const response = await page.goto("/exp/web-tui/");
  expect(response?.headers()["content-security-policy"]).toBe(CSP);
  await expect(page.getByRole("heading", { name: "Cell UI Gallery" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(9);
  await expect(page.locator("canvas").first()).toHaveAttribute("data-cell-text", /New file/);
  expect(pageErrors).toEqual([]);
});
