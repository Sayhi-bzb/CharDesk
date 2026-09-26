import {
  CHARDESK_MARKDOWN_FEATURES,
  createCharDeskMarkdownRenderOptions,
  getCharDeskMarkdownColorDefault,
  type MarkdownRenderOptions,
  type CharDeskMarkdownColorSlotId,
  type CharDeskMarkdownFeatureId,
  type CharDeskMarkdownFeatureStates,
} from "@chardesk/chargraph/markdown";
import type { I18nKey } from "@/shared/i18n";
import type {
  TextRenderColorDefault,
  TextRenderFeatureConfig,
  TextRenderFeatureDefinition,
  TextRenderFeatureId,
  TextRenderFeatureSettings,
  TextRenderTheme,
  TextRenderThemeMode,
} from "./types";
import {
  createTextRenderThemeMap,
  TEXT_RENDER_THEME_MODES,
} from "./theme";

type InternalColorSlot = TextRenderFeatureDefinition["colorSlots"][number] & {
  readonly legacyIds: readonly string[];
  readonly configAliases: readonly string[];
};

type InternalFeatureDefinition = Omit<TextRenderFeatureDefinition, "colorSlots" | "colorRows"> & {
  readonly colorSlots: readonly InternalColorSlot[];
  readonly colorRows?: TextRenderFeatureDefinition["colorRows"];
  readonly legacyRuleId: string;
  readonly markdownFeatureId: CharDeskMarkdownFeatureId;
};

const MARKDOWN_FEATURES_BY_ID = new Map(
  CHARDESK_MARKDOWN_FEATURES.map((feature) => [feature.id, feature])
);

const slot = <Feature extends CharDeskMarkdownFeatureId>(
  _feature: Feature,
  id: CharDeskMarkdownColorSlotId<Feature>,
  defaultValue: TextRenderColorDefault,
  legacyIds: readonly string[],
  label?: I18nKey,
  configAliases: readonly string[] = [],
): InternalColorSlot => ({
  id,
  default: defaultValue,
  legacyIds,
  configAliases,
  ...(label ? { label } : {}),
});

const themedSlot = <Feature extends CharDeskMarkdownFeatureId>(
  feature: Feature,
  id: CharDeskMarkdownColorSlotId<Feature>,
  legacyIds: readonly string[],
  label?: I18nKey,
  configAliases: readonly string[] = [],
) => slot(
  feature,
  id,
  getCharDeskMarkdownColorDefault(feature, id),
  legacyIds,
  label,
  configAliases
);

const hostFeature = (
  ruleId: CharDeskMarkdownFeatureId,
  settingsGroup: "inline" | "blocks" | "math",
  label: I18nKey,
  options: {
    colorSlots?: readonly InternalColorSlot[];
    colorRows?: TextRenderFeatureDefinition["colorRows"];
  } = {}
): InternalFeatureDefinition => {
  const feature = MARKDOWN_FEATURES_BY_ID.get(ruleId);
  return {
    id: `markdown.${ruleId}`,
    rendererId: "markdown",
    settingsGroup,
    label,
    control: feature?.kind === "style" ? "style" : "toggle",
    defaultEnabled: feature?.defaultEnabled ?? true,
    colorSlots: options.colorSlots ?? [],
    ...(options.colorRows ? { colorRows: options.colorRows } : {}),
    legacyRuleId: ruleId,
    markdownFeatureId: ruleId,
  };
};

type ForegroundFeatureId =
  | "strong"
  | "emphasis"
  | "strikethrough"
  | "link"
  | "thematic-break";

const foreground = (ruleId: ForegroundFeatureId) => themedSlot(
  ruleId,
  "foreground",
  [`${ruleId}.foreground`, ruleId]
);

