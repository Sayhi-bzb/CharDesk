// Isolated Host UI fixture: no Canvas document, transport, or agent execution.
import '@vitejs/plugin-react-swc/preamble';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, UiProvider } from '@chardesk/ui';
import { AgentDialog } from '../../apps/canvas/src/widgets/dialogs/agent-dialog';
import { updateWebMcpDiagnostics } from '../../apps/canvas/src/app/site-tools/environment';
import { setUiLanguage } from '../../apps/canvas/src/shared/i18n';
import '../../apps/canvas/src/app/index.css';

const query = new URLSearchParams(location.search);
setUiLanguage(query.get('language') === 'zh' ? 'zh' : 'en');
updateWebMcpDiagnostics(document, query.get('ready') ? 'native' : 'unavailable', {
  status: query.get('ready') ? 'ready' : 'waiting', adapterId: null,
});

const root = createRoot(document.getElementById('root')!);
let open = true;
function setOpen(next: boolean) { open = next; renderFixture(); }
function renderFixture() {
  root.render(createElement(UiProvider, null,
    createElement(Button, { onClick: () => setOpen(true) }, 'Open Agent'),
    createElement(AgentDialog, { open, onOpenChange: setOpen }),
  ));
}
renderFixture();
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
