import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../../packages/font-ark/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const asset = manifest.assets.find((entry: { path: string }) => entry.path.endsWith(".woff2"));
const bytes = readFileSync(new URL(asset.path, root));
if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
  throw new Error("Ark Mono production asset checksum mismatch");
}

export const arkMonoBase64 = bytes.toString("base64");
export const arkMonoStylesheetRequest = /\/font-ark\/fonts\.css(?:\?direct)?$/;
export const arkMonoFontRequest = /\/ark-pixel-12px-monospaced-latin[^/]*\.woff2$/;
