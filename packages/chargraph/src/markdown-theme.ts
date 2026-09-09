import type { CharDeskTextStyle } from "@chardesk/protocol";
import type { ThemeRegistration } from "shiki";
import type {
  MarkdownRenderOptions,
  MarkdownTextRules,
  MarkdownTextStyles,
} from "./markdown.js";
import {
  CHARDESK_MARKDOWN_FEATURES,
  CHARDESK_MARKDOWN_MODULES,
  type CharDeskMarkdownColorOverrides,
  type CharDeskMarkdownColorSlotId,
  type CharDeskMarkdownExtensionStyleRole,
  type CharDeskMarkdownFeature,
  type CharDeskMarkdownFeatureId,
  type CharDeskMarkdownFeatureStates,
} from "./markdown-modules.js";
import type { CharDeskMarkdownModule } from "./markdown-module.js";
import {
  CHARDESK_LIGHT_RENDER_THEME,
  resolveCharDeskRenderColor,
  resolveCharDeskRenderTheme,
  type CharDeskRenderColorDefault,
  type CharDeskRenderThemeInput,
} from "./render-theme.js";

export {
  CHARDESK_DARK_RENDER_THEME,
  CHARDESK_LIGHT_RENDER_THEME,
  CHARDESK_RENDER_THEMES,
  CHARDESK_RENDER_THEME_TOKENS,
  resolveCharDeskRenderTheme,
} from "./render-theme.js";
export type {
  CharDeskRenderColorDefault,
  CharDeskRenderTheme,
  CharDeskRenderThemeInput,
  CharDeskRenderThemeMode,
  CharDeskRenderThemeToken,
} from "./render-theme.js";
export type {
  CharDeskMarkdownColorOverrides,
  CharDeskMarkdownColorSlotId,
  CharDeskMarkdownExtensionStyleRole,
  CharDeskMarkdownFeature,
  CharDeskMarkdownFeatureId,
  CharDeskMarkdownFeatureState,
  CharDeskMarkdownFeatureStates,
} from "./markdown-modules.js";

export type CharDeskMarkdownColorDefault = CharDeskRenderColorDefault;

export type CharDeskMarkdownStyles = {
  readonly styles: MarkdownTextStyles;
  readonly extensionStyles: Readonly<
    Partial<Record<CharDeskMarkdownExtensionStyleRole, CharDeskTextStyle>>
  >;
  readonly codeTheme: ThemeRegistration;
};

export const CHARDESK_MARKDOWN_COLOR_DEFAULTS = Object.freeze(
  Object.fromEntries(CHARDESK_MARKDOWN_FEATURES.map((feature) => [
    feature.id,
    feature.colorSlots,
  ])) as Readonly<
    Record<
      CharDeskMarkdownFeatureId,
      Readonly<Record<string, CharDeskMarkdownColorDefault>>
    >
  >
);

const FEATURES_BY_ID = new Map<CharDeskMarkdownFeatureId, CharDeskMarkdownFeature>(
  CHARDESK_MARKDOWN_FEATURES.map((feature) => [feature.id, feature])
);

const getFeature = (featureId: CharDeskMarkdownFeatureId) => {
  const feature = FEATURES_BY_ID.get(featureId);
  if (!feature) throw new RangeError(`Unknown Markdown feature: ${featureId}`);
  return feature;
};

export const getCharDeskMarkdownColorDefault = <
  FeatureId extends CharDeskMarkdownFeatureId,
>(
  featureId: FeatureId,
  slot: CharDeskMarkdownColorSlotId<FeatureId>
): CharDeskMarkdownColorDefault => {
  const value = (
    getFeature(featureId).colorSlots as Readonly<
      Record<string, CharDeskMarkdownColorDefault>
    >
  )[slot];
  if (!value) {
    throw new RangeError(`Unknown Markdown color slot: ${featureId}.${slot}`);
  }
  return value;
};

export const withCharDeskMarkdownColor = <
  FeatureId extends CharDeskMarkdownFeatureId,
>(
  colors: CharDeskMarkdownColorOverrides,
  featureId: FeatureId,
  slot: CharDeskMarkdownColorSlotId<FeatureId>,
  value: string
): CharDeskMarkdownColorOverrides => ({
  ...colors,
  [featureId]: {
    ...colors[featureId],
    [slot]: value,
  },
});

const configuredColor = (
  colors: CharDeskMarkdownColorOverrides,
  featureId: CharDeskMarkdownFeatureId,
  slot: string
) => (colors[featureId] as Readonly<Record<string, string>> | undefined)?.[slot];

export const createCharDeskMarkdownStyles = ({
  theme: themeInput = CHARDESK_LIGHT_RENDER_THEME,
  colors = {},
}: {
  theme?: CharDeskRenderThemeInput;
  colors?: CharDeskMarkdownColorOverrides;
} = {}): CharDeskMarkdownStyles => {
  const theme = resolveCharDeskRenderTheme(themeInput);
  const styles: MarkdownTextStyles = {};
  const extensionStyles: Record<string, CharDeskTextStyle> = {};
  let codeTheme: ThemeRegistration | undefined;

  for (const registeredModule of CHARDESK_MARKDOWN_MODULES) {
    const module: CharDeskMarkdownModule = registeredModule;
    const contribution = module.resolveStyles({
      theme,
      color(feature, slot) {
        const colorOverride = configuredColor(
          colors,
          feature.id as CharDeskMarkdownFeatureId,
          slot
        );
        if (colorOverride) return colorOverride;
        const colorDefault = feature.colorSlots[slot];
        if (!colorDefault) return undefined;
        return resolveCharDeskRenderColor(colorDefault, theme);
      },
    });
    Object.assign(styles, contribution.styles);
    Object.assign(extensionStyles, contribution.extensionStyles);
    codeTheme = contribution.codeTheme ?? codeTheme;
  }

  if (!codeTheme) throw new Error("Markdown modules did not provide a code theme");
  return {
    styles,
    extensionStyles: extensionStyles as CharDeskMarkdownStyles["extensionStyles"],
    codeTheme,
  };
};

export const createCharDeskMarkdownRenderOptions = ({
  theme = CHARDESK_LIGHT_RENDER_THEME,
  features = {},
  forced = false,
}: {
  theme?: CharDeskRenderThemeInput;
  features?: CharDeskMarkdownFeatureStates;
  forced?: boolean;
} = {}): MarkdownRenderOptions => {
  const rules: Partial<MarkdownTextRules> = {};
  const extensionRules: Record<string, boolean> = {};
  let colors: CharDeskMarkdownColorOverrides = {};

  for (const feature of CHARDESK_MARKDOWN_FEATURES) {
    const state = features[feature.id];
    const enabled = state?.enabled ?? feature.defaultEnabled;
    if (feature.kind === "core") {
      rules[feature.id as keyof MarkdownTextRules] = enabled;
    } else if (feature.kind === "extension") {
      extensionRules[feature.id] = enabled;
    }
    for (const [slot, value] of Object.entries(state?.colors ?? {})) {
      if (!(slot in feature.colorSlots)) continue;
      colors = {
        ...colors,
        [feature.id]: { ...colors[feature.id], [slot]: value },
      };
    }
  }

  return {
    forced,
    rules,
    extensionRules,
    ...createCharDeskMarkdownStyles({ theme, colors }),
  };
};
