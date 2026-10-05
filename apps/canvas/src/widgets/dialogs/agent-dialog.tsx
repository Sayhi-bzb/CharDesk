import { useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Label, StatusDot, StatusText } from '@chardesk/ui';
import { Switch } from '@chardesk/ui';
import { useUiI18n } from '@/shared/i18n';
import { forgetLocalAgent, getLocalAgentEnabled, getLocalAgentRevision,
  getRememberedLocalAgent, setLocalAgentEnabled, subscribeLocalAgent,
  type LocalAgentPermissions } from '@/shared/services/local-agent';
import { getWebMcpStatus, subscribeWebMcpStatus } from '@/shared/services/webmcp-status';

export function AgentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useUiI18n();
  useSyncExternalStore(subscribeLocalAgent, getLocalAgentRevision, getLocalAgentRevision);
  const webStatus = useSyncExternalStore(subscribeWebMcpStatus, getWebMcpStatus, getWebMcpStatus);
  const enabled = getLocalAgentEnabled();
  const [permissions, setPermissions] = useState<LocalAgentPermissions>(() => getRememberedLocalAgent()?.permissions ?? { inspect: true, read: true, search: true, write: true });
  const saved = getRememberedLocalAgent();
  const active = enabled;
  const webTone = webStatus === 'ready' ? 'success' : webStatus === 'error' ? 'error' : 'neutral';
  const toggle = () => {
    if (active) {
      setLocalAgentEnabled(false);
      return;
    }
    try {
      setLocalAgentEnabled(true, saved?.permissions ?? permissions);
    } catch { /* The switch remains off when no local agent is available. */ }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t('appMenu.agent')}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div role="group" aria-label="WebMCP" className="flex min-h-8 items-center justify-between gap-2">
            <span className="text-sm">WebMCP</span>
            <StatusText role="status" aria-live="polite" className="flex items-center gap-2 text-xs"
              tone={webTone}>
              <StatusDot tone={webTone} />
              {t(`agent.webmcp.${webStatus}`)}
            </StatusText>
          </div>
          <div role="group" aria-label="Local MCP" className="flex min-h-8 items-center gap-2">
            <span className="mr-auto text-sm">Local MCP</span>
            <Switch checked={active} onCheckedChange={toggle} aria-label={t('localAgent.toggle')} />
          </div>
          {!active && <div id="local-agent-settings" className="flex flex-col gap-3">
            <DialogDescription>{t('localAgent.permission')}</DialogDescription>
            <div className="flex flex-col gap-2" role="group" aria-label="Local MCP permissions">
              <p className="text-xs text-muted-foreground">{t('localAgent.scope')}</p>
              {([['inspect', 'localAgent.inspect'], ['read', 'localAgent.read'], ['search', 'localAgent.search'], ['write', 'localAgent.write']] as const).map(([permission, label]) => (
                <Label key={permission} className="flex items-center gap-2">
                  <Checkbox checked={permissions[permission]} onCheckedChange={(checked) => setPermissions((current) => ({ ...current, [permission]: checked === true }))} />
                  {t(label)}
                </Label>
              ))}
            </div>
          </div>}
        </DialogBody>
        {saved && <DialogFooter>
          {saved && <Button tone="subtle" onClick={forgetLocalAgent}>{t('localAgent.forget')}</Button>}
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
