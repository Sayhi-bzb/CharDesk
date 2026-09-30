import { parseDocument } from "yaml";

export const BLACKBOARD_MANIFEST_SIGNATURE = "blackboard/v1";
export const BLACKBOARD_PACKAGE_SIGNATURE = "blackboard/v2";

export type BlackboardPanelSize = "auto" | `${number}x${number}`;

export type BlackboardPanelDefinition = {
  source: string;
  summary?: string;
  title?: string;
  size?: BlackboardPanelSize;
};

type BlackboardManifestBase = {
  chardesk:
    | typeof BLACKBOARD_MANIFEST_SIGNATURE
    | typeof BLACKBOARD_PACKAGE_SIGNATURE;
  title?: string;
  panels: Record<string, BlackboardPanelDefinition>;
};

export type BlackboardSpatialManifest = BlackboardManifestBase & {
  mode: "blackboard";
  layout: {
    areas: Array<Array<string | null>>;
    gap: {
      column: number;
      row: number;
    };
  };
};

export type BlackboardSlideManifest = BlackboardManifestBase & {
  chardesk: typeof BLACKBOARD_PACKAGE_SIGNATURE;
  mode: "slide";
  layout: {
    pages: string[];
  };
};

export type BlackboardManifest = BlackboardSpatialManifest | BlackboardSlideManifest;

export type BlackboardManifestWarning = {
  code: "unused-panel";
  message: string;
  panel: string;
};

export class BlackboardManifestError extends Error {
  readonly code: "invalid-yaml" | "invalid-manifest";

  constructor(code: "invalid-yaml" | "invalid-manifest", message: string) {
    super(message);
    this.name = "BlackboardManifestError";
    this.code = code;
  }
}

const fail = (message: string): never => {
  throw new BlackboardManifestError("invalid-manifest", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectRecord = (value: unknown, path: string) =>
  isRecord(value) ? value : fail(`${path} must be a mapping.`);

const expectKnownKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
) => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) fail(`${path}.${unknown} is not supported by this Blackboard package version.`);
};

const optionalText = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    fail(`${path} must be a non-empty single-line string.`);
  }
  const text = value as string;
  if (text.trim().length === 0 || /[\r\n]/u.test(text)) {
    fail(`${path} must be a non-empty single-line string.`);
  }
  return text;
};

const gapValue = (value: unknown, fallback: number, path: string) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 0) {
    fail(`${path} must be a non-negative integer.`);
  }
  return value as number;
};

const panelSize = (value: unknown, path: string): BlackboardPanelSize | undefined => {
  if (value === undefined) return undefined;
  if (value === "auto") return value;
  if (typeof value !== "string" || !/^\d+x\d+$/iu.test(value)) {
    fail(`${path} must be auto or columnsxrows.`);
  }
  const text = value as string;
  const [rawColumns, rawRows] = text.split("x");
  const columns = Number(rawColumns);
  const rows = Number(rawRows);
  if (!Number.isSafeInteger(columns) || columns <= 0 ||
      !Number.isSafeInteger(rows) || rows <= 0) {
    fail(`${path} must be auto or positive columnsxrows.`);
  }
  return text as BlackboardPanelSize;
};

const parsePanels = (
  value: unknown,
  version: typeof BLACKBOARD_MANIFEST_SIGNATURE | typeof BLACKBOARD_PACKAGE_SIGNATURE,
) => {
  const input = expectRecord(value, "panels");
  if (Object.keys(input).length === 0) fail("panels must register at least one panel.");
  const panels: Record<string, BlackboardPanelDefinition> = {};
  for (const [id, raw] of Object.entries(input)) {
    if (id.trim().length === 0) fail("Panel IDs must not be empty.");
    const panel = expectRecord(raw, `panels.${id}`);
    expectKnownKeys(
      panel,
      version === BLACKBOARD_PACKAGE_SIGNATURE
        ? ["source", "summary", "title", "size"]
        : ["source", "summary"],
      `panels.${id}`,
    );
    const rawSource = panel.source;
    if (typeof rawSource !== "string" || rawSource.trim().length === 0) {
      fail(`panels.${id}.source must be a non-empty string.`);
    }
    const source = rawSource as string;
    if (!source.endsWith(".panel")) {
      fail(`panels.${id}.source must use the .panel suffix.`);
    }
    const summary = optionalText(panel.summary, `panels.${id}.summary`);
    const title = optionalText(panel.title, `panels.${id}.title`);
    const size = panelSize(panel.size, `panels.${id}.size`);
    panels[id] = {
      source,
      ...(summary === undefined ? {} : { summary }),
      ...(title === undefined ? {} : { title }),
      ...(size === undefined ? {} : { size }),
    };
  }
  return panels;
};

const parsePages = (
  value: unknown,
  panels: Record<string, BlackboardPanelDefinition>,
) => {
  if (!Array.isArray(value) || value.length === 0) {
    fail("layout.pages must be a non-empty sequence.");
  }
  const pages = (value as unknown[]).map((entry, index) => {
    if (typeof entry !== "string" || !(entry in panels)) {
      fail(`layout.pages[${index}] must reference a registered panel.`);
    }
    return entry as string;
  });
  const duplicate = pages.find((id, index) => pages.indexOf(id) !== index);
  if (duplicate) fail(`layout.pages contains duplicate panel ${JSON.stringify(duplicate)}.`);
  return pages;
};

