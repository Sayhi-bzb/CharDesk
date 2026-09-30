import { useMemo, type ReactNode } from 'react';
import {
  IconButton,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
} from '@chardesk/ui';
import { useEditor, useEditorValue } from '@/domains/editor/public';
import { useUiI18n } from '@/shared/i18n';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';

const UndoIcon = HOST_ICONOLOGY.toolbarAction.undo;

export function UndoControl({ enabled, onUndo, tooltipHandle }: {
  enabled: boolean;
  onUndo: () => void;
  tooltipHandle?: TooltipHandle<ReactNode>;
}) {
  const editor = useEditor();
  const canUndo = useEditorValue(() => editor.history.canUndo?.() ?? false);
  const { t } = useUiI18n();
  const label = t('toolbar.undo');
  const ownTooltipHandle = useMemo(() => TooltipCreateHandle<ReactNode>(), []);

  return (
    <div data-canvas-ui="true" data-testid="undo-control-host" className="pointer-events-auto">
      <TooltipTrigger
        handle={tooltipHandle ?? ownTooltipHandle}
        payload={label}
        render={
          <IconButton
            aria-label={label}
            data-testid="canvas-undo"
            disabled={!enabled || !canUndo}
            onClick={onUndo}
          >
            <UndoIcon />
          </IconButton>
        }
      />
      {!tooltipHandle && <Tooltip handle={ownTooltipHandle}>
        {({ payload }) => <TooltipPopup side="top">{payload}</TooltipPopup>}
      </Tooltip>}
    </div>
  );
}
