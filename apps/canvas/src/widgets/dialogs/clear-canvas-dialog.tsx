"use client";

import { Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
  type TooltipPopupProps,
} from "@chardesk/ui";


import { useUiI18n } from "@/shared/i18n";

type ClearCanvasDialogProps = {
  isCollapsed: boolean;
  iconOnly?: boolean;
  label?: string;
  description?: string;
  tooltipSide?: TooltipPopupProps["side"];
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement | null;
};

export function ClearCanvasDialog({
  isCollapsed,
  iconOnly = false,
  label = "Clear Canvas",
  description = "This will completely clear the current blueprint.",
  tooltipSide = "left",
  onConfirm,
  open,
  onOpenChange,
  trigger,
}: ClearCanvasDialogProps) {
  const { t } = useUiI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger === null ? null : trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : isCollapsed || iconOnly ? (
        <Tooltip>
          <AlertDialogTrigger asChild>
            <TooltipTrigger
              render={
                <Button
                  tone="subtle"
                  destructive
                  shape="square"
                  size="md"
                />
              }
            >
              <Trash2 />
            </TooltipTrigger>
          </AlertDialogTrigger>
          <TooltipPopup side={tooltipSide}>{label}</TooltipPopup>
        </Tooltip>
      ) : (
        <AlertDialogTrigger asChild>
          <Button
            tone="subtle"
            destructive
            shape="auto"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <Trash2 />
            <span className="font-medium text-xs">{label}</span>
          </Button>
        </AlertDialogTrigger>
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("clear.title")}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            tone="danger"
          >
            {t("dialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
