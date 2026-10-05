"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, Input } from "@chardesk/ui";
import { useCanvasRuntime, type CanvasSearchResult } from "@/domains/canvas/public";
import { useCanvasViewOptional } from "@/widgets/canvas-editor/engine/CanvasWorkspace";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { useUiI18n } from "@/shared/i18n";

type CanvasSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const centerResult = (
  view: ReturnType<typeof useCanvasViewOptional>,
  result: NonNullable<CanvasSearchResult["matches"]>[number],
) => {
  if (!view?.containerSize) return;
  const centerX = (result.bounds[0] + result.bounds[2] / 2) * DEFAULT_CANVAS_CELL_METRICS.cellWidth;
  const centerY = (result.bounds[1] + result.bounds[3] / 2) * DEFAULT_CANVAS_CELL_METRICS.cellHeight;
  view.setOffset(() => ({
    x: view.containerSize!.width / 2 - centerX * view.viewport.zoom,
    y: view.containerSize!.height / 2 - centerY * view.viewport.zoom,
  }));
};

export function CanvasSearchDialog({ open, onOpenChange }: CanvasSearchDialogProps) {
  const { t } = useUiI18n();
  const canvas = useCanvasRuntime();
  const view = useCanvasViewOptional();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CanvasSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResult(null);
    setFailed(false);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !trimmed) {
      setResult(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setFailed(false);
    void canvas.search(canvas.getState().activeCanvasId, trimmed)
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setSearching(false);
        setFailed(next === null);
      })
      .catch(() => {
        if (cancelled) return;
        setResult(null);
        setSearching(false);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [canvas, open, query]);

  const countLabel = useMemo(() => {
    if (searching) return t("canvasSearch.searching");
    if (failed) return t("canvasSearch.failed");
    if (!query.trim()) return null;
    if (!result?.matches.length) return t("canvasSearch.empty");
    return t("canvasSearch.matches").replace("{count}", String(result.matches.length));
  }, [failed, query, result, searching, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
        <DialogHeader className="pb-1">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t("canvasSearch.title")}</DialogTitle>
            {countLabel && <span className="text-xs text-muted-foreground">{countLabel}</span>}
          </div>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col gap-3">
          <Input
            autoFocus
            appearance="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("canvasSearch.placeholder")}
            aria-label={t("canvasSearch.placeholder")}
          />
          {result && result.matches.length > 0 && (
            <div className="max-h-72 min-h-0 overflow-y-auto border border-border" role="list">
              {result.matches.map((match) => (
                <Button
                  key={`${match.origin[0]}:${match.origin[1]}:${match.bounds.join(":")}`}
                  type="button"
                  tone="subtle"
                  size="sm"
                  role="listitem"
                  className="flex w-full items-start gap-3 border-b border-border text-left last:border-b-0"
                  onClick={() => {
                    centerResult(view, match);
                    onOpenChange(false);
                  }}
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {match.origin[0]},{match.origin[1]}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words font-mono text-sm">
                    {match.content}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
