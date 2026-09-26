import {
  Checkbox,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chardesk/ui";
import { useCanvasCursor, useCanvasCursorRuntime } from "@/shared/canvas-cursor/hooks";
import { useUiI18n } from "@/shared/i18n";

export function CanvasCursorShapeSelect() {
  const { t } = useUiI18n();
  const preference = useCanvasCursor();
  const runtime = useCanvasCursorRuntime();
  return (
    <Select value={preference.shape} onValueChange={runtime.setShape}>
      <SelectTrigger
        id="settings-canvas-cursor"
        data-settings-control=""
        aria-label={t("settings.canvasCursor")}
        className="ml-auto w-full min-w-0 max-w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" position="popper">
        <SelectGroup>
          <SelectItem value="block">{t("settings.canvasCursor.block")}</SelectItem>
          <SelectItem value="bar">{t("settings.canvasCursor.bar")}</SelectItem>
          <SelectItem value="underline">{t("settings.canvasCursor.underline")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function CanvasCursorBlinkCheckbox() {
  const { t } = useUiI18n();
  const preference = useCanvasCursor();
  const runtime = useCanvasCursorRuntime();
  return (
    <Checkbox
      id="settings-canvas-cursor-blink"
      data-settings-control=""
      aria-label={t("settings.canvasCursorBlink")}
      checked={preference.blink}
      onCheckedChange={(checked) => runtime.setBlink(checked === true)}
    />
  );
}
