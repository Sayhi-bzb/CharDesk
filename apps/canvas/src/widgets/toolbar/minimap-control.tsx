import { lazy, Suspense, useId, useMemo, useState } from 'react';
import {
  FloatingSurface,
  IconButton,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
} from '@chardesk/ui';
import { useCanvasState } from '@/domains/canvas/public';
import { useUiI18n } from '@/shared/i18n';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { RecoverableLazyBoundary } from '@/shared/components/RecoverableLazyBoundary';
import { requireLoadedModule } from '@/shared/lib/moduleLoadRecovery';
import { useCanvasViewOptional } from '@/widgets/canvas-editor/engine/CanvasWorkspace';

const MinimapIcon = HOST_ICONOLOGY.viewportAction.minimap;
const Minimap = lazy(() =>
  import('@/widgets/canvas-editor/Minimap').then((loaded) => ({
    default: requireLoadedModule(loaded).Minimap,
  }))
);

export function MinimapControl({
  containerSize,
  joined,
  tooltipHandle,
}: {
  containerSize?: { width: number; height: number };
  joined?: 'end';
  tooltipHandle?: TooltipHandle<string>;
}) {
  const { t } = useUiI18n();
  const canvasMode = useCanvasState((state) => state.canvasMode);
  const view = useCanvasViewOptional();
  const viewportSize = view?.containerSize ?? containerSize;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ownTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const label = t('sidebar.minimap');

  if (canvasMode === 'slide') return null;

  const control = (
    <>
      {open && (
        <FloatingSurface
          id={panelId}
          role="region"
          aria-label={label}
          data-testid="zoom-minimap"
          variant="panel"
          className="absolute bottom-full left-0 z-(--layer-popover) mb-2 w-auto"
        >
          <RecoverableLazyBoundary resetKey={open} onError={() => setOpen(false)}>
            <Suspense fallback={<div className="h-[140px] w-[220px] bg-muted" />}>
              <Minimap containerSize={viewportSize} />
            </Suspense>
          </RecoverableLazyBoundary>
        </FloatingSurface>
      )}
      <TooltipTrigger
        handle={tooltipHandle ?? ownTooltipHandle}
        payload={label}
        render={
          <IconButton
            joined={joined}
            pressed={open}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={label}
            data-testid="zoom-minimap-toggle"
            disabled={!viewportSize || viewportSize.width <= 0 || viewportSize.height <= 0}
            onClick={() => setOpen((current) => !current)}
          >
            <MinimapIcon />
          </IconButton>
        }
      />
      {!tooltipHandle && (
        <Tooltip handle={ownTooltipHandle}>
          {({ payload }) => <TooltipPopup side="top">{payload}</TooltipPopup>}
        </Tooltip>
      )}
    </>
  );

  return joined ? control : (
    <FloatingSurface data-canvas-ui="true" data-testid="minimap-control" variant="control-bar">
      {control}
    </FloatingSurface>
  );
}
