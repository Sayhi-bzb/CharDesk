import { describe, expect, it } from 'vitest';
import { resolveEditorFormFactor } from './types';
import { resolveEditorHostPolicy, isHostSettingVisible } from './host-policy';
import { getSettingsSearchResults } from '../dialogs/settings-search';

describe('phone Host presentation policy', () => {
  const phone = resolveEditorHostPolicy('phone');
  it.each([320, 390, 767])('uses light presentation at %ipx', (width) => {
    expect(resolveEditorHostPolicy(resolveEditorFormFactor(width))).toEqual(phone);
    expect(Object.values(phone).every((value) => !value)).toBe(true);
  });
  it.each([768, 1024, 1440])('retains full presentation at %ipx', (width) => {
    expect(Object.values(resolveEditorHostPolicy(resolveEditorFormFactor(width))).every(Boolean)).toBe(true);
  });
  it('exposes everyday settings, not advanced configuration', () => {
    for (const focus of ['language', 'host-theme', 'canvas-font', 'text-renderer', 'markdown-wrap', 'markdown-auto-anchors']) {
      expect(isHostSettingVisible(phone, 'general', focus)).toBe(true);
    }
    expect(isHostSettingVisible(phone, 'shortcuts')).toBe(false);
    expect(isHostSettingVisible(phone, 'general', 'canvas-cursor')).toBe(false);
    expect(isHostSettingVisible(phone, 'display', 'render-feature')).toBe(false);
  });
  it('removes hidden settings and their aliases from search', () => {
    const t: Parameters<typeof getSettingsSearchResults>[2] = (key) => key;
    for (const query of ['光标', '闪烁', 'settings.renderTheme.accent']) {
      expect(getSettingsSearchResults(query, [], t, phone)).toEqual([]);
      expect(getSettingsSearchResults(query, [], t).length).toBeGreaterThan(0);
    }
    expect(getSettingsSearchResults('自动换行', [], t, phone)).toHaveLength(1);
  });
});
