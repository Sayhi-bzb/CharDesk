import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, IconButton, Input, Label, StatusDot,
  StatusText, Tooltip, TooltipCreateHandle, TooltipPopup, TooltipTrigger } from '@chardesk/ui';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { clipboard } from '@/shared/services/effects';
import { useUiI18n } from '@/shared/i18n';
import { connectLocalAgent, disconnectLocalAgent, forgetLocalAgent, getLocalAgentRevision,
  getLocalAgentStatus, getRememberedLocalAgent, subscribeLocalAgent,
  type LocalAgentPermissions } from '@/shared/services/local-agent';
import { getWebMcpStatus, subscribeWebMcpStatus } from '@/shared/services/webmcp-status';

const CopyIcon = HOST_ICONOLOGY.appMenu.copy;

export function AgentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useUiI18n();
  useSyncExternalStore(subscribeLocalAgent, getLocalAgentRevision, getLocalAgentRevision);
  const webStatus = useSyncExternalStore(subscribeWebMcpStatus, getWebMcpStatus, getWebMcpStatus);
  const status = getLocalAgentStatus();
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [remember, setRemember] = useState(false);
  const [permissions, setPermissions] = useState<LocalAgentPermissions>({ inspect: true, read: true, search: true, write: true });
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const tooltip = useMemo(() => TooltipCreateHandle<string>(), []);
  const copyLabel = t(copyStatus === 'success' ? 'localAgent.copied' : copyStatus === 'error' ? 'localAgent.copyError' : 'localAgent.copy');
  const saved = getRememberedLocalAgent();
  const active = status === 'connected' || status === 'connecting';
  const pairing = expanded && !active;
  const webTone = webStatus === 'ready' ? 'success' : webStatus === 'error' ? 'error' : 'neutral';
  const localTone = status === 'connected' ? 'success' : status === 'error' ? 'error' : 'neutral';
  const connect = () => {
    try {
      connectLocalAgent(value || saved?.url || '', remember || (!value && !!saved), permissions);
      setInvalid(false);
      setValue('');
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t('localAgent.setup')}</p>
                <code className="text-xs">npm run mcp:pair</code>
              </div>
              <TooltipTrigger handle={tooltip} payload={copyLabel} render={
                <IconButton aria-label={copyLabel} feedback={copyStatus === 'idle' ? undefined : copyStatus}
                  onClick={async () => setCopyStatus(await clipboard.writeText('npm run mcp:pair') ? 'success' : 'error')}>
                  <CopyIcon />
                </IconButton>
              } />
              <Tooltip handle={tooltip}>{({ payload }) => <TooltipPopup>{payload}</TooltipPopup>}</Tooltip>
            </div>
            <span className="sr-only" aria-live="polite">{copyStatus !== 'idle' && copyLabel}</span>
            <Label htmlFor="local-agent-pairing">{t('localAgent.pairing')}</Label>
            <Input id="local-agent-pairing" type="password" value={value}
              autoComplete="off" spellCheck={false} placeholder={saved ? t('localAgent.saved') : undefined}
              aria-invalid={invalid} aria-describedby={invalid || status === 'error' ? 'local-agent-error' : 'local-agent-status'}
              onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
              onKeyDown={(event) => { if (event.key === 'Enter' && (value || saved)) connect(); }} />
            <Label className="flex items-center gap-2">
              <Checkbox checked={remember || (!value && !!saved)} disabled={!value && !!saved}
                onCheckedChange={(checked) => setRemember(checked === true)} />
              {t('localAgent.remember')}
            </Label>
            {(invalid || status === 'error') && <StatusText id="local-agent-error" role="alert" tone="error" className="text-xs">
              {t(invalid ? 'localAgent.invalid' : 'localAgent.error')}
            </StatusText>}
          </div>}
          {saved && status === 'connected' && <p className="text-xs text-muted-foreground">{t('localAgent.remembered')}</p>}
        </DialogBody>
        {(saved || pairing) && <DialogFooter>
          {saved && <Button tone="subtle" onClick={forgetLocalAgent}>{t('localAgent.forget')}</Button>}
          {pairing && <Button disabled={!value.trim() && !saved} onClick={connect}>{t('localAgent.connect')}</Button>}
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
