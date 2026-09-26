import type {
  CharDeskContentColorDefault,
  CharDeskContentTheme,
  CharDeskContentThemeMode,
  CharDeskContentThemeToken,
} from "@chardesk/rendering/theme";
import type { I18nKey } from "@/shared/i18n";
import type { GridCell } from "@/shared/types";

export type BuiltInTextRendererId = "raw" | "ansi" | "markdown";
export type TextRendererId = BuiltInTextRendererId | "block-layout";
export type TextRendererMode = "auto" | BuiltInTextRendererId;
export type TextRenderThemeTokenId = CharDeskContentThemeToken;
export type TextRenderThemeMode = CharDeskContentThemeMode;
export type TextRenderTheme = CharDeskContentTheme;
export type TextRenderThemeOverrides = Partial<TextRenderTheme>;
export type TextRenderThemeMap<Value> = Record<TextRenderThemeMode, Value>;
export type TextRenderColorDefault = CharDeskContentColorDefault;
export type TextRenderFeatureId = string;
export type TextRenderFeatureColorSlotDefinition = {
  readonly id: string;
  readonly label?: I18nKey;
  readonly default: TextRenderColorDefault;
};
export type TextRenderFeatureColorRowDefinition = {
  readonly id: string;
  readonly label: I18nKey;
  readonly slotIds: readonly string[];
};
export type TextRenderFeatureDefinition = {
  readonly id: TextRenderFeatureId;
  readonly rendererId: TextRendererId;
  readonly settingsGroup: string;
  readonly label: I18nKey;
  readonly control?: "toggle" | "style";
  readonly defaultEnabled: boolean;
  readonly colorSlots: readonly TextRenderFeatureColorSlotDefinition[];
  readonly colorRows?: readonly TextRenderFeatureColorRowDefinition[];
};
export type TextRenderFeatureConfig = {
  enabled: boolean;
  colors: TextRenderThemeMap<Record<string, string>>;
};
export type TextRenderFeatureSettings = Record<
  TextRenderFeatureId,
  TextRenderFeatureConfig
>;

export type TextRenderProfile = {
  mode: TextRendererMode;
  renderThemes: TextRenderThemeMap<TextRenderThemeOverrides>;
  features: TextRenderFeatureSettings;
};

export type TextRenderContext = {
  themeMode: TextRenderThemeMode;
};

export type RenderedTextCell = GridCell & { x: number; y: number };
export type RenderedTextSpan = Omit<GridCell, "char"> & {
  x: number;
  width: number;
  text: string;
};
export type RenderedTextRow = { y: number; spans: RenderedTextSpan[] };

type TextRenderDiagnostic = {
  code: string;
  message: string;
  offset?: number;
  length?: number;
};

export type TextRenderResult =
  | {
      kind: "plain";
      renderer: TextRendererId;
      pipeline: readonly TextRendererId[];
      text: string;
      diagnostics: TextRenderDiagnostic[];
    }
  | {
      kind: "styled";
      renderer: TextRendererId;
      pipeline: readonly TextRendererId[];
      cells: RenderedTextCell[];
      diagnostics: TextRenderDiagnostic[];
    };

export type CompactTextRenderResult =
  | Extract<TextRenderResult, { kind: "plain" }>
  | {
      kind: "spans";
      renderer: TextRendererId;
      pipeline: readonly TextRendererId[];
      rows: RenderedTextRow[];
      width: number;
      height: number;
      diagnostics: TextRenderDiagnostic[];
    };

export type TextRenderingStorage = Pick<Storage, "getItem" | "setItem">;