const dataTreeFeature = (
  ruleId: "json-tree" | "yaml-tree",
  label: I18nKey
) => {
  const keywordLegacyIds = [`${ruleId}.keyword`];
  const keywordConfigAliases = ["keyword"];
  const structureSlotIds = ["connector", "key", "index"];
  if (ruleId === "yaml-tree") structureSlotIds.push("reference");
  return hostFeature(ruleId, "blocks", label, {
    colorSlots: [
      themedSlot(ruleId, "connector", [], "settings.markdown.dataTreeConnector"),
      themedSlot(ruleId, "key", [], "settings.markdown.dataTreeKey"),
      themedSlot(ruleId, "index", [], "settings.markdown.dataTreeIndex"),
      themedSlot(ruleId, "string", [], "settings.markdown.dataTreeString"),
      themedSlot(ruleId, "number", [], "settings.markdown.dataTreeNumber"),
      themedSlot(
        ruleId,
        "boolean",
        keywordLegacyIds,
        "settings.markdown.dataTreeBoolean",
        keywordConfigAliases
      ),
      themedSlot(
        ruleId,
        "null",
        keywordLegacyIds,
        "settings.markdown.dataTreeNull",
        keywordConfigAliases
      ),
      themedSlot(
        ruleId,
        "empty",
        keywordLegacyIds,
        "settings.markdown.dataTreeEmpty",
        keywordConfigAliases
      ),
      ...(ruleId === "yaml-tree"
        ? [themedSlot(
            ruleId,
            "reference",
            keywordLegacyIds,
            "settings.markdown.dataTreeReference",
            keywordConfigAliases
          )]
        : []),
    ],
    colorRows: [
      {
        id: "structure",
        label: "settings.markdown.dataTreeStructure",
        slotIds: structureSlotIds,
      },
      {
        id: "values",
        label: "settings.markdown.dataTreeValues",
        slotIds: ["string", "number", "boolean", "null", "empty"],
      },
    ],
  });
};

