import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FONTTOOLS_VERSION = "4.64.0";

export const runPyftsubset = async (args, executable = process.env.PYFTSUBSET) => {
  const command = executable || "uvx";
  const commandArgs = executable
    ? args
    : ["--from", `fonttools[woff]==${FONTTOOLS_VERSION}`, "pyftsubset", ...args];
  await execFileAsync(command, commandArgs);
};
