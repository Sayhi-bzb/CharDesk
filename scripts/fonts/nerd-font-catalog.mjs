export const NERD_FONT_VERSION = "3.5.1";

export const NERD_FONT_GROUPS = [
  { id: "seti-ui-custom", label: "Seti-UI-Custom", prefixes: ["custom", "indent", "indentation", "seti"] },
  { id: "devicons", label: "Devicons", prefixes: ["dev"] },
  { id: "font-awesome", label: "Font-Awesome", prefixes: ["fa"] },
  { id: "font-awesome-ext", label: "Font-Awesome-Ext", prefixes: ["fae"] },
  { id: "material-design", label: "Material-Design", prefixes: ["md"] },
  { id: "weather-icons", label: "Weather-Icons", prefixes: ["weather"] },
  { id: "octicons", label: "Octicons", prefixes: ["oct"] },
  { id: "powerline-symbols", label: "Powerline-Symbols", prefixes: ["pl"] },
  { id: "powerline-extra", label: "Powerline-Extra", prefixes: ["ple"] },
  { id: "iec-power", label: "IEC-Power", prefixes: ["iec"] },
  { id: "font-logos", label: "Font-Logos", prefixes: ["linux"] },
  { id: "pomicons", label: "Pomicons", prefixes: ["pom"] },
  { id: "codicons", label: "Codicons", prefixes: ["cod"] },
  { id: "progress-indicators", label: "Progress-Indicators", prefixes: ["extra"] },
];

const catalogEntries = (catalog) => {
  if (catalog.METADATA?.version !== NERD_FONT_VERSION) {
    throw new Error(
      `Expected Nerd Fonts ${NERD_FONT_VERSION}, received ` +
      `${catalog.METADATA?.version ?? "unknown"}`
    );
  }
  return Object.entries(catalog)
    .filter(([name]) => name !== "METADATA")
    .map(([name, glyph]) => {
      const characters = typeof glyph.char === "string" ? [...glyph.char] : [];
      const codePoint = characters[0]?.codePointAt(0);
      if (
        characters.length !== 1 ||
        codePoint === undefined ||
        Number.parseInt(glyph.code, 16) !== codePoint
      ) {
        throw new Error(`Invalid Nerd Font glyph entry: ${name}`);
      }
      return { name, char: glyph.char, codePoint };
    });
};

export const groupNerdFontCatalog = (catalog) => {
  const byPrefix = new Map();
  for (const group of NERD_FONT_GROUPS) {
    for (const prefix of group.prefixes) byPrefix.set(prefix, group.id);
  }
  const grouped = new Map(
    NERD_FONT_GROUPS.map((group) => [group.id, { ...group, entries: [] }])
  );
  for (const { name, char } of catalogEntries(catalog)) {
    const groupId = byPrefix.get(name.split("-", 1)[0]);
    if (!groupId) throw new Error(`Unknown Nerd Font glyph prefix: ${name}`);
    grouped.get(groupId).entries.push({ name, char });
  }
  return [...grouped.values()].filter(({ entries }) => entries.length > 0);
};

export const nerdFontCodePoints = (catalog) => new Set(
  catalogEntries(catalog).map(({ codePoint }) => codePoint)
);

export const compactCodePointRanges = (codePoints) => {
  const sorted = [...codePoints].sort((left, right) => left - right);
  const ranges = [];
  let start = sorted[0];
  let end = start;
  for (const codePoint of sorted.slice(1)) {
    if (codePoint === end + 1) {
      end = codePoint;
      continue;
    }
    ranges.push(start === end ? start : [start, end]);
    start = codePoint;
    end = codePoint;
  }
  if (start !== undefined) ranges.push(start === end ? start : [start, end]);
  return ranges;
};

export const formatNerdFontRangesModule = (catalog) => {
  const ranges = compactCodePointRanges(nerdFontCodePoints(catalog));
  const rows = [];
  let row = [];
  for (const range of ranges) {
    const value = typeof range === "number"
      ? `0x${range.toString(16)}`
      : `[0x${range[0].toString(16)}, 0x${range[1].toString(16)}]`;
    row.push(value);
    if (row.join(", ").length >= 68) {
      rows.push(`  ${row.join(", ")},`);
      row = [];
    }
  }
  if (row.length > 0) rows.push(`  ${row.join(", ")},`);
  return (
    `// Generated from Nerd Fonts ${NERD_FONT_VERSION} glyphnames.json.\n` +
    `export const NERD_FONT_RANGES: readonly ` +
    `(number | readonly [number, number])[] = [\n${rows.join("\n")}\n];\n`
  );
};
