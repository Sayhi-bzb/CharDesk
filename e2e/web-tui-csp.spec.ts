import { expect, test } from "@playwright/test";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
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
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      externalRequests.push(url.href);
      await route.abort();
      return;
    }
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
  await expect(page.getByRole("heading", { name: "Text", level: 1 })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveAttribute("data-cell-text", /Unicode: 世界 👋/);
  const gallery = page.locator(".gallery-page");
  await page.getByRole("button", { name: "Use Ark Pixel 12px Mono" }).click();
  await expect(gallery).toHaveAttribute("data-gallery-font", "ark-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  expect(externalRequests).toEqual([]);
  await page.getByRole("button", { name: "Use Xiaolai Mono" }).click();
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  await expect(gallery).toHaveAttribute("data-gallery-font", "xiaolai-mono");
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
