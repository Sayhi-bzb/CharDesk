import { Button, Spinner } from "@chardesk/ui";
import { useCollaborationRuntime } from "@/domains/collaboration/public";
import { useUiI18n } from "@/shared/i18n";
import { useCollaborationSnapshot } from "./useCollaborationSnapshot";

export function CollaborationJoiningOverlay() {
  const runtime = useCollaborationRuntime();
  const snapshot = useCollaborationSnapshot();
  const { t } = useUiI18n();

  if (snapshot.documentStatus !== "joining") return null;
  const offline = snapshot.connectionStatus === "offline";
  const message = offline
    ? t("collaboration.joining.unavailable")
    : snapshot.connectionStatus === "connecting"
      ? t("collaboration.joining.connecting")
      : t("collaboration.joining.waitingForDocument");

  return (
    <div
      data-canvas-ui="true"
      data-testid="collaboration-joining"
      className="pointer-events-auto absolute inset-0 z-(--layer-contextual) grid place-items-center bg-background"
      role="status"
      aria-live="polite"
      aria-busy={!offline}
    >
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {!offline && <Spinner />}
        <span>
          {message}
        </span>
        {offline && (
          <Button type="button" tone="subtle" size="sm" onClick={() => void runtime.retry()}>
            {t("collaboration.retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
