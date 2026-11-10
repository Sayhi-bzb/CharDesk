import type { CharDeskTextStyle } from "@chardesk/protocol";
import {
  MARKDOWN_ALERT_STYLE_ROLES,
  markdownAlertExtension,
} from "./markdown-alert.js";
import { createCharDeskCodeTheme } from "./markdown-code-theme.js";
import {
  MARKDOWN_DATA_TREE_STYLE_ROLES,
  markdownJsonTreeExtension,
  markdownYamlTreeExtension,
} from "./markdown-data-tree.js";
import {
  MARKDOWN_DIFF_STYLE_ROLES,
  markdownDiffExtension,
} from "./markdown-diff.js";
import {
  MARKDOWN_MATH_STYLE_ROLES,
  markdownMathExtension,
} from "./markdown-math.js";
import {
  MARKDOWN_MERMAID_STYLE_ROLES,
  markdownMermaidExtension,
} from "./markdown-mermaid.js";
import {
  MARKDOWN_CHART_STYLE_ROLES,
  markdownChartExtension,
} from "./markdown-chart.js";
import {
  defineCharDeskMarkdownFeature,
  defineCharDeskMarkdownModule,
} from "./markdown-module.js";
import {
  CHARDESK_MERMAID_COLOR_DEFAULTS,
  createCharDeskMermaidStyles,
  MERMAID_STYLE_ROLES,
} from "./mermaid-style.js";
import type {
  CharDeskRenderColorDefault,
  CharDeskRenderThemeToken,
} from "./render-theme.js";

const inherit: CharDeskRenderColorDefault = Object.freeze({ kind: "inherit" });
const token = (
  value: CharDeskRenderThemeToken
): CharDeskRenderColorDefault => Object.freeze({ kind: "token", token: value });
const mixed = (
  tokens: readonly CharDeskRenderThemeToken[],
  includesInherited = false
): CharDeskRenderColorDefault => Object.freeze({
  kind: "mixed",
  tokens: Object.freeze(tokens),
  ...(includesInherited ? { includesInherited: true } : {}),
});

const feature = <
  const Id extends string,
  const Kind extends "core" | "extension" | "style",
  const Slots extends Readonly<Record<string, CharDeskRenderColorDefault>>,
>(id: Id, kind: Kind, colorSlots: Slots) => defineCharDeskMarkdownFeature({
  id,
  kind,
  defaultEnabled: true,
  colorSlots,
});

const strong = feature("strong", "core", { foreground: token("accent") });
const emphasis = feature("emphasis", "core", { foreground: inherit });
const strikethrough = feature("strikethrough", "core", { foreground: inherit });
const link = feature("link", "core", { foreground: token("info") });
const inlineCode = feature("inline-code", "core", {
  foreground: token("info"),
  background: token("surface"),
});
const heading = feature("heading", "core", { marker: token("accent") });
const blockquote = feature("blockquote", "core", { marker: token("success") });
const list = feature("list", "core", { marker: mixed(["accent"], true) });
const taskList = feature("task-list", "core", {
  unchecked: token("muted-foreground"),
  checked: token("success"),
});
const thematicBreak = feature("thematic-break", "core", { foreground: inherit });
const codeBlock = feature("code-block", "core", {});
const table = feature("table", "core", {
  "header.foreground": token("accent-foreground"),
  "header.background": token("accent"),
  separator: token("border-subtle"),
});

const githubAlert = feature("github-alert", "extension", {
  note: token("info"),
  tip: token("success"),
  important: token("accent"),
  warning: token("warning"),
  caution: token("danger"),
});

const diff = feature("diff", "extension", {
  added: token("success"),
  deleted: token("danger"),
  hunk: token("accent"),
  metadata: token("muted-foreground"),
});

