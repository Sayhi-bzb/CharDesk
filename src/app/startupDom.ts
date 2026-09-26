import { readStartupLanguage, readStartupTheme, startupCopy, type StartupPhase } from "./startupPresentation";

const root = () => document.getElementById("root");

export function showStartupPhase(phase: StartupPhase) {
  const language = readStartupLanguage();
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.documentElement.classList.toggle("dark", readStartupTheme() === "dark");
  const shell = root()?.querySelector<HTMLElement>(".startup-shell");
  if (shell?.dataset.startupPhase === "transfer-failed" || shell?.dataset.startupPhase === "load-failed") {
    const content = shell.querySelector<HTMLElement>(".startup-content")!;
    const brand = document.createElement("div");
    brand.className = "startup-brand";
    brand.textContent = "CharDesk";
    const title = document.createElement("h1");
    title.className = "startup-title";
    title.setAttribute("role", "status");
    title.setAttribute("aria-live", "polite");
    const progress = document.createElement("div");
    progress.className = "startup-progress";
    progress.setAttribute("aria-hidden", "true");
    content.replaceChildren(brand, title, progress);
  }
  const title = shell?.querySelector<HTMLElement>(".startup-title");
  if (shell) shell.dataset.startupPhase = phase;
  shell?.setAttribute("aria-busy", "true");
  if (title) title.textContent = startupCopy[language][phase];
}

type MigrationActions = Readonly<{
  retry: () => void;
  transferInTab: () => Promise<void>;
  continue: () => void;
  recoverHref: string;
}>;

export function showStartupMigrationFailure(error: unknown, actions: MigrationActions): void {
  const shell = root()?.querySelector<HTMLElement>(".startup-shell");
  if (!shell) throw new Error("Startup shell is unavailable");
  const language = readStartupLanguage();
  const copy = startupCopy[language];
  shell.dataset.startupPhase = "transfer-failed";
  shell.removeAttribute("aria-busy");
  shell.querySelector(".startup-progress")?.remove();
  const content = shell.querySelector<HTMLElement>(".startup-content")!;
  const title = content.querySelector<HTMLElement>(".startup-title")!;
  title.removeAttribute("role");
  title.removeAttribute("aria-live");
  title.textContent = copy.transferFailed;
  const detail = document.createElement("p");
  detail.className = "startup-detail";
  detail.setAttribute("role", "alert");
  detail.textContent = error instanceof Error ? error.message : copy.transferUnknown;
  const controls = document.createElement("div");
  controls.className = "startup-actions";
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "startup-action";
    element.textContent = label;
    element.addEventListener("click", action);
    controls.append(element);
    return element;
  };
  button(copy.retry, actions.retry);
  button(copy.transferInTab, () => {
    controls.querySelectorAll("button").forEach((control) => { control.disabled = true; });
    void actions.transferInTab().catch((failure: unknown) => {
      detail.textContent = failure instanceof Error ? failure.message : copy.transferUnknown;
      controls.querySelectorAll("button").forEach((control) => { control.disabled = false; });
    });
  });
  button(copy.continue, actions.continue);
  const recovery = document.createElement("a");
  recovery.className = "startup-action";
  recovery.href = actions.recoverHref;
  recovery.target = "_blank";
  recovery.rel = "noopener noreferrer";
  recovery.textContent = copy.recover;
  controls.append(recovery);
  content.append(detail, controls);
}

export function showStartupFatalFailure(error: unknown): void {
  const shell = root()?.querySelector<HTMLElement>(".startup-shell");
  if (!shell) return;
  const copy = startupCopy[readStartupLanguage()];
  shell.dataset.startupPhase = "load-failed";
  shell.removeAttribute("aria-busy");
  shell.querySelector(".startup-progress")?.remove();
  const content = shell.querySelector<HTMLElement>(".startup-content")!;
  content.querySelector<HTMLElement>(".startup-title")!.textContent = copy.loadFailed;
  const detail = document.createElement("p");
  detail.className = "startup-detail";
  detail.setAttribute("role", "alert");
  detail.textContent = error instanceof Error ? error.message : copy.loadFailedDetail;
  const actions = document.createElement("div");
  actions.className = "startup-actions";
  const reload = document.createElement("button");
  reload.className = "startup-action";
  reload.type = "button";
  reload.textContent = copy.reload;
  reload.onclick = () => window.location.reload();
  actions.append(reload);
  content.append(detail, actions);
}