const INTERNAL_FEATURES = [
  hostFeature("strong", "inline", "settings.markdown.strong", {
    colorSlots: [foreground("strong")],
  }),
  hostFeature("emphasis", "inline", "settings.markdown.emphasis", {
    colorSlots: [foreground("emphasis")],
  }),
  hostFeature("strikethrough", "inline", "settings.markdown.strikethrough", {
    colorSlots: [foreground("strikethrough")],
  }),
  hostFeature("link", "inline", "settings.markdown.link", {
    colorSlots: [foreground("link")],
  }),
  hostFeature("inline-code", "inline", "settings.markdown.inlineCode", {
    colorSlots: [
      themedSlot(
        "inline-code",
        "foreground",
        ["inline-code.foreground", "inline-code"],
        "settings.markdown.inlineCodeForeground"
      ),
      themedSlot(
        "inline-code",
        "background",
        ["inline-code.background"],
        "settings.markdown.inlineCodeBackground"
      ),
    ],
  }),
  hostFeature(
    "inline-math",
    "math",
    "settings.markdown.inlineMath"
  ),
  hostFeature(
    "block-math",
    "math",
    "settings.markdown.blockMath"
  ),
  hostFeature(
    "math-style",
    "math",
    "settings.markdown.mathStyle",
    {
      colorSlots: [
        themedSlot(
          "math-style",
          "content",
          ["inline-math.foreground", "inline-math", "block-math.foreground", "block-math"],
          "settings.markdown.mathContent"
        ),
        themedSlot(
          "math-style",
          "operator",
          [],
          "settings.markdown.mathOperator"
        ),
        themedSlot(
          "math-style",
          "structure",
          [],
          "settings.markdown.mathStructure"
        ),
      ],
    }
  ),
  hostFeature("heading", "blocks", "settings.markdown.heading", {
    colorSlots: [themedSlot("heading", "marker", ["heading.marker", "heading"])],
  }),
  hostFeature("blockquote", "blocks", "settings.markdown.blockquote", {
    colorSlots: [themedSlot(
      "blockquote",
      "marker",
      ["blockquote.marker", "blockquote"]
    )],
  }),
  hostFeature("list", "blocks", "settings.markdown.list", {
    colorSlots: [themedSlot(
      "list",
      "marker",
      ["list.marker", "list"]
    )],
  }),
  hostFeature("task-list", "blocks", "settings.markdown.taskList", {
    colorSlots: [
      themedSlot(
        "task-list",
        "unchecked",
        ["task-list.unchecked"],
        "settings.markdown.taskListUnchecked"
      ),
      themedSlot(
        "task-list",
        "checked",
        ["task-list.checked"],
        "settings.markdown.taskListChecked"
      ),
    ],
  }),
  hostFeature("thematic-break", "blocks", "settings.markdown.thematicBreak", {
    colorSlots: [foreground("thematic-break")],
  }),
  hostFeature("code-block", "blocks", "settings.markdown.codeBlock"),
  hostFeature("chart", "blocks", "settings.markdown.chart"),
  hostFeature(
    "github-alert",
    "blocks",
    "settings.markdown.githubAlert",
    {
      colorSlots: [
        themedSlot("github-alert", "note", [], "settings.markdown.alertNote"),
        themedSlot("github-alert", "tip", [], "settings.markdown.alertTip"),
        themedSlot("github-alert", "important", [], "settings.markdown.alertImportant"),
        themedSlot("github-alert", "warning", [], "settings.markdown.alertWarning"),
        themedSlot("github-alert", "caution", [], "settings.markdown.alertCaution"),
      ],
    }
  ),
  hostFeature(
    "diff",
    "blocks",
    "settings.markdown.diff",
    {
      colorSlots: [
        themedSlot("diff", "added", [], "settings.markdown.diffAdded"),
        themedSlot("diff", "deleted", [], "settings.markdown.diffDeleted"),
        themedSlot("diff", "hunk", [], "settings.markdown.diffHunk"),
        themedSlot("diff", "metadata", [], "settings.markdown.diffMetadata"),
      ],
    }
  ),
  dataTreeFeature(
    "json-tree",
    "settings.markdown.jsonTree"
  ),
  dataTreeFeature(
    "yaml-tree",
    "settings.markdown.yamlTree"
  ),
  hostFeature(
    "mermaid",
    "blocks",
    "settings.markdown.mermaid",
    {
      colorSlots: [
        themedSlot("mermaid", "title", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidTitle", ["foreground"]),
        themedSlot("mermaid", "node.text", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidNodeText", ["foreground"]),
        themedSlot("mermaid", "node.border", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidNodeBorder", ["foreground"]),
        themedSlot("mermaid", "node.background", [], "settings.markdown.mermaidNodeBackground"),
        themedSlot("mermaid", "flow.node.marker", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidFlowMarker", ["foreground"]),
        themedSlot("mermaid", "state.start", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidStateStart", ["foreground"]),
        themedSlot("mermaid", "state.end", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidStateEnd", ["foreground"]),
        themedSlot("mermaid", "edge.label", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidEdgeLabel", ["foreground"]),
        themedSlot("mermaid", "container.border", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidContainerBorder", ["foreground"]),
        themedSlot("mermaid", "container.title", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidContainerTitle", ["foreground"]),
        themedSlot("mermaid", "sequence.activation", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidActivation", ["foreground"]),
        themedSlot("mermaid", "chart.axis", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidChartAxis", ["foreground"]),
        themedSlot("mermaid", "chart.grid", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidChartGrid", ["foreground"]),
        themedSlot("mermaid", "chart.label", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidChartLabel", ["foreground"]),
        themedSlot("mermaid", "series.1", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidSeries1", ["foreground"]),
        themedSlot("mermaid", "series.2", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidSeries2", ["foreground"]),
        themedSlot("mermaid", "series.3", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidSeries3", ["foreground"]),
        themedSlot("mermaid", "series.4", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidSeries4", ["foreground"]),
        themedSlot("mermaid", "series.5", ["mermaid.foreground", "mermaid"], "settings.markdown.mermaidSeries5", ["foreground"]),
      ],
      colorRows: [
        { id: "node", label: "settings.markdown.mermaidNode", slotIds: ["node.text", "node.border", "node.background"] },
        { id: "flow", label: "settings.markdown.mermaidFlow", slotIds: ["flow.node.marker"] },
        { id: "state", label: "settings.markdown.mermaidState", slotIds: ["state.start", "state.end"] },
        { id: "label", label: "settings.markdown.mermaidLabel", slotIds: ["title", "edge.label"] },
        { id: "container", label: "settings.markdown.mermaidContainer", slotIds: ["container.border", "container.title"] },
        { id: "sequence", label: "settings.markdown.mermaidSequence", slotIds: ["sequence.activation"] },
        { id: "grid", label: "settings.markdown.mermaidGrid", slotIds: ["chart.axis", "chart.grid", "chart.label"] },
        { id: "series", label: "settings.markdown.mermaidSeries", slotIds: ["series.1", "series.2", "series.3", "series.4", "series.5"] },
      ],
    }
  ),
  hostFeature("table", "blocks", "settings.markdown.table", {
    colorSlots: [
      themedSlot(
        "table",
        "header.foreground",
        ["table.header.foreground"],
        "settings.markdown.tableHeaderForeground"
      ),
      themedSlot(
        "table",
        "header.background",
        ["table.header.background", "table"],
        "settings.markdown.tableHeaderBackground"
      ),
      themedSlot(
        "table",
        "separator",
        ["table.separator", "table"],
        "settings.markdown.tableSeparator"
      ),
    ],
  }),
] as const satisfies readonly InternalFeatureDefinition[];

const boundFeatureIds = new Set(
  INTERNAL_FEATURES.map((feature) => feature.markdownFeatureId)
);
for (const feature of CHARDESK_MARKDOWN_FEATURES) {
  if (!boundFeatureIds.has(feature.id)) {
    throw new Error(`Markdown feature has no Canvas binding: ${feature.id}`);
  }
}

const featureDefinition = (
  feature: InternalFeatureDefinition
): TextRenderFeatureDefinition => Object.freeze({
  id: feature.id,
  rendererId: feature.rendererId,
  settingsGroup: feature.settingsGroup,
  label: feature.label,
  control: feature.control,
  defaultEnabled: feature.defaultEnabled,
  colorSlots: Object.freeze(feature.colorSlots.map((colorSlot) => {
    const defaultValue = colorSlot.default.kind === "mixed"
      ? Object.freeze({
          ...colorSlot.default,
          tokens: Object.freeze([...colorSlot.default.tokens]),
        })
      : Object.freeze({ ...colorSlot.default });
    return Object.freeze({
      id: colorSlot.id,
      default: defaultValue,
      ...(colorSlot.label ? { label: colorSlot.label } : {}),
    });
  })),
  ...(feature.colorRows
    ? { colorRows: Object.freeze(feature.colorRows.map((row) => Object.freeze({
        ...row,
        slotIds: Object.freeze([...row.slotIds]),
      }))) }
    : {}),
});

export const TEXT_RENDER_FEATURES: readonly TextRenderFeatureDefinition[] =
  Object.freeze(INTERNAL_FEATURES.map(featureDefinition));

const PUBLIC_FEATURES_BY_ID = new Map(
  TEXT_RENDER_FEATURES.map((feature) => [feature.id, feature])
);

export const getTextRenderFeatureDefinition = (id: TextRenderFeatureId) =>
  PUBLIC_FEATURES_BY_ID.get(id);

export const createDefaultFeatureSettings = (): TextRenderFeatureSettings =>
  Object.fromEntries(TEXT_RENDER_FEATURES.map((feature) => [
    feature.id,
    { enabled: feature.defaultEnabled, colors: createTextRenderThemeMap(() => ({})) },
  ]));

const normalizeColor = (value: unknown) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;

const decodeColors = (
  value: unknown,
  definition: InternalFeatureDefinition
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(definition.colorSlots.flatMap((colorSlot) => {
    const color = normalizeColor(source[colorSlot.id])
      ?? colorSlot.configAliases.map((id) => normalizeColor(source[id])).find(Boolean)
      ?? null;
    return color ? [[colorSlot.id, color]] : [];
  }));
};

const colorsForMode = (
  value: unknown,
  mode: TextRenderThemeMode
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const hasThemeMaps = ["light", "dark"].some((key) => {
    const candidate = source[key];
    return !!candidate && typeof candidate === "object" && !Array.isArray(candidate);
  });
  return hasThemeMaps ? source[mode] : mode === "light" ? source : {};
};

const decodeThemeColors = (
  value: unknown,
  definition: InternalFeatureDefinition
) => createTextRenderThemeMap((mode) =>
  decodeColors(colorsForMode(value, mode), definition)
);

export const decodeFeatureSettings = (value: unknown): TextRenderFeatureSettings => {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const settings: TextRenderFeatureSettings = Object.fromEntries(
    INTERNAL_FEATURES.map((definition) => {
    const candidate = source[definition.id];
    const record = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Partial<TextRenderFeatureConfig>
      : {};
    return [definition.id, {
      enabled: typeof record.enabled === "boolean"
        ? record.enabled
        : definition.defaultEnabled,
      colors: decodeThemeColors(record.colors, definition),
    }];
    })
  );
  const mathStyle = settings["markdown.math-style"];
  if (mathStyle) {
    for (const mode of TEXT_RENDER_THEME_MODES) {
      if (mathStyle.colors[mode].content) continue;
      const previousMathColor = ["markdown.inline-math", "markdown.block-math"]
        .map((id) => source[id])
        .flatMap((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
          const colors = (candidate as { colors?: unknown }).colors;
          const modeColors = colorsForMode(colors, mode) as Record<string, unknown>;
          return [normalizeColor(modeColors.foreground)];
        })
        .find(Boolean);
      if (previousMathColor) mathStyle.colors[mode].content = previousMathColor;
    }
  }
  const mermaid = settings["markdown.mermaid"];
  const previousMermaid = source["markdown.mermaid"];
  if (mermaid && previousMermaid && typeof previousMermaid === "object" && !Array.isArray(previousMermaid)) {
    for (const mode of TEXT_RENDER_THEME_MODES) {
      if (mermaid.colors[mode]["node.border"]) continue;
      const previousColors = colorsForMode(
        (previousMermaid as { colors?: unknown }).colors,
        mode
      ) as Record<string, unknown>;
      const previousStructuralColor = normalizeColor(previousColors["flow.node.border"])
        ?? normalizeColor(previousColors["edge.line"])
        ?? normalizeColor(previousColors["edge.arrow"]);
      if (previousStructuralColor) {
        mermaid.colors[mode]["node.border"] = previousStructuralColor;
      }
    }
  }
  return settings;
};

export const migrateLegacyFeatureSettings = (
  rules: unknown,
  colors: unknown
): TextRenderFeatureSettings => {
  const sourceRules = rules && typeof rules === "object" && !Array.isArray(rules)
    ? rules as Record<string, unknown>
    : {};
  const sourceColors = colors && typeof colors === "object" && !Array.isArray(colors)
    ? colors as Record<string, unknown>
    : {};
  return Object.fromEntries(INTERNAL_FEATURES.map((definition) => {
    const migratedColors = Object.fromEntries(definition.colorSlots.flatMap((colorSlot) => {
      for (const legacyId of colorSlot.legacyIds) {
        const color = normalizeColor(sourceColors[legacyId]);
        if (color) return [[colorSlot.id, color]];
      }
      return [];
    }));
    const legacyEnabled = sourceRules[definition.legacyRuleId];
    return [definition.id, {
      enabled: typeof legacyEnabled === "boolean"
        ? legacyEnabled
        : definition.defaultEnabled,
      colors: createTextRenderThemeMap((mode) =>
        mode === "light" ? migratedColors : {}
      ),
    }];
  }));
};

export const createRegisteredMarkdownOptions = (
  settings: TextRenderFeatureSettings,
  theme: TextRenderTheme,
  forced: boolean,
  themeMode: TextRenderThemeMode = "light"
): MarkdownRenderOptions => {
  const features: CharDeskMarkdownFeatureStates = {};

  for (const definition of INTERNAL_FEATURES) {
    const config = settings[definition.id] ?? {
      enabled: definition.defaultEnabled,
      colors: createTextRenderThemeMap(() => ({})),
    };
    const colors: Record<string, string> = {};
    for (const colorSlot of definition.colorSlots) {
      const configured = normalizeColor(config.colors[themeMode][colorSlot.id]);
      if (!configured) continue;
      colors[colorSlot.id] = configured;
    }
    features[definition.markdownFeatureId] = {
      enabled: config.enabled,
      colors,
    };
  }

  return createCharDeskMarkdownRenderOptions({
    theme,
    features,
    forced,
  });
};
