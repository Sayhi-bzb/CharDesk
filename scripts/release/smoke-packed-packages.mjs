import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [protocolTarball, fontsTarball, mapleTarball, cliTarball] = process.argv.slice(2).map((value) =>
  value ? path.resolve(value) : value
);

if (!protocolTarball || !fontsTarball || !mapleTarball || !cliTarball) {
  throw new Error(
    "Usage: node scripts/release/smoke-packed-packages.mjs <protocol.tgz> <fonts.tgz> <font-maple.tgz> <cli.tgz>"
  );
}

for (const tarball of [protocolTarball, fontsTarball, mapleTarball, cliTarball]) {
  if (!fs.existsSync(tarball)) {
    throw new Error(`Missing package tarball: ${tarball}`);
  }
}

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "chardesk-package-smoke-")
);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  fs.writeFileSync(
    path.join(temporaryDirectory, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2)
  );
  execFileSync(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      protocolTarball,
      fontsTarball,
      mapleTarball,
      cliTarball,
    ],
    { cwd: temporaryDirectory, stdio: "inherit" }
  );

  const smokeTest = `
    import fs from "node:fs";
    import { CHARDESK_SYSTEM_FONT_PROFILE } from "@chardesk/fonts";
    import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
    import { parseCharDeskText } from "@chardesk/protocol";

    const parsed = parseCharDeskText("A界");
    if (parsed.width !== 3 || parsed.cells.length !== 2) {
      throw new Error("Protocol package returned an unexpected Unicode cell layout");
    }
    if (!CHARDESK_SYSTEM_FONT_PROFILE?.families?.text) {
      throw new Error("Fonts package did not export its renderer profile");
    }
    if (MAPLE_FONT_PROFILE?.capabilities?.display?.families?.regular?.includes("Maple") !== true) {
      throw new Error("Maple package did not compose a display profile");
    }
    for (const relativePath of [
      "node_modules/@chardesk/fonts/fonts.css",
      "node_modules/@chardesk/fonts/manifest.json",
      "node_modules/@chardesk/font-maple/fonts.css",
      "node_modules/@chardesk/font-maple/manifest.json",
    ]) {
      if (!fs.existsSync(new URL(relativePath, import.meta.url))) {
        throw new Error(\`Missing published font asset: \${relativePath}\`);
      }
    }
  `;
  const smokeTestPath = path.join(temporaryDirectory, "smoke.mjs");
  fs.writeFileSync(smokeTestPath, smokeTest);
  execFileSync(process.execPath, [smokeTestPath], {
    cwd: temporaryDirectory,
    stdio: "inherit",
  });
  const cli = path.join(
    temporaryDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "chardesk.cmd" : "chardesk",
  );
  const cliManifest = JSON.parse(fs.readFileSync(path.join(
    temporaryDirectory,
    "node_modules",
    "@chardesk",
    "cli",
    "package.json",
  ), "utf8"));
  if (cliManifest.bin?.chardesk !== "dist/cli.js" || !fs.existsSync(cli)) {
    throw new Error("Packed CLI did not install the chardesk executable");
  }
  if (!fs.existsSync(path.join(
    temporaryDirectory,
    "node_modules",
    "@chardesk",
    "cli",
    "CHANGELOG.md",
  ))) {
    throw new Error("Packed CLI did not include its changelog");
  }
  const cliRuntime = path.join(
    temporaryDirectory,
    "node_modules",
    "@chardesk",
    "cli",
    "dist",
    "runtime",
    "index.html",
  );
  if (!fs.existsSync(cliRuntime)) {
    throw new Error("Packed CLI did not include its local Canvas runtime");
  }
  const cliRuntimeHtml = fs.readFileSync(cliRuntime, "utf8");
  if (!cliRuntimeHtml.includes("CharDesk — Unicode Canvas for Humans and AI")) {
    throw new Error("Packed CLI did not include the full CharDesk application runtime");
  }
  if (!fs.existsSync(path.join(path.dirname(cliRuntime), "icon.svg"))) {
    throw new Error("Packed CLI did not include the CharDesk application icon");
  }
  execFileSync(cli, ["init", "demo", "--title", "Packed CLI"], {
    cwd: temporaryDirectory,
    stdio: "inherit",
  });
  execFileSync(cli, ["inspect", "demo", "--json"], {
    cwd: temporaryDirectory,
    stdio: "inherit",
  });
  const opened = JSON.parse(execFileSync(cli, ["open", "demo", "--no-browser", "--json"], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  }));
  try {
    const healthResponse = await fetch(new URL("health", opened.url));
    if (!healthResponse.ok) {
      throw new Error(`Packed CLI local Canvas health returned ${healthResponse.status}`);
    }
    const health = await healthResponse.json();
    if (health.status !== "ready") throw new Error("Packed CLI local Canvas was unhealthy");
  } finally {
    execFileSync(cli, ["close", "demo"], { cwd: temporaryDirectory, stdio: "inherit" });
  }
  execFileSync(cli, ["render", "demo", "-o", "demo.png"], {
    cwd: temporaryDirectory,
    stdio: "inherit",
  });
  if (!fs.readFileSync(path.join(temporaryDirectory, "demo.png")).subarray(1, 4).equals(Buffer.from("PNG"))) {
    throw new Error("Packed CLI did not render a PNG artifact");
  }
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Packed package smoke test passed.");