const jsonTree = feature("json-tree", "extension", {
  connector: token("border-subtle"),
  key: token("accent"),
  index: token("muted-foreground"),
  string: token("success"),
  number: token("info"),
  boolean: token("warning"),
  null: token("muted-foreground"),
  empty: token("muted-foreground"),
});

const yamlTree = feature("yaml-tree", "extension", {
  connector: token("border-subtle"),
  key: token("accent"),
  index: token("muted-foreground"),
  string: token("success"),
  number: token("info"),
  boolean: token("warning"),
  null: token("muted-foreground"),
  empty: token("muted-foreground"),
  reference: token("info"),
});

const inlineMath = feature("inline-math", "extension", { foreground: inherit });
const blockMath = feature("block-math", "extension", { foreground: inherit });
const mathStyle = feature("math-style", "style", {
  content: inherit,
  operator: token("accent"),
  structure: token("muted-foreground"),
});
const mermaid = feature("mermaid", "extension", CHARDESK_MERMAID_COLOR_DEFAULTS);
const chart = feature("chart", "extension", {});

const mixHexColors = (foreground: string, background: string, weight: number) => {
  const channel = (value: string, offset: number) =>
    Number.parseInt(value.slice(offset, offset + 2), 16);
  const mixedChannels = [1, 3, 5].map((offset) => Math.round(
    channel(foreground, offset) * weight
      + channel(background, offset) * (1 - weight)
  ));
  return `#${mixedChannels.map(
    (value) => value.toString(16).padStart(2, "0")
  ).join("")}`;
};

const coreModule = defineCharDeskMarkdownModule({
  id: "core",
  features: [
    strong,
    emphasis,
    strikethrough,
    link,
    inlineCode,
    heading,
    blockquote,
    list,
    taskList,
    thematicBreak,
    codeBlock,
    table,
  ],
  resolveStyles(context) {
    const listMarker = context.color(list, "marker");
    return {
      styles: {
        strong: {
          color: context.color(strong, "foreground"),
          attrs: { bold: true },
        },
        emphasis: {
          color: context.color(emphasis, "foreground"),
          attrs: { italic: true },
        },
        strikethrough: {
          color: context.color(strikethrough, "foreground"),
          attrs: { strike: true },
        },
        link: {
          color: context.color(link, "foreground"),
          attrs: { underline: true },
        },
        "inline-code": {
          color: context.color(inlineCode, "foreground"),
          bgColor: context.color(inlineCode, "background"),
        },
        "heading-marker": { color: context.color(heading, "marker") },
        "heading-1": { attrs: { bold: true, underline: true } },
        "heading-2": { attrs: { bold: true } },
        "heading-3": { attrs: { bold: true, italic: true } },
        "heading-4": { attrs: { italic: true } },
        "blockquote-marker": { color: context.color(blockquote, "marker") },
        ...(listMarker ? { "list-marker": { color: listMarker } } : {}),
        "ordered-list-marker": { color: listMarker ?? context.theme.accent },
        "task-unchecked": { color: context.color(taskList, "unchecked") },
        "task-checked": { color: context.color(taskList, "checked") },
        ...(context.color(thematicBreak, "foreground")
          ? {
              "thematic-break": {
                color: context.color(thematicBreak, "foreground"),
              },
            }
          : {}),
        "table-header": {
          color: context.color(table, "header.foreground"),
          bgColor: context.color(table, "header.background"),
          attrs: { bold: true },
        },
        "table-separator": { color: context.color(table, "separator") },
      },
      codeTheme: createCharDeskCodeTheme(context.theme),
    };
  },
});

const alertModule = defineCharDeskMarkdownModule({
  id: "github-alert",
  extensions: [markdownAlertExtension],
  features: [githubAlert],
  styleRoles: MARKDOWN_ALERT_STYLE_ROLES,
  resolveStyles(context) {
    return {
      extensionStyles: {
        "alert-note": { color: context.color(githubAlert, "note") },
        "alert-tip": { color: context.color(githubAlert, "tip") },
        "alert-important": { color: context.color(githubAlert, "important") },
        "alert-warning": { color: context.color(githubAlert, "warning") },
        "alert-caution": { color: context.color(githubAlert, "caution") },
      },
    };
  },
});

