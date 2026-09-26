"use client";

import { useState, type RefObject } from "react";
import {
  isValidSlideDimension,
  isValidSlideSize,
  type SlideSize,
} from "@/domains/slides/public";
import { useUiI18n } from "@/shared/i18n";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  StatusText,
} from "@chardesk/ui";





const DEFAULT_COLUMNS = "100";
const DEFAULT_ROWS = "27";

const parseDimension = (value: string) => {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
};

type CustomSlideSizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (size: SlideSize) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  mode?: "create" | "resize";
  initialSize?: SlideSize;
};

export function CustomSlideSizeDialog({
  open,
  onOpenChange,
  onConfirm,
  returnFocusRef,
  mode = "create",
  initialSize,
}: CustomSlideSizeDialogProps) {
  const { t } = useUiI18n();
  const [columns, setColumns] = useState(() =>
    String(initialSize?.columns ?? DEFAULT_COLUMNS)
  );
  const [rows, setRows] = useState(() =>
    String(initialSize?.rows ?? DEFAULT_ROWS)
  );
  const parsedColumns = parseDimension(columns);
  const parsedRows = parseDimension(rows);
  const columnsValid = parsedColumns !== null && isValidSlideDimension(parsedColumns);
  const rowsValid = parsedRows !== null && isValidSlideDimension(parsedRows);
  const isValid =
    columnsValid &&
    rowsValid &&
    isValidSlideSize({ columns: parsedColumns, rows: parsedRows });
  const hasInvalidValue = columns.length === 0 || rows.length === 0 || !isValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[360px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              mode === "resize"
                ? "session.slideCustom.resizeTitle"
                : "session.slideCustom.title"
            )}
          </DialogTitle>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsedColumns === null || parsedRows === null) return;
            onConfirm({ columns: parsedColumns, rows: parsedRows });
          }}
        >
          <DialogBody>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="custom-slide-columns">
                  {t("session.slideCustom.columns")}
                </Label>
                <Input
                  id="custom-slide-columns"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={columns}
                  aria-invalid={!columnsValid}
                  aria-describedby={hasInvalidValue ? "custom-slide-size-error" : undefined}
                  autoFocus
                  onChange={(event) => setColumns(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="custom-slide-rows">
                  {t("session.slideCustom.rows")}
                </Label>
                <Input
                  id="custom-slide-rows"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={rows}
                  aria-invalid={!rowsValid}
                  aria-describedby={hasInvalidValue ? "custom-slide-size-error" : undefined}
                  onChange={(event) => setRows(event.target.value)}
                />
              </div>
            </div>
            {hasInvalidValue ? (
              <StatusText tone="error" asChild>
                <p
                  id="custom-slide-size-error"
                  role="alert"
                  className="mt-2 text-[11px] leading-4"
                >
                  {t("session.slideCustom.invalid")}
                </p>
              </StatusText>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              tone="subtle"
              onClick={() => onOpenChange(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button type="submit" disabled={!isValid}>
              {t(
                mode === "resize"
                  ? "session.slideCustom.apply"
                  : "session.slideCustom.create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
