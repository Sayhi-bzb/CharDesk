"use client";

import { useUiI18n } from "@/shared/i18n";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@chardesk/ui";
import {
  useCanvasPersistence,
  useCanvasRuntime,
  useCanvasState,
} from "@/domains/canvas/public";

type DataSecurityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DataSecurityDialog({
  open,
  onOpenChange,
}: DataSecurityDialogProps) {
  const { t } = useUiI18n();
  const canvas = useCanvasRuntime();
  const persistence = useCanvasPersistence();
  const collaboration = useCanvasState((state) =>
    state.canvasSessions.find((session) => session.id === state.activeCanvasId)?.collaboration
  );
  const collaborationDisclosure = collaboration
    ? collaboration.version === 7
      ? [t("security.encryptedRelay.title"), t("security.encryptedRelay.description")] as const
      : [t("security.syncServer.title"), t("security.syncServer.description")] as const
    : null;
  const disclosures = collaborationDisclosure
    ? [
        ["local", t("security.local.title"), t("security.local.description")],
        ["room", collaborationDisclosure[0], collaborationDisclosure[1]],
      ] as const
    : [
        ["local", t("security.local.title"), t("security.local.description")],
        ["private", t("security.private.title"), t("security.private.description")],
        ["control", t("security.control.title"), t("security.control.description")],
      ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("security.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            {disclosures.map(([key, title, description]) => (
              <div key={key} className="contents">
                <dt className="font-medium text-foreground">{title}</dt>
                <dd className="leading-5 text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {collaboration ? t("security.collaborationNote") : t("security.storageNote")}
          </p>
          {persistence.save === "error" && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-control border border-destructive/30 p-2 text-xs">
              <span className="min-w-0 text-destructive">
                {t("security.persistence.unsavedDescription")}
                {persistence.error && (
                  <span className="mt-1 block break-words font-mono text-[10px] leading-4">
                    {persistence.error}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                tone="neutral"
                onClick={() => void canvas.retryPersistence()}
              >
                {t("security.persistence.retry")}
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
