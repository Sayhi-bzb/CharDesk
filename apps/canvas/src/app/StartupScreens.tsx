import type { ReactNode } from "react";
import { readStartupLanguage, startupCopy, type StartupPhase } from "./startupPresentation";

export function StartupScreen({
  phase,
  heading,
  detail,
  actions,
}: {
  phase: StartupPhase | "load-failed";
  heading: string;
  detail?: string;
  actions?: ReactNode;
}) {
  const loading = phase !== "load-failed";
  return (
    <main className="startup-shell" data-startup-phase={phase} aria-busy={loading || undefined}>
      <div className="startup-content">
        <div className="startup-brand">CharDesk</div>
        <h1 className="startup-title" role={loading ? "status" : undefined} aria-live={loading ? "polite" : undefined}>
          {heading}
        </h1>
        {detail ? <p className="startup-detail" role={loading ? undefined : "alert"}>{detail}</p> : null}
        {loading ? <div className="startup-progress" aria-hidden="true" /> : null}
        {actions ? <div className="startup-actions">{actions}</div> : null}
      </div>
    </main>
  );
}

export function ModuleLoadingScreen() {
  return <StartupScreen phase="loading" heading={startupCopy[readStartupLanguage()].loading} />;
}

export function ModuleLoadFailure({ onReload }: { onReload: () => void }) {
  const copy = startupCopy[readStartupLanguage()];
  return <StartupScreen phase="load-failed" heading={copy.loadFailed} detail={copy.loadFailedDetail}
    actions={<button type="button" className="startup-action" onClick={onReload}>{copy.reload}</button>} />;
}
