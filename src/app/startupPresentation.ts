export type StartupLanguage = "en" | "zh";
export type StartupPhase = "opening" | "transferring" | "loading" | "restoring";

export const startupCopy = {
  en: {
    opening: "Opening Canvas",
    transferring: "Checking your old workspace",
    loading: "Loading Canvas",
    restoring: "Restoring workspace",
    transferFailed: "Old workspace could not be transferred",
    transferUnknown: "Transfer failed",
    recover: "Open old Canvas to recover your work",
    retry: "Retry transfer",
    transferInTab: "Transfer in a tab",
    continue: "Continue without old workspace",
    loadFailed: "Unable to load CharDesk",
    loadFailedDetail: "The interface changed or its cache expired. Reload to try again.",
    reload: "Reload",
  },
  zh: {
    opening: "正在打开 Canvas",
    transferring: "正在检查旧工作区",
    loading: "正在加载 Canvas",
    restoring: "正在恢复工作区",
    transferFailed: "无法迁移旧工作区",
    transferUnknown: "迁移失败",
    recover: "打开旧 Canvas 恢复工作内容",
    retry: "重试迁移",
    transferInTab: "在新标签页中迁移",
    continue: "不迁移旧工作区并继续",
    loadFailed: "无法加载 CharDesk",
    loadFailedDetail: "界面已更新或缓存已过期，请重新加载。",
    reload: "重新加载",
  },
} as const;

const normalizeLanguage = (value: string | null | undefined): StartupLanguage | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "zh" || normalized?.startsWith("zh-")) return "zh";
  if (normalized === "en" || normalized?.startsWith("en-")) return "en";
  return null;
};

export function readStartupLanguage(): StartupLanguage {
  try {
    const stored = normalizeLanguage(localStorage.getItem("chardesk-ui-language")
      ?? localStorage.getItem("ascii-canvas-ui-language"));
    if (stored) return stored;
  } catch { /* Browser storage can be unavailable before the app starts. */ }
  try {
    for (const preferred of navigator.languages.length ? navigator.languages : [navigator.language]) {
      const language = normalizeLanguage(preferred);
      if (language) return language;
    }
  } catch { /* English is the static document fallback. */ }
  return "en";
}

export function readStartupTheme(): "light" | "dark" {
  try {
    const preference = localStorage.getItem("chardesk-host-theme");
    if (preference === "dark") return "dark";
    if (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch { /* Preserve the default light theme. */ }
  return "light";
}
