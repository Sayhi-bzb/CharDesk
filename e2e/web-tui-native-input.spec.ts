import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

const enabled = process.platform === "darwin"
  && process.env.CHARDESK_NATIVE_INPUT === "1"
  && typeof process.env.CHARDESK_INPUT_SOURCE_BIN === "string";

test.skip(!enabled, "Run through npm run test:cell-ui:native-input on an interactive macOS desktop.");
test.describe.configure({ mode: "serial" });

const inputSourceBinary = process.env.CHARDESK_INPUT_SOURCE_BIN!;
const abcInputSource = "com.apple.keylayout.ABC";
const pinyinInputSource = "com.apple.inputmethod.SCIM.ITABC";

const currentInputSource = () =>
  execFileSync(inputSourceBinary, ["current"], { encoding: "utf8" }).trim();

const sendSystemEvents = (commands: string) => {
  execFileSync("osascript", [
    "-e",
    `tell application "System Events"\n${commands}\nend tell`,
  ]);
};

const prepareNativeFocus = async (
  page: Page,
  textbox: Locator,
  projectName: string
) => {
  await page.bringToFront();
  await textbox.focus();
  if (projectName === "webkit-cell-gallery") {
    sendSystemEvents(
      "set frontmost of first application process whose name is \"Playwright\" to true"
    );
  }
  await page.waitForTimeout(200);
};

const switchInputSource = async (
  page: Page,
  textbox: Locator,
  projectName: string,
  identifier: string
) => {
  await prepareNativeFocus(page, textbox, projectName);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (currentInputSource() === identifier) return;
    sendSystemEvents("key code 49 using {control down, option down}");
    await page.waitForTimeout(350);
  }
  throw new Error(`Cannot switch the active document input source to ${identifier}.`);
};

const clearNativeText = () => sendSystemEvents([
  "keystroke \"a\" using command down",
  "key code 51",
].join("\n"));

test("macOS input services drive composition, dead keys, Unicode, clipboard, and one-step undo", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.waitForLoadState("networkidle");

  const section = page.locator("#editor");
  const name = section.getByRole("textbox", { name: "File name" });
  const canvas = section.locator("canvas");

  await switchInputSource(page, name, testInfo.project.name, abcInputSource);
  clearNativeText();
  sendSystemEvents([
    "keystroke \"e\" using option down",
    "keystroke \"e\"",
  ].join("\n"));
  await expect(name).toHaveValue("é");
  await expect(canvas).toHaveAttribute("data-cell-text", /é/);

  await switchInputSource(page, name, testInfo.project.name, pinyinInputSource);
  clearNativeText();
  sendSystemEvents([
    "keystroke \"ni\"",
    "key code 49",
  ].join("\n"));
  await expect(name).toHaveValue("你");
  await expect(canvas).toHaveAttribute("data-cell-text", /你/);

  sendSystemEvents("keystroke \"z\" using command down");
  await expect(name).toHaveValue("");

  await switchInputSource(page, name, testInfo.project.name, abcInputSource);
  execFileSync("pbcopy", { input: "中🙂 line" });
  sendSystemEvents("keystroke \"v\" using command down");
  await expect(name).toHaveValue("中🙂 line");
  sendSystemEvents([
    "keystroke \"a\" using command down",
    "keystroke \"c\" using command down",
  ].join("\n"));
  expect(execFileSync("pbpaste", { encoding: "utf8" })).toBe("中🙂 line");
  sendSystemEvents("keystroke \"x\" using command down");
  await expect(name).toHaveValue("");
  expect(execFileSync("pbpaste", { encoding: "utf8" })).toBe("中🙂 line");
  sendSystemEvents("keystroke \"v\" using command down");
  await expect(name).toHaveValue("中🙂 line");

  expect(pageErrors, `${testInfo.project.name} emitted page errors`).toEqual([]);
});