const diffModule = defineCharDeskMarkdownModule({
  id: "diff",
  extensions: [markdownDiffExtension],
  features: [diff],
  styleRoles: MARKDOWN_DIFF_STYLE_ROLES,
  resolveStyles(context) {
    const added = context.color(diff, "added") ?? context.theme.success;
    const deleted = context.color(diff, "deleted") ?? context.theme.danger;
    return {
      extensionStyles: {
        "diff-added": {
          color: added,
          bgColor: mixHexColors(added, context.theme.background, 0.12),
        },
        "diff-deleted": {
          color: deleted,
          bgColor: mixHexColors(deleted, context.theme.background, 0.12),
        },
        "diff-hunk": { color: context.color(diff, "hunk") },
        "diff-metadata": { color: context.color(diff, "metadata") },
      },
    };
  },
});

const dataTreeModule = defineCharDeskMarkdownModule({
  id: "data-tree",
  extensions: [markdownJsonTreeExtension, markdownYamlTreeExtension],
  features: [jsonTree, yamlTree],
  styleRoles: MARKDOWN_DATA_TREE_STYLE_ROLES,
  resolveStyles(context) {
    return {
      extensionStyles: {
        "json-tree-connector": { color: context.color(jsonTree, "connector") },
        "json-tree-key": { color: context.color(jsonTree, "key") },
        "json-tree-index": { color: context.color(jsonTree, "index") },
        "json-tree-string": { color: context.color(jsonTree, "string") },
        "json-tree-number": { color: context.color(jsonTree, "number") },
        "json-tree-boolean": { color: context.color(jsonTree, "boolean") },
        "json-tree-null": { color: context.color(jsonTree, "null") },
        "json-tree-empty": { color: context.color(jsonTree, "empty") },
        "yaml-tree-connector": { color: context.color(yamlTree, "connector") },
        "yaml-tree-key": { color: context.color(yamlTree, "key") },
        "yaml-tree-index": { color: context.color(yamlTree, "index") },
        "yaml-tree-string": { color: context.color(yamlTree, "string") },
        "yaml-tree-number": { color: context.color(yamlTree, "number") },
        "yaml-tree-boolean": { color: context.color(yamlTree, "boolean") },
        "yaml-tree-null": { color: context.color(yamlTree, "null") },
        "yaml-tree-empty": { color: context.color(yamlTree, "empty") },
        "yaml-tree-reference": { color: context.color(yamlTree, "reference") },
      },
    };
  },
});

const mathModule = defineCharDeskMarkdownModule({
  id: "math",
  extensions: [markdownMathExtension],
  features: [inlineMath, blockMath, mathStyle],
  styleRoles: MARKDOWN_MATH_STYLE_ROLES,
  resolveStyles(context) {
    return {
      extensionStyles: {
        "math-content": {
          color: context.color(mathStyle, "content")
            ?? context.color(inlineMath, "foreground")
            ?? context.color(blockMath, "foreground"),
        },
        "math-operator": { color: context.color(mathStyle, "operator") },
        "math-structure": { color: context.color(mathStyle, "structure") },
        "math-error": { color: context.theme.danger },
      },
    };
  },
});

const mermaidModule = defineCharDeskMarkdownModule({
  id: "mermaid",
  extensions: [markdownMermaidExtension],
  features: [mermaid],
  styleRoles: MARKDOWN_MERMAID_STYLE_ROLES,
  resolveStyles(context) {
    const slots = Object.keys(mermaid.colorSlots) as Array<
      keyof typeof mermaid.colorSlots
    >;
    const colors = Object.fromEntries(slots.flatMap((slot) => {
      const value = context.color(mermaid, slot);
      return value ? [[slot, value]] : [];
    }));
    const styles = createCharDeskMermaidStyles({
      theme: context.theme,
      colors,
    });
    const extensionStyles: Record<string, CharDeskTextStyle> = {};
    for (const role of MERMAID_STYLE_ROLES) {
      extensionStyles[`mermaid.${role}`] = styles[role];
    }
    return { extensionStyles };
  },
});

