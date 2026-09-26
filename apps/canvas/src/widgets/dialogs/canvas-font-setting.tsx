import { Button, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Tooltip, TooltipPopup, TooltipTrigger } from "@chardesk/ui";
import { displayFontOptions } from "@/shared/fonts/catalog";
import { useCanvasFont, useCanvasFontRuntime } from "@/shared/fonts/hooks";
import { isDisplayFont } from "@/shared/fonts/runtime";
import { useUiI18n } from "@/shared/i18n";

export function CanvasFontSelect() {
  const { t } = useUiI18n();
  const { requestedFont, status } = useCanvasFont();
  const runtime = useCanvasFontRuntime();
  return (
    <Select value={requestedFont} onValueChange={(font) => { if (isDisplayFont(font)) void runtime.select(font); }}>
      <SelectTrigger
        id="settings-canvas-font"
        data-settings-control=""
        aria-label={t("settings.canvasFont")}
        aria-describedby="settings-canvas-font-status"
        aria-busy={status === "loading" || undefined}
        aria-invalid={status === "error" || undefined}
        className="ml-auto w-full min-w-0 max-w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" position="popper">
        <SelectGroup>
          {Object.values(displayFontOptions).map(({ id, label }) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function CanvasFontStatus() {
  const { t } = useUiI18n();
  const { font, requestedFont, status } = useCanvasFont();
  const runtime = useCanvasFontRuntime();
  const message = status === "error"
    ? t("settings.canvasFont.failed", { font: displayFontOptions[font].label })
    : status === "loading" ? t("settings.canvasFont.loading") : "";
  return (
    <div className="flex min-w-0 items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger render={<span id="settings-canvas-font-status" role="status" className="truncate" />}>
          {message}
        </TooltipTrigger>
        {message ? <TooltipPopup>{message}</TooltipPopup> : null}
      </Tooltip>
      {status === "error" ? (
        <Button size="sm" tone="neutral" subordinate onClick={() => { void runtime.select(requestedFont); }}>
          {t("settings.canvasFont.retry")}
        </Button>
      ) : null}
    </div>
  );
}
