import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const bridgeHtml = readFileSync(new URL("../apps/site/migration/bridge.html", import.meta.url), "utf8");
const bridgeScript = readFileSync(new URL("../apps/site/migration/bridge.js", import.meta.url), "utf8");

test("old origin sends Canvas document data through the automatic frame", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit requires a top-level transfer tab for old-origin storage");
  await page.route("https://chardesk.com/migration/bridge.html", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: bridgeHtml,
  }));
  await page.route("https://chardesk.com/migration/bridge.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: bridgeScript,
  }));
  await page.route("https://canvas.chardesk.com/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Canvas transfer test</title>",
  }));

  await page.goto("https://chardesk.com/migration/bridge.html");
  await page.evaluate(async () => {
    localStorage.setItem("chardesk-canvas-font-v1", "fusion");
    localStorage.setItem("chardesk-canvas-writer-lease-v1", "stale");
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("chardesk-local-document-v1:transfer-test", 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("updates", { autoIncrement: true });
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction("updates", "readwrite");
        transaction.objectStore("updates").add(new Uint8Array([1, 2, 3]));
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  await page.goto("https://canvas.chardesk.com/");
  const result = await page.evaluate(() => new Promise<{
    origin: string;
    storage: [string, string][];
    value: number[];
  }>((resolve, reject) => {
    const frame = document.createElement("iframe");
    const token = "test-transfer";
    const timeout = window.setTimeout(() => reject(new Error("bridge timed out")), 10_000);
    window.addEventListener("message", (event) => {
      if (event.data?.token !== token) return;
      window.clearTimeout(timeout);
      if (event.data.type !== "chardesk-migration-snapshot") {
        reject(new Error(event.data.message));
        return;
      }
      resolve({
        origin: event.origin,
        storage: event.data.storage,
        value: Array.from(event.data.databases[0].stores[0].records[0].value),
      });
    });
    frame.onload = () => frame.contentWindow?.postMessage(
      { type: "chardesk-migration-request", token }, "https://chardesk.com",
    );
    frame.src = "https://chardesk.com/migration/bridge.html";
    document.body.append(frame);
  }));

  expect(result.origin).toBe("https://chardesk.com");
  expect(result.value).toEqual([1, 2, 3]);
  expect(result.storage).toContainEqual(["chardesk-canvas-font-v1", "fusion"]);
  expect(result.storage.some(([key]) => key.includes("lease"))).toBe(false);
});

test("top-level transfer tab can read old-origin storage", async ({ page, context }) => {
  await context.route("https://chardesk.com/migration/bridge.html", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: bridgeHtml,
  }));
  await context.route("https://chardesk.com/migration/bridge.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: bridgeScript,
  }));
  await context.route("https://canvas.chardesk.com/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Canvas transfer test</title>",
  }));

  await page.goto("https://chardesk.com/migration/bridge.html");
  await page.evaluate(async () => {
    localStorage.setItem("chardesk-canvas-font-v1", "fusion");
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("chardesk-local-document-v1:popup-test", 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("updates", { autoIncrement: true });
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction("updates", "readwrite");
        transaction.objectStore("updates").add(new Uint8Array([4, 5, 6]));
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  await page.goto("https://canvas.chardesk.com/");
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "Transfer";
    button.onclick = () => {
      const popup = window.open("https://chardesk.com/migration/bridge.html", "transfer-test");
      window.addEventListener("message", (event) => {
        if (event.origin !== "https://chardesk.com" || event.source !== popup) return;
        if (event.data?.type === "chardesk-migration-ready") {
          popup?.postMessage({ type: "chardesk-migration-request", token: "popup-test" }, "https://chardesk.com");
        } else if (event.data?.type === "chardesk-migration-snapshot") {
          document.body.dataset.transfer = JSON.stringify({
            storage: event.data.storage,
            value: Array.from(event.data.databases[0].stores[0].records[0].value),
          });
          popup?.close();
        }
      });
    };
    document.body.append(button);
  });
  await page.getByRole("button", { name: "Transfer" }).click();
  await expect.poll(() => page.locator("body").getAttribute("data-transfer"), { timeout: 15_000 })
    .not.toBeNull();
  const result = JSON.parse((await page.locator("body").getAttribute("data-transfer"))!);
  expect(result.value).toEqual([4, 5, 6]);
  expect(result.storage).toContainEqual(["chardesk-canvas-font-v1", "fusion"]);
});
