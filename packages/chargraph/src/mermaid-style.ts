import type { CharDeskTextStyle } from "@chardesk/protocol";
import {
  CHARDESK_LIGHT_RENDER_THEME,
  resolveCharDeskRenderColor,
  resolveCharDeskRenderTheme,
  type CharDeskRenderColorDefault,
  type CharDeskRenderTheme,
  type CharDeskRenderThemeInput,
  type CharDeskRenderThemeToken,
} from "./render-theme.js";

export const MERMAID_STYLE_ROLES = [
  "title",
  "node.text",
  "node.border",
  "node.background",
  "flow.node.border",
  "flow.node.marker",
  "state.start",
  "state.end",
  "edge.line",
  "edge.label",
  "edge.arrow",
  "container.border",
  "container.title",
  "sequence.activation",
  "chart.axis",
  "chart.grid",
  "chart.label",
  "series.1",
  "series.2",
  "series.3",
  "series.4",
  "series.5",
] as const;

export type MermaidStyleRole = typeof MERMAID_STYLE_ROLES[number];

export type MermaidStyleMap = Partial<
  Record<MermaidStyleRole, CharDeskTextStyle>
>;

export type CharDeskMermaidStyles = Readonly<
  Record<MermaidStyleRole, CharDeskTextStyle>
>;

const inherit = Object.freeze({ kind: "inherit" } as const);
const token = (value: CharDeskRenderThemeToken) => Object.freeze({
  kind: "token",
  token: value,
} as const);

export const CHARDESK_MERMAID_COLOR_DEFAULTS = Object.freeze({
  title: token("accent"),
  "node.text": token("foreground"),
  "node.border": token("accent"),
  "node.background": inherit,
  "flow.node.border": token("accent"),
  "flow.node.marker": token("accent"),
  "state.start": token("info"),
  "state.end": token("success"),
  "edge.line": token("accent"),
  "edge.label": token("foreground"),
  "edge.arrow": token("accent"),
  "container.border": token("border-subtle"),
  "container.title": token("accent"),
  "sequence.activation": token("warning"),
  "chart.axis": token("foreground"),
  "chart.grid": token("grid-subtle"),
  "chart.label": token("foreground"),
  "series.1": token("accent"),
  "series.2": token("done"),
  "series.3": token("success"),
  "series.4": token("warning"),
  "series.5": token("danger"),
} as const satisfies Readonly<
  Record<MermaidStyleRole, CharDeskRenderColorDefault>
>);

export const createCharDeskMermaidStyles = ({
  theme: themeInput = CHARDESK_LIGHT_RENDER_THEME,
  colors = {},
}: {
  theme?: CharDeskRenderThemeInput;
  colors?: Partial<Record<MermaidStyleRole, string>>;
} = {}): CharDeskMermaidStyles => {
  const theme: CharDeskRenderTheme = resolveCharDeskRenderTheme(themeInput);
  const color = (role: MermaidStyleRole) => colors[role]
    ?? resolveCharDeskRenderColor(CHARDESK_MERMAID_COLOR_DEFAULTS[role], theme);
  const nodeBackground = color("node.background");
  const structuralColor = colors["node.border"]
    ?? colors["flow.node.border"]
    ?? colors["edge.line"]
    ?? colors["edge.arrow"]
    ?? resolveCharDeskRenderColor(
      CHARDESK_MERMAID_COLOR_DEFAULTS["node.border"],
      theme,
    );
  return {
    title: { color: color("title"), attrs: { bold: true } },
    "node.text": {
      color: color("node.text"),
      bgColor: nodeBackground,
    },
    "node.border": { color: structuralColor },
    "node.background": { bgColor: nodeBackground },
    "flow.node.border": { color: structuralColor },
    "flow.node.marker": { color: color("flow.node.marker") },
    "state.start": { color: color("state.start") },
    "state.end": { color: color("state.end") },
    "edge.line": { color: structuralColor },
    "edge.label": {
      color: color("edge.label"),
      attrs: { italic: true },
    },
    "edge.arrow": { color: structuralColor },
    "container.border": { color: color("container.border") },
    "container.title": {
      color: color("container.title"),
      attrs: { bold: true },
    },
    "sequence.activation": { color: color("sequence.activation") },
    "chart.axis": { color: color("chart.axis") },
    "chart.grid": { color: color("chart.grid") },
    "chart.label": { color: color("chart.label") },
    "series.1": { color: color("series.1") },
    "series.2": { color: color("series.2") },
    "series.3": { color: color("series.3") },
    "series.4": { color: color("series.4") },
    "series.5": { color: color("series.5") },
  };
};
