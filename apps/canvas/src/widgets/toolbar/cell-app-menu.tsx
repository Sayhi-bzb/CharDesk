import { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Root,
  Separator,
  Text,
  type WidgetCommand,
} from '@chardesk/cell-ui';
import { CellOverlayHost, CellPopover } from '@chardesk/cell-ui/browser';
import { HostCellSurface } from '@/shared/cell-ui/HostCellSurface';
import { HOST_CELL_GLYPHS } from '@/shared/icons/iconology';

const triggerId = 'app-menu-trigger';
const mainWidth = 24;
const helpWidth = 18;
const anchorFor = (id: string) => document.querySelector(`[data-cell-semantic-id="${id}"]`);

type MenuAction = 'split' | 'zen' | 'clear' | 'settings' | 'guide' | 'documentation' | 'github';

export function CellAppMenu({
  open,
  onOpenChange,
  labels,
  splitAvailable,
  guideAvailable,
  onAction,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: Readonly<Record<MenuAction | 'open' | 'help', string>>;
  splitAvailable: boolean;
  guideAvailable: boolean;
  onAction: (action: MenuAction) => void;
}>) {
  const [helpOpen, setHelpOpen] = useState(false);
  const changeOpen = (nextOpen: boolean) => {
    setHelpOpen(false);
    onOpenChange(nextOpen);
  };
  const activate = (command: WidgetCommand) => {
    if (command.type !== 'activate') return;
    if (command.targetId === triggerId) {
      changeOpen(!open);
      return;
    }
    if (command.targetId === 'app-menu-help') {
      setHelpOpen(true);
      return;
    }
    const action = command.targetId.replace(/^app-menu-/, '') as MenuAction;
    if (
      ['split', 'zen', 'clear', 'settings', 'guide', 'documentation', 'github'].includes(action)
    ) {
      changeOpen(false);
      onAction(action);
    }
  };
  const row = (action: MenuAction, disabled = false) => (
    <MenuItem
      key={action}
      id={`app-menu-${action}`}
      label={labels[action]}
      disabled={disabled}
      style={{ width: action === 'guide' || action === 'documentation' ? helpWidth : mainWidth }}
    >
      <Text>{labels[action]}</Text>
    </MenuItem>
  );
  return (
    <CellOverlayHost>
      <div
        data-canvas-ui="true"
        data-testid="app-menu-host"
        className="canvas-cell-app-menu-surface relative pointer-events-auto"
      >
        <HostCellSurface
          label={labels.open}
          viewport={{ width: 3, height: 1 }}
          onCommand={activate}
        >
          <Root>
            <Button
              id={triggerId}
              label={labels.open}
              variant="ghost"
              popup="menu"
              expanded={open}
              style={{ width: 3 }}
            >
              <Text>{HOST_CELL_GLYPHS.appMenuTrigger}</Text>
            </Button>
          </Root>
        </HostCellSurface>
      </div>
      <CellPopover
        open={open}
        anchor={anchorFor(triggerId)}
        onDismiss={() => changeOpen(false)}
        onKeyDown={(event) => {
          if (
            event.key === 'ArrowRight' &&
            document.activeElement?.getAttribute('data-cell-semantic-id') === 'app-menu-help'
          ) {
            event.preventDefault();
            setHelpOpen(true);
          }
        }}
      >
        <HostCellSurface
          label={labels.open}
          viewport={{ width: mainWidth, height: splitAvailable ? 7 : 6 }}
          focusedId={splitAvailable ? 'app-menu-split' : 'app-menu-zen'}
          onCommand={activate}
          onHoverChange={(id) => {
            if (id === 'app-menu-help') setHelpOpen(true);
            else if (id?.startsWith('app-menu-')) setHelpOpen(false);
          }}
        >
          <Root>
            <Box variant="surface" style={{ width: mainWidth }}>
              <Menu id="app-menu-main" label={labels.open}>
                {splitAvailable ? row('split') : null}
                {row('zen')}
                {row('clear')}
                <Separator id="app-menu-separator" style={{ width: mainWidth }} />
                {row('settings')}
                <MenuItem id="app-menu-help" label={labels.help} style={{ width: mainWidth }}>
                  <Text>{`${labels.help} ▸`}</Text>
                </MenuItem>
                {row('github')}
              </Menu>
            </Box>
          </Root>
        </HostCellSurface>
      </CellPopover>
      <CellPopover
        open={open && helpOpen}
        anchor={anchorFor('app-menu-help')}
        placement="right-item"
        onDismiss={() => setHelpOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setHelpOpen(false);
          }
        }}
      >
        <HostCellSurface
          label={labels.help}
          viewport={{ width: helpWidth, height: 2 }}
          focusedId="app-menu-guide"
          onCommand={activate}
        >
          <Root>
            <Box variant="surface" style={{ width: helpWidth }}>
              <Menu id="app-menu-help-list" label={labels.help}>
                {row('guide', !guideAvailable)}
                {row('documentation')}
              </Menu>
            </Box>
          </Root>
        </HostCellSurface>
      </CellPopover>
    </CellOverlayHost>
  );
}
