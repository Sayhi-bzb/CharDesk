import type { KeyEvent } from '@opentui/core';
import { segmentGraphemes } from '@chardesk/protocol';
import { CHARDESK_MARKDOWN_FEATURES } from '@chardesk/chargraph/markdown';
import {
  CHARDESK_RENDER_THEME_TOKENS,
  type CharDeskRenderThemeMode,
} from '@chardesk/chargraph/theme';
import { MARKDOWN_WRAP_WIDTH_MIN, MARKDOWN_WRAP_WIDTH_MAX } from '@chardesk/chargraph/profile';
import type { CanvasSurface, TerminalPanel } from './surface.ts';

type Stage = 'main' | 'width' | 'features' | 'feature-pick' | 'feature-slots' | 'tokens' | 'color';
/** Rendering preferences over the same dialog shell and shared CharGraph profile. */
export class TerminalTextSettings {
  #stage: Stage = 'main';
  #mode: CharDeskRenderThemeMode = 'light';
  #feature = '';
  #colorTarget: { feature?: string; slot: string } | null = null;
  #selectedAll = false;
  #features = CHARDESK_MARKDOWN_FEATURES;
  constructor(readonly surface: CanvasSurface) {}
  get nested() {
    return this.#stage !== 'main';
  }
  leave() {
    this.#stage = 'main';
    this.#selectedAll = false;
  }
  refresh(panel: TerminalPanel) {
    const profile = this.surface.settings.renderProfile;
    panel.title = this.surface.t('Settings');
    panel.status =
      this.#stage === 'main'
        ? undefined
        : this.#stage === 'feature-slots'
          ? `${this.#feature.replaceAll('-', ' ')} · ${this.surface.t(this.#mode === 'light' ? 'Light' : 'Dark')}`
          : `${({ width: this.surface.t('Wrap width'), features: this.surface.t('Rendering features'), 'feature-pick': this.surface.t('Feature colors'), tokens: this.surface.t('Semantic colors'), color: this.#colorTarget?.slot ?? this.surface.t('Color') } as Record<string, string>)[this.#stage]} · ${this.surface.t(this.#mode === 'light' ? 'Light' : 'Dark')}`;
    panel.hint = this.surface.t('Enter change · Esc back');
    panel.onInput = undefined;
    panel.onPick = (index) => {
      panel.selected = index;
      this.pick(panel);
    };
    if (this.#stage === 'main')
      panel.items = [
        this.surface
          .t`Wrap Markdown prose    ${profile.markdownWrapEnabled ? this.surface.t('On') : this.surface.t('Off')}`,
        this.surface.t`Wrap width    ${profile.markdownWrapWidth} cells`,
        this.surface
          .t`Automatic heading anchors    ${profile.markdownAutoAnchorsEnabled ? this.surface.t('On') : this.surface.t('Off')}`,
        this.surface.t('Rendering features'),
        this.surface.t('Semantic colors'),
        this.surface.t('Feature colors'),
        this.surface.t('Reset rendering defaults'),
      ];
    else if (this.#stage === 'features' || this.#stage === 'feature-pick') {
      this.#features = CHARDESK_MARKDOWN_FEATURES.filter((feature) =>
        this.#stage === 'features'
          ? feature.kind !== 'style'
          : Object.keys(feature.colorSlots).length > 0
      );
      panel.items = this.#features.map((feature) =>
        this.#stage === 'features'
          ? `${feature.id}    ${profile.features[`markdown.${feature.id}`]!.enabled ? this.surface.t('On') : this.surface.t('Off')}`
          : feature.id
      );
    } else if (this.#stage === 'tokens' || this.#stage === 'feature-slots') {
      const slots =
        this.#stage === 'tokens'
          ? CHARDESK_RENDER_THEME_TOKENS
          : Object.keys(
              CHARDESK_MARKDOWN_FEATURES.find((feature) => feature.id === this.#feature)!.colorSlots
            );
      const colors =
        this.#stage === 'tokens'
          ? profile.renderThemes[this.#mode]
          : profile.features[`markdown.${this.#feature}`]!.colors[this.#mode];
      panel.items = [
        this.surface.t`Color mode    ${this.surface.t(this.#mode === 'light' ? 'Light' : 'Dark')}`,
        ...slots.map(
          (slot) =>
            `${slot}    ${colors[slot as keyof typeof colors] ?? this.surface.t('Follows theme')}`
        ),
      ];
    } else {
      panel.items = [this.surface.t('Apply')];
      panel.hint = this.surface.t('Enter apply · Esc cancel');
    }
    if (this.#stage !== 'width' && this.#stage !== 'color') panel.input = undefined;
    panel.selected = Math.max(0, Math.min(panel.selected, panel.items.length - 1));
    this.surface.requestRender();
  }
  #show(panel: TerminalPanel, stage: Stage, input?: string) {
    this.#stage = stage;
    panel.selected = 0;
    panel.input = input;
    panel.error = undefined;
    this.#selectedAll = input !== undefined;
    this.refresh(panel);
  }
  pick(panel: TerminalPanel) {
    const store = this.surface.settings,
      profile = store.renderProfile,
      selected = panel.selected;
    if (this.#stage === 'main') {
      if (selected === 0)
        store.setRenderProfile({ markdownWrapEnabled: !profile.markdownWrapEnabled });
      else if (selected === 1) {
        this.#show(panel, 'width', String(profile.markdownWrapWidth));
        return;
      } else if (selected === 2)
        store.setRenderProfile({ markdownAutoAnchorsEnabled: !profile.markdownAutoAnchorsEnabled });
      else if (selected === 3) {
        this.#show(panel, 'features');
        return;
      } else if (selected === 4) {
        this.#show(panel, 'tokens');
        return;
      } else if (selected === 5) {
        this.#show(panel, 'feature-pick');
        return;
      } else store.reset('rendering');
    } else if (this.#stage === 'width') {
      const width = Number(panel.input?.trim());
      if (
        !Number.isInteger(width) ||
        width < MARKDOWN_WRAP_WIDTH_MIN ||
        width > MARKDOWN_WRAP_WIDTH_MAX
      ) {
        panel.error = this.surface
          .t`Use a whole number from ${MARKDOWN_WRAP_WIDTH_MIN} to ${MARKDOWN_WRAP_WIDTH_MAX}.`;
        this.surface.requestRender();
        return;
      }
      store.setRenderProfile({ markdownWrapWidth: width });
      this.#show(panel, 'main');
      return;
    } else if (this.#stage === 'features' || this.#stage === 'feature-pick') {
      const feature = this.#features[selected];
      if (!feature) return;
      if (this.#stage === 'feature-pick') {
        this.#feature = feature.id;
        this.#show(panel, 'feature-slots');
        return;
      }
      const id = `markdown.${feature.id}`,
        config = profile.features[id]!;
      store.setRenderProfile({
        features: { ...profile.features, [id]: { ...config, enabled: !config.enabled } },
      });
    } else if (this.#stage === 'tokens' || this.#stage === 'feature-slots') {
      if (selected === 0) this.#mode = this.#mode === 'light' ? 'dark' : 'light';
      else {
        const slot = (
          this.#stage === 'tokens'
            ? CHARDESK_RENDER_THEME_TOKENS
            : Object.keys(
                CHARDESK_MARKDOWN_FEATURES.find((feature) => feature.id === this.#feature)!
                  .colorSlots
              )
        )[selected - 1]!;
        this.#colorTarget = {
          slot,
          ...(this.#stage === 'feature-slots' ? { feature: this.#feature } : {}),
        };
        const colors = this.#colorTarget.feature
          ? profile.features[`markdown.${this.#feature}`]!.colors[this.#mode]
          : profile.renderThemes[this.#mode];
        this.#show(panel, 'color', colors[slot as keyof typeof colors] ?? '');
        return;
      }
    } else if (this.#stage === 'color') {
      const value = panel.input!.trim().toLowerCase();
      if (value && !/^#[\da-f]{6}$/i.test(value)) {
        panel.error = this.surface.t('Use #RRGGBB or leave empty to follow the theme.');
        this.surface.requestRender();
        return;
      }
      const target = this.#colorTarget!;
      if (target.feature) {
        const id = `markdown.${target.feature}`,
          config = profile.features[id]!,
          colors = { ...config.colors[this.#mode] };
        if (value) colors[target.slot] = value;
        else delete colors[target.slot];
        store.setRenderProfile({
          features: {
            ...profile.features,
            [id]: { ...config, colors: { ...config.colors, [this.#mode]: colors } },
          },
        });
      } else {
        const colors: Record<string, string> = { ...profile.renderThemes[this.#mode] };
        if (value) colors[target.slot] = value;
        else delete colors[target.slot];
        store.setRenderProfile({ renderThemes: { ...profile.renderThemes, [this.#mode]: colors } });
      }
      this.#show(panel, target.feature ? 'feature-slots' : 'tokens');
      return;
    }
    this.refresh(panel);
  }
  paste(panel: TerminalPanel, text: string) {
    if (panel.input === undefined) return;
    panel.input =
      (this.#selectedAll ? '' : panel.input) + text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');
    this.#selectedAll = false;
    panel.error = undefined;
    this.surface.requestRender();
  }
  key(panel: TerminalPanel, key: KeyEvent) {
    if (key.eventType === 'repeat' || key.eventType === 'release') return true;
    if (key.name === 'escape') {
      if (!this.nested) return false;
      this.#show(
        panel,
        this.#stage === 'color'
          ? this.#colorTarget?.feature
            ? 'feature-slots'
            : 'tokens'
          : this.#stage === 'feature-slots'
            ? 'feature-pick'
            : 'main'
      );
    } else if (key.name === 'return' || key.name === 'enter') this.pick(panel);
    else if (key.name === 'up' || key.name === 'down') {
      panel.selected =
        (panel.selected + (key.name === 'up' ? -1 : 1) + panel.items.length) % panel.items.length;
      this.surface.requestRender();
    } else if (panel.input !== undefined) {
      if (key.name === 'a' && (key.ctrl || key.super)) this.#selectedAll = true;
      else if (key.name === 'backspace') {
        panel.input = this.#selectedAll ? '' : segmentGraphemes(panel.input).slice(0, -1).join('');
        this.#selectedAll = false;
        panel.error = undefined;
        this.surface.requestRender();
      } else if (
        !key.ctrl &&
        !key.meta &&
        !key.super &&
        key.sequence &&
        !/\p{Cc}/u.test(key.sequence)
      )
        this.paste(panel, key.sequence);
    }
    return true;
  }
}
