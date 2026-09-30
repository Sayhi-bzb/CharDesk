import { useState, useSyncExternalStore } from 'react';
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, StatusText, Checkbox } from '@chardesk/ui';
import { useUiI18n } from '@/shared/i18n';
import { connectLocalAgent, disconnectLocalAgent, getLocalAgentStatus,
  subscribeLocalAgent, getRememberedLocalAgent, forgetLocalAgent, getLocalAgentRevision } from '@/shared/services/local-agent';

export function LocalAgentDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useUiI18n();
  useSyncExternalStore(subscribeLocalAgent, getLocalAgentRevision, getLocalAgentRevision);
  const status = getLocalAgentStatus();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [remember, setRemember] = useState(false);
  const saved = getRememberedLocalAgent();
  const active = status === 'connected' || status === 'connecting';
  const connect = () => {
    try { connectLocalAgent(value || saved?.url || '', remember || (!value && !!saved)); setInvalid(false); setValue(''); }
    catch { setInvalid(true); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('localAgent.title')}</DialogTitle>
          <DialogDescription>{t('localAgent.permission')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('localAgent.setup')}</p>
          <code className="text-xs">npm run mcp:pair</code>
          <Label htmlFor="local-agent-pairing">{t('localAgent.pairing')}</Label>
          <Input id="local-agent-pairing" type="password" value={value}
            autoComplete="off" spellCheck={false} disabled={active}
            aria-invalid={invalid} aria-describedby="local-agent-status"
            onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && value) connect(); }} />
          <Label className="flex items-center gap-2">
            <Checkbox checked={remember} disabled={active} onCheckedChange={(checked) => setRemember(checked === true)} />
            {t('localAgent.remember')}
          </Label>
          {saved && <p className="text-xs text-muted-foreground">{t('localAgent.remembered')}</p>}
          <StatusText id="local-agent-status" role="status" aria-live="polite"
            tone={invalid || status === 'error' ? 'error' : status === 'connected' ? 'success' : 'neutral'}>
            {t(invalid ? 'localAgent.invalid' : `localAgent.${status}`)}
          </StatusText>
        </DialogBody>
        <DialogFooter>
          {saved && <Button tone="subtle" onClick={forgetLocalAgent}>{t('localAgent.forget')}</Button>}
          {active ? <Button onClick={disconnectLocalAgent}>{t('localAgent.disconnect')}</Button>
            : <Button disabled={!value.trim() && !saved} onClick={connect}>{t('localAgent.connect')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
