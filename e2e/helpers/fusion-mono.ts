import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../../packages/font-fusion/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const asset = manifest.assets.find((entry: { path: string }) => entry.path.endsWith(".woff2"));
const bytes = readFileSync(new URL(asset.path, root));
if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
  throw new Error("Fusion Mono production asset checksum mismatch");
}

export const fusionMonoBase64 = bytes.toString("base64");
export const fusionMonoStylesheetRequest = /\/font-fusion\/fonts\.css(?:\?direct)?$/;
export const fusionMonoFontRequest = /\/fusion-pixel-12px-monospaced-latin[^/]*\.woff2$/;
