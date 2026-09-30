import { useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Label, StatusDot, StatusText } from '@chardesk/ui';
import { useUiI18n } from '@/shared/i18n';
import { connectLocalAgent, disconnectLocalAgent, forgetLocalAgent, getLocalAgentRevision,
  getLocalAgentStatus, getRememberedLocalAgent, subscribeLocalAgent,
  type LocalAgentPermissions } from '@/shared/services/local-agent';
import { getWebMcpStatus, subscribeWebMcpStatus } from '@/shared/services/webmcp-status';

export function AgentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useUiI18n();
  useSyncExternalStore(subscribeLocalAgent, getLocalAgentRevision, getLocalAgentRevision);
  const webStatus = useSyncExternalStore(subscribeWebMcpStatus, getWebMcpStatus, getWebMcpStatus);
  const status = getLocalAgentStatus();
  const [expanded, setExpanded] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [permissions, setPermissions] = useState<LocalAgentPermissions>(() => getRememberedLocalAgent()?.permissions ?? { inspect: true, read: true, search: true, write: true });
  const saved = getRememberedLocalAgent();
  const active = status === 'connected' || status === 'connecting';
  const pairing = expanded && !active;
  const webTone = webStatus === 'ready' ? 'success' : webStatus === 'error' ? 'error' : 'neutral';
  const localTone = status === 'connected' ? 'success' : status === 'error' ? 'error' : 'neutral';
  const connect = () => {
    try {
      connectLocalAgent(saved?.url || '', true, saved?.permissions ?? permissions, saved?.scope);
      setInvalid(false);
    } catch { setInvalid(true); }
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
            <StatusText id="local-agent-status" role="status" aria-live="polite"
              className={status === 'idle' ? 'sr-only' : 'flex items-center gap-2 text-xs'}
              tone={localTone}>
              {status !== 'idle' && <StatusDot tone={localTone} />}
              {t(status === 'error' ? 'localAgent.offline' : `localAgent.${status}`)}
            </StatusText>
            {active
              ? <Button size="sm" tone="subtle" onClick={disconnectLocalAgent}>{t('localAgent.disconnect')}</Button>
              : <Button size="sm" tone="subtle" aria-expanded={pairing} aria-controls="local-agent-pairing-form"
                onClick={() => setExpanded(!expanded)}>{t('agent.pair')}</Button>}
          </div>
          {pairing && <div id="local-agent-pairing-form" className="flex flex-col gap-3">
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
            <p className="text-xs text-muted-foreground">{t('localAgent.autoDetect')}</p>
            {(invalid || status === 'error') && <StatusText id="local-agent-error" role="alert" tone="error" className="text-xs">
              {t(invalid ? 'localAgent.invalid' : 'localAgent.error')}
            </StatusText>}
          </div>}
          {saved && status === 'connected' && <p className="text-xs text-muted-foreground">{t('localAgent.remembered')}</p>}
        </DialogBody>
        {(saved || pairing) && <DialogFooter>
          {saved && <Button tone="subtle" onClick={forgetLocalAgent}>{t('localAgent.forget')}</Button>}
          {pairing && <Button onClick={connect}>{t('localAgent.connect')}</Button>}
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
