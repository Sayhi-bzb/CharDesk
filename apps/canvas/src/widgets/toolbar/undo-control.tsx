import { useMemo } from 'react';
import {
  IconButton,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from '@chardesk/ui';
import { useEditor, useEditorValue } from '@/domains/editor/public';
import { useUiI18n } from '@/shared/i18n';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';

const UndoIcon = HOST_ICONOLOGY.toolbarAction.undo;

export function UndoControl({ enabled, onUndo }: { enabled: boolean; onUndo: () => void }) {
  const editor = useEditor();
  const canUndo = useEditorValue(() => editor.history.canUndo?.() ?? false);
  const { t } = useUiI18n();
  const label = t('toolbar.undo');
  const tooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);

  return (
    <div data-canvas-ui="true" data-testid="undo-control-host" className="pointer-events-auto">
      <TooltipTrigger
        handle={tooltipHandle}
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
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => <TooltipPopup side="top">{payload}</TooltipPopup>}
      </Tooltip>
    </div>
  );
}
