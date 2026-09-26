import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "../..");
const sourceDirectory = join(root, "demo/readme-showcase");
const outputDirectory = join(root, "apps/site/public/showcase");
const cli = join(root, "packages/cli/dist/cli.js");
const verify = process.argv.includes("--verify");
const examples = [
  "01-shared-medium",
  "02-gpu-blackboard.zh-CN",
  "03-el-nino-observatory",
  "04-story-slides.ja",
  "05-interface-console",
  "06-agent-blackboard",
  "07-context-control-room",
  "08-idea-signal-player",
  "09-pocket-blackboard",
];

await access(cli, constants.R_OK);

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "chardesk-readme-showcase-"),
);

try {
  for (const example of examples) {
    const source = join(sourceDirectory, `${example}.md`);
    const output = join(temporaryDirectory, `${example}.png`);
    const result = spawnSync(process.execPath, [
      cli,
      "render",
      source,
      "-o",
      output,
      "--scale",
      "2",
      "--padding",
      "24",
      "--strict",
    ], { cwd: root, encoding: "utf8" });

    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout);
      process.exit(result.status ?? 1);
    }

    if (verify) {
      const committed = join(outputDirectory, basename(output));
      const [expected, actual] = await Promise.all([
        readFile(committed),
        readFile(output),
      ]);
      if (!expected.equals(actual)) {
        throw new Error(`Showcase image is stale: ${basename(output)}`);
      }
    }
  }

  if (!verify) {
    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(examples.map((example) => copyFile(
      join(temporaryDirectory, `${example}.png`),
      join(outputDirectory, `${example}.png`),
    )));
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write(
  verify
    ? `Verified ${examples.length} README showcase images.\n`
    : `Generated ${examples.length} README showcase images.\n`,
);
