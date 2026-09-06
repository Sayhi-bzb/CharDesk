import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts } from "@napi-rs/canvas";
import type { CharDeskRenderModel } from "@chardesk/rendering";
import type {
  CharDeskCanvasFontFamilies,
  CharDeskCanvasFontResolver,
} from "@chardesk/rendering/canvas";

type FontFace = {
  family: string;
  path: string;
  weight: number;
  ranges: Array<{ from: number; to: number }>;
};

const registeredPaths = new Map<string, string>();
let facesPromise: Promise<FontFace[]> | undefined;

const property = (body: string, name: string) =>
  new RegExp(`${name}\\s*:\\s*([^;}]+)`, "iu").exec(body)?.[1]?.trim();

const unquote = (value: string) =>
  value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");

const parseRange = (value: string) => {
  const match = /^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/iu.exec(value.trim());
  if (!match) return null;
  const from = Number.parseInt(match[1]!, 16);
  const to = Number.parseInt(match[2] ?? match[1]!, 16);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to)
    ? { from, to }
    : null;
};

export const parseCharDeskFontFaces = (
  css: string,
  cssPath: string
): FontFace[] => Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/giu), (match) => {
  const body = match[1]!;
  const familyValue = property(body, "font-family");
  const source = property(body, "src")?.match(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/iu);
  if (!familyValue || !source) return null;
  const relativePath = source[1] ?? source[2] ?? source[3];
  if (!relativePath) return null;
  const ranges = (property(body, "unicode-range") ?? "")
    .split(",")
    .map(parseRange)
    .filter((range): range is NonNullable<typeof range> => !!range);
  return {
    family: unquote(familyValue),
    path: resolve(dirname(cssPath), relativePath),
    weight: Number(property(body, "font-weight") ?? 400),
    ranges,
  };
}).filter((face): face is FontFace => !!face);

const loadFaces = () => {
  facesPromise ??= (async () => {
    const cssPaths = [
      fileURLToPath(import.meta.resolve("@chardesk/fonts/fonts.css")),
      fileURLToPath(import.meta.resolve("@chardesk/font-maple/fonts.css")),
    ];
    return (await Promise.all(cssPaths.map(async (cssPath) =>
      parseCharDeskFontFaces(await readFile(cssPath, "utf8"), cssPath)
    ))).flat();
  })();
  return facesPromise;
};

const codePoints = (text: string) =>
  Array.from(text, (character) => character.codePointAt(0)!).filter(Number.isSafeInteger);

const faceCovers = (face: FontFace, points: readonly number[]) =>
  face.ranges.length === 0 || points.some((point) =>
    face.ranges.some(({ from, to }) => point >= from && point <= to)
  );

const aliasFor = (path: string) =>
  `CharDesk Node ${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;

const stack = (aliases: readonly string[]) =>
  aliases.map((alias) => `'${alias}'`).join(", ");

type CharDeskNodeFontSet = {
  fontFamilies: CharDeskCanvasFontFamilies;
  fontResolver: CharDeskCanvasFontResolver;
};

export const loadCharDeskNodeFonts = async (
  model: CharDeskRenderModel
): Promise<CharDeskNodeFontSet> => {
  const faces = await loadFaces();
  const samples = model.cells
    .filter((cell) => cell.text.trim() !== "")
    .map((cell) => ({
      points: codePoints(cell.text),
      bold: !!cell.attrs?.bold,
      text: cell.text,
    }));
  const selected = faces.filter((face) =>
    (face.weight < 700 || samples.some(({ bold }) => bold)) &&
    samples.some(({ points }) => faceCovers(face, points))
  );

  for (const sample of samples) {
    if (!selected.some((face) => faceCovers(face, sample.points))) {
      throw new Error(`No vendored CharDesk font covers ${JSON.stringify(sample.text)}.`);
    }
  }
  for (const face of selected) {
    if (registeredPaths.has(face.path)) continue;
    const alias = aliasFor(face.path);
    if (!GlobalFonts.registerFromPath(face.path, alias)) {
      throw new Error(`Could not register CharDesk font: ${face.path}`);
    }
    registeredPaths.set(face.path, alias);
  }
  const aliases = (predicate: (face: FontFace) => boolean) => selected
    .filter(predicate)
    .map((face) => registeredPaths.get(face.path)!)
    .filter(Boolean);
  const textRegular = aliases((face) =>
    face.family !== "Noto Emoji" && face.weight < 700
  );
  const textBold = aliases((face) =>
    face.family !== "Noto Emoji" && face.weight >= 700
  );
  const emoji = aliases((face) => face.family === "Noto Emoji");
  if (textRegular.length === 0) {
    throw new Error("No regular CharDesk text font was selected.");
  }
  const fontFamilies: CharDeskCanvasFontFamilies = {
    text: {
      regular: stack(textRegular),
      ...(textBold.length > 0
        ? { bold: stack([...textBold, ...textRegular]) }
        : {}),
    },
    emoji: { regular: stack([...emoji, ...textRegular]) },
  };
  const fontResolver: CharDeskCanvasFontResolver = ({
    grapheme,
    route,
    bold,
  }) => {
    const points = codePoints(grapheme);
    const preferredWeight = bold ? 700 : 400;
    const candidates = selected.filter((face) =>
      (route === "emoji") === (face.family === "Noto Emoji")
      && (bold ? face.weight >= preferredWeight : face.weight < 700)
      && faceCovers(face, points)
    );
    const fallbackCandidates = candidates.length > 0
      ? candidates
      : selected.filter((face) => faceCovers(face, points));
    const covered = points.every((point) => fallbackCandidates.some((face) =>
      face.ranges.length === 0
      || face.ranges.some(({ from, to }) => point >= from && point <= to)
    ));
    if (!covered) return undefined;
    return stack(fallbackCandidates.map((face) => registeredPaths.get(face.path)!)
      .filter(Boolean));
  };
  return { fontFamilies, fontResolver };
};
