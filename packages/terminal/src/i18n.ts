import { zhCN } from './translations.ts';

export type TerminalLanguage = 'system' | 'zh-CN' | 'en';
export type InterfaceLanguage = Exclude<TerminalLanguage, 'system'>;
export type Translate = (text: string | TemplateStringsArray, ...values: unknown[]) => string;

/** POSIX locale precedence; unsupported locales use English. No terminal subprocesses. */
export function systemLanguage(
  environment: NodeJS.ProcessEnv = process.env,
  fallback = Intl.DateTimeFormat().resolvedOptions().locale
): InterfaceLanguage {
  const locale = [environment.LC_ALL, environment.LC_MESSAGES, environment.LANG, fallback].find(
    (value) => value?.trim()
  )!;
  return /^zh(?:[-_.@]|$)/i.test(locale.trim()) ? 'zh-CN' : 'en';
}

/** Per-host translation; interpolated content is never looked up or re-interpolated. */
export class TerminalI18n {
  constructor(
    private preference: () => TerminalLanguage,
    readonly system: InterfaceLanguage
  ) {}
  get language(): InterfaceLanguage {
    const choice = this.preference();
    return choice === 'system' ? this.system : choice;
  }
  readonly t: Translate = (text, ...values) => {
    const key =
      typeof text === 'string'
        ? text
        : text.reduce((result, part, index) => result + `{${index - 1}}` + part);
    const pattern = this.language === 'zh-CN' ? (zhCN[key] ?? key) : key;
    return values.length
      ? pattern.replace(/\{(\d+)\}/g, (token, index: string) =>
          Number(index) < values.length ? String(values[Number(index)]) : token
        )
      : pattern;
  };
}

export const english: Translate = new TerminalI18n(() => 'en', 'en').t;
