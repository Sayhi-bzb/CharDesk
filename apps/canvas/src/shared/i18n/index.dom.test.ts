import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'chardesk-ui-language';
const LEGACY_STORAGE_KEY = 'ascii-canvas-ui-language';

const loadI18n = async () => {
  vi.resetModules();
  return import('./index');
};

const setBrowserLanguages = (languages: readonly string[]) =>
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);

describe('UI language initialization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-TW', 'zh-CN'],
    ['en-GB', 'en'],
  ])('maps browser language %s to %s', async (browserLanguage, documentLanguage) => {
    setBrowserLanguages([browserLanguage]);

    await loadI18n();

    expect(document.documentElement.lang).toBe(documentLanguage);
  });

  it('uses the first supported browser language and falls back to English', async () => {
    const languages = setBrowserLanguages(['fr-FR', 'zh-HK', 'en-US']);
    await loadI18n();
    expect(document.documentElement.lang).toBe('zh-CN');

    document.documentElement.lang = '';
    languages.mockReturnValue(['fr-FR', 'de-DE']);
    await loadI18n();
    expect(document.documentElement.lang).toBe('en');
  });

  it('uses navigator.language when the language list is empty', async () => {
    setBrowserLanguages([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('zh-SG');

    await loadI18n();

    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('prefers a stored user choice and ignores an invalid stored value', async () => {
    setBrowserLanguages(['zh-CN']);
    window.localStorage.setItem(STORAGE_KEY, 'en');
    await loadI18n();
    expect(document.documentElement.lang).toBe('en');

    document.documentElement.lang = '';
    window.localStorage.setItem(STORAGE_KEY, 'invalid');
    await loadI18n();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('migrates a legacy stored user choice', async () => {
    setBrowserLanguages(['en-US']);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, 'zh');

    await loadI18n();

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('zh');
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('synchronizes and persists a manual language change', async () => {
    setBrowserLanguages(['en-US']);
    const { setUiLanguage } = await loadI18n();

    setUiLanguage('zh');

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('zh');
  });

  it('continues without browser storage', async () => {
    setBrowserLanguages(['zh-CN']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const i18n = await loadI18n();
    expect(document.documentElement.lang).toBe('zh-CN');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(() => i18n.setUiLanguage('en')).not.toThrow();
    expect(document.documentElement.lang).toBe('en');
  });
});
