"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useUiTheme,
  type UiThemeMode,
} from "@chardesk/ui";
import { useUiI18n } from "@/shared/i18n";

const modes = ["light", "dark", "system"] as const satisfies readonly UiThemeMode[];

export function HostThemeSelect() {
  const { t } = useUiI18n();
  const { theme, setTheme } = useUiTheme();

  return (
    <Select
      value={theme ?? "light"}
      onValueChange={(value) => setTheme(value as UiThemeMode)}
    >
      <SelectTrigger id="settings-host-theme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" position="popper">
        <SelectGroup>
          {modes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`settings.theme.${mode}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