const parseAreas = (
  value: unknown,
  panels: Record<string, BlackboardPanelDefinition>,
): Array<Array<string | null>> => {
  if (!Array.isArray(value) || value.length === 0) {
    fail("layout.areas must be a non-empty matrix.");
  }
  const input = value as unknown[];
  const width = Array.isArray(input[0]) ? input[0].length : 0;
  if (width === 0) fail("layout.areas rows must not be empty.");
  const areas = input.map((rawRow, row) => {
    if (!Array.isArray(rawRow) || rawRow.length !== width) {
      fail(`layout.areas[${row}] must contain exactly ${width} entries.`);
    }
    const entries = rawRow as unknown[];
    return entries.map((entry, column) => {
      if (entry !== null && typeof entry !== "string") {
        fail(`layout.areas[${row}][${column}] must be a panel ID or null.`);
      }
      if (typeof entry === "string" && !(entry in panels)) {
        fail(`layout.areas references unknown panel ${JSON.stringify(entry)}.`);
      }
      return entry as string | null;
    });
  });

  for (const id of Object.keys(panels)) {
    const positions: Array<{ row: number; column: number }> = [];
    areas.forEach((row, rowIndex) => row.forEach((entry, columnIndex) => {
      if (entry === id) positions.push({ row: rowIndex, column: columnIndex });
    }));
    if (positions.length === 0) continue;
    const rows = positions.map((position) => position.row);
    const columns = positions.map((position) => position.column);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minColumn = Math.min(...columns);
    const maxColumn = Math.max(...columns);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        if (areas[row]![column] !== id) {
          fail(`layout.areas panel ${JSON.stringify(id)} must form one filled rectangle.`);
        }
      }
    }
  }
  return areas;
};

export const parseBlackboardManifest = (
  source: string,
): { manifest: BlackboardManifest; warnings: BlackboardManifestWarning[] } => {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new BlackboardManifestError("invalid-yaml", document.errors[0]!.message);
  }
  const root = expectRecord(document.toJS(), "blackboard.yaml");
  if (root.chardesk !== BLACKBOARD_MANIFEST_SIGNATURE &&
      root.chardesk !== BLACKBOARD_PACKAGE_SIGNATURE) {
    fail(`chardesk must be ${BLACKBOARD_MANIFEST_SIGNATURE} or ${BLACKBOARD_PACKAGE_SIGNATURE}.`);
  }
  const version = root.chardesk as
    | typeof BLACKBOARD_MANIFEST_SIGNATURE
    | typeof BLACKBOARD_PACKAGE_SIGNATURE;
  expectKnownKeys(
    root,
    version === BLACKBOARD_PACKAGE_SIGNATURE
      ? ["chardesk", "mode", "title", "panels", "layout"]
      : ["chardesk", "title", "panels", "layout"],
    "blackboard.yaml",
  );
  const mode = (version === BLACKBOARD_MANIFEST_SIGNATURE
    ? "blackboard"
    : root.mode) as unknown;
  if (mode !== "blackboard" && mode !== "slide") {
    fail("blackboard.yaml.mode must be blackboard or slide.");
  }
  const packageMode = mode as "blackboard" | "slide";
  const title = optionalText(root.title, "title");
  const panels = parsePanels(root.panels, version);
  const layout = expectRecord(root.layout, "layout");
  if (packageMode === "slide") {
    expectKnownKeys(layout, ["pages"], "layout");
    const pages = parsePages(layout.pages, panels);
    const titles = pages.map((id) => panels[id]!.title ?? id);
    const duplicateTitle = titles.find(
      (title, index) => titles.indexOf(title) !== index,
    );
    if (duplicateTitle) {
      fail(`Slide page titles must be unique; found ${JSON.stringify(duplicateTitle)}.`);
    }
    const used = new Set(pages);
    const warnings = Object.keys(panels)
      .filter((id) => !used.has(id))
      .map((panel) => ({
        code: "unused-panel" as const,
        message: `Panel ${JSON.stringify(panel)} is registered but not used by layout.pages.`,
        panel,
      }));
    return {
      manifest: {
        chardesk: BLACKBOARD_PACKAGE_SIGNATURE,
        mode: packageMode,
        ...(title === undefined ? {} : { title }),
        panels,
        layout: { pages },
      },
      warnings,
    };
  }
  const sizedPanel = Object.entries(panels).find(([, panel]) => panel.size !== undefined);
  if (sizedPanel) fail(`panels.${sizedPanel[0]}.size is only supported in slide mode.`);
  expectKnownKeys(layout, ["areas", "gap"], "layout");
  const areas = parseAreas(layout.areas, panels);
  const rawGap = layout.gap === undefined ? {} : expectRecord(layout.gap, "layout.gap");
  expectKnownKeys(rawGap, ["column", "row"], "layout.gap");
  const used = new Set(areas.flatMap((row) => row.filter((id): id is string => id !== null)));
  const warnings = Object.keys(panels)
    .filter((id) => !used.has(id))
    .map((panel) => ({
      code: "unused-panel" as const,
      message: `Panel ${JSON.stringify(panel)} is registered but not used by layout.areas.`,
      panel,
    }));
  return {
    manifest: {
      chardesk: version,
      mode: packageMode,
      ...(title === undefined ? {} : { title }),
      panels,
      layout: {
        areas,
        gap: {
          column: gapValue(rawGap.column, 4, "layout.gap.column"),
          row: gapValue(rawGap.row, 1, "layout.gap.row"),
        },
      },
    },
    warnings,
  };
};
