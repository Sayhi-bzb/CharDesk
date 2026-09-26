import type { ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Button,
  Spinner,
} from "@chardesk/ui";
import {
  useCanvasPersistence,
  useCanvasRuntime,
  type CanvasRestoreFailureReason,
} from "@/domains/canvas/public";
import { useUiI18n } from "@/shared/i18n";
import { StartupScreen } from "./StartupScreens";

function RestoringWorkspaceShell() {
  const { t } = useUiI18n();
  return <StartupScreen phase="restoring" heading={t("startup.restoring")} />;
}

function TemporaryWorkspaceAlert({
  reason,
  retrying,
  onRetry,
}: {
  reason: CanvasRestoreFailureReason | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useUiI18n();
  const upgradeBlocked = reason === "upgrade-blocked";
  return (
    <div
      data-canvas-ui="true"
      data-testid="temporary-canvas-alert"
      className="pointer-events-auto absolute left-1/2 top-(--editor-safe-top) z-(--layer-contextual) w-[min(28rem,calc(100%-2rem))] -translate-x-1/2"
    >
      <Alert>
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>
          {t(upgradeBlocked
            ? "startup.upgradeBlockedTitle"
            : "startup.temporaryTitle")}
        </AlertTitle>
        <AlertDescription>
          {t(upgradeBlocked
            ? "startup.upgradeBlockedDescription"
            : "startup.temporaryDescription")}
        </AlertDescription>
        <AlertAction>
          <Button
            type="button"
            tone="subtle"
            size="sm"
            outlined
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <RefreshCcw data-icon="inline-start" />
            )}
            {t(retrying ? "startup.retrying" : "startup.retry")}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}

export function CanvasStartupBoundary({ children }: { children: ReactNode }) {
  const canvas = useCanvasRuntime();
  const persistence = useCanvasPersistence();
  const restorePhase = persistence.restore.phase;
  if (restorePhase === "initializing") return <RestoringWorkspaceShell />;

  const retrying = restorePhase === "retrying";
  const temporary = restorePhase === "temporary" || retrying;
  return (
    <div
      data-testid="canvas-runtime-shell"
      data-restore-phase={restorePhase}
      aria-busy={retrying || undefined}
      className="relative size-full"
    >
      <div className="size-full" inert={retrying || undefined}>
        {children}
      </div>
      {temporary ? (
        <TemporaryWorkspaceAlert
          reason={persistence.restore.reason}
          retrying={retrying}
          onRetry={() => void canvas.retryRestore()}
        />
      ) : null}
    </div>
  );
}
