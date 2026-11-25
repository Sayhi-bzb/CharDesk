import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize } from "node:v8";
import type { renderSourceToPng } from "./render.js";

type RasterRequest = Parameters<typeof renderSourceToPng>[0];
type RasterResult = Awaited<ReturnType<typeof renderSourceToPng>>;

type RasterEnvelope =
  | { ok: true; result: Omit<RasterResult, "bytes"> }
  | { ok: false; error: { code: string; message: string } };

export class CharDeskCliRasterProcessError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CharDeskCliRasterProcessError";
  }
}

const rasterWorkerUrl = () => {
  const sibling = new URL("./raster-worker.js", import.meta.url);
  return existsSync(fileURLToPath(sibling))
    ? sibling
    : new URL("../dist/raster-worker.js", import.meta.url);
};

const runRasterProcess = (
  request: RasterRequest,
  outputPath: string,
  options: { workerUrl?: URL }
): Promise<Omit<RasterResult, "bytes">> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [fileURLToPath(
    options.workerUrl ?? rasterWorkerUrl()
  )], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.once("error", (error) => reject(new CharDeskCliRasterProcessError(
    "raster-backend-crash",
    "Could not start the PNG raster backend.",
    { cause: error }
  )));
  child.once("close", (code, signal) => {
    if (signal) {
      reject(new CharDeskCliRasterProcessError(
        "raster-backend-crash",
        `PNG raster backend terminated by ${signal}.`
      ));
      return;
    }
    let envelope: RasterEnvelope | undefined;
    try {
      envelope = deserialize(Buffer.concat(stdout)) as RasterEnvelope;
    } catch { /* empty */ }
    if (envelope?.ok) {
      resolve(envelope.result);
      return;
    }
    if (envelope && !envelope.ok) {
      reject(new CharDeskCliRasterProcessError(
        envelope.error.code,
        envelope.error.message
      ));
      return;
    }
    const detail = Buffer.concat(stderr).toString("utf8").trim();
    reject(new CharDeskCliRasterProcessError(
      "raster-backend-crash",
      detail || `PNG raster backend exited with code ${code ?? "unknown"}.`
    ));
  });
  child.stdin.end(JSON.stringify({ request, outputPath }));
});

export const renderSourceInRasterProcess = async (
  request: RasterRequest,
  options: { workerUrl?: URL } = {}
): Promise<RasterResult> => {
  const directory = await mkdtemp(join(tmpdir(), "chardesk-raster-"));
  const outputPath = join(directory, "output.png");
  try {
    const result = await runRasterProcess(request, outputPath, options);
    return { ...result, bytes: new Uint8Array(await readFile(outputPath)) };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
};
