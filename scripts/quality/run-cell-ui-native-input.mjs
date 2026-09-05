import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") {
  throw new Error("Cell UI native input verification requires macOS.");
}

try {
  execFileSync("osascript", [
    "-e",
    "tell application \"System Events\" to count UI elements of first application process whose frontmost is true",
  ], { stdio: "ignore" });
} catch {
  throw new Error([
    "macOS denied native keyboard automation.",
    "Enable Accessibility access for the current Codex host in",
    "System Settings > Privacy & Security > Accessibility, then run this command again.",
  ].join(" "));
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "chardesk-native-input-"));
const moduleCache = join(temporaryDirectory, "swift-module-cache");
const inputSourceBinary = join(temporaryDirectory, "macos-input-source");
mkdirSync(moduleCache);

execFileSync("swiftc", [
  "-module-cache-path",
  moduleCache,
  resolve("scripts/quality/macos-input-source.swift"),
  "-o",
  inputSourceBinary,
], { stdio: "inherit" });

const originalInputSource = execFileSync(inputSourceBinary, ["current"], {
  encoding: "utf8",
}).trim();
const originalClipboard = execFileSync("pbpaste");
const originalFrontmostApplication = execFileSync("osascript", [
  "-e",
  "tell application \"System Events\" to get name of first application process whose frontmost is true",
], { encoding: "utf8" }).trim();
const projects = process.argv.length > 2
  ? process.argv.slice(2)
  : ["chromium", "webkit-cell-gallery"];

try {
  execFileSync(resolve("node_modules/.bin/playwright"), [
    "test",
    "e2e/web-tui-native-input.spec.ts",
    ...projects.map((project) => `--project=${project}`),
    "--headed",
    "--workers=1",
  ], {
    env: {
      ...process.env,
      CHARDESK_NATIVE_INPUT: "1",
      CHARDESK_INPUT_SOURCE_BIN: inputSourceBinary,
      PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? "5201",
    },
    stdio: "inherit",
  });
} finally {
  try {
    execFileSync(inputSourceBinary, ["select", originalInputSource]);
  } finally {
    try {
      execFileSync("pbcopy", { input: originalClipboard });
    } finally {
      try {
        execFileSync("osascript", [
          "-e",
          `tell application "System Events" to set frontmost of first application process whose name is "${originalFrontmostApplication}" to true`,
        ]);
      } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
  }
}