const chartModule = defineCharDeskMarkdownModule({
  id: "chart",
  extensions: [markdownChartExtension],
  features: [chart],
  styleRoles: MARKDOWN_CHART_STYLE_ROLES,
  resolveStyles(context) {
    const styles = createCharDeskMermaidStyles({ theme: context.theme });
    return {
      extensionStyles: Object.fromEntries(MERMAID_STYLE_ROLES.map((role) => [
        `chart.${role}`,
        styles[role],
      ])),
    };
  },
});

export const CHARDESK_MARKDOWN_MODULES = Object.freeze([
  coreModule,
  alertModule,
  diffModule,
  dataTreeModule,
  mathModule,
  chartModule,
  mermaidModule,
]);

type BuiltInMarkdownModule = typeof CHARDESK_MARKDOWN_MODULES[number];
type ModuleFeature<Module> = Module extends {
  readonly features: readonly (infer Feature)[];
} ? Feature : never;
export type CharDeskMarkdownFeature = ModuleFeature<BuiltInMarkdownModule>;
export type CharDeskMarkdownFeatureId = CharDeskMarkdownFeature["id"];
export type CharDeskMarkdownFeatureFor<
  FeatureId extends CharDeskMarkdownFeatureId,
> = Extract<CharDeskMarkdownFeature, { readonly id: FeatureId }>;
export type CharDeskMarkdownColorSlotId<
  FeatureId extends CharDeskMarkdownFeatureId,
> = keyof CharDeskMarkdownFeatureFor<FeatureId>["colorSlots"] & string;

type ModuleStyleRole<Module> = Module extends {
  readonly styleRoles: readonly (infer Role extends string)[];
} ? Role : never;
export type CharDeskMarkdownExtensionStyleRole =
  ModuleStyleRole<BuiltInMarkdownModule>;

export type CharDeskMarkdownColorOverrides = {
  readonly [FeatureId in CharDeskMarkdownFeatureId]?: Partial<
    Record<CharDeskMarkdownColorSlotId<FeatureId>, string>
  >;
};

export type CharDeskMarkdownFeatureState = {
  readonly enabled: boolean;
  readonly colors: Readonly<Record<string, string>>;
};

export type CharDeskMarkdownFeatureStates = Partial<
  Record<CharDeskMarkdownFeatureId, CharDeskMarkdownFeatureState>
>;

export const CHARDESK_MARKDOWN_FEATURES: readonly CharDeskMarkdownFeature[] =
  Object.freeze(CHARDESK_MARKDOWN_MODULES.flatMap(
    (module) => [...module.features] as CharDeskMarkdownFeature[]
  ));

export const CHARDESK_MARKDOWN_EXTENSIONS = Object.freeze(
  CHARDESK_MARKDOWN_MODULES.flatMap((module) =>
    "extensions" in module ? [...module.extensions] : []
  )
);

const assertUnique = (kind: string, values: readonly string[]) => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate Markdown ${kind}: ${value}`);
    seen.add(value);
  }
};

assertUnique("module", CHARDESK_MARKDOWN_MODULES.map((module) => module.id));
assertUnique("feature", CHARDESK_MARKDOWN_FEATURES.map((item) => item.id));
assertUnique("extension", CHARDESK_MARKDOWN_EXTENSIONS.map((item) => item.id));
assertUnique(
  "style role",
  CHARDESK_MARKDOWN_MODULES.flatMap((module) =>
    "styleRoles" in module ? [...module.styleRoles] : []
  )
);
