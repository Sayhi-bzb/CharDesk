'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useCanvasRuntime, useCanvasState } from '@/domains/canvas/public';
import { isSourceBackedCanvasSession } from '@/domains/sessions/public';
import {
  buildCollaborationUrl,
  useCollaborationRuntime,
  createCollaborationDescriptor,
  getManagedCollaborationEndpoint,
  parseCollaborationUrl,
} from '@/domains/collaboration/public';
import { useCollaborationSnapshot } from './useCollaborationSnapshot';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { useInPlaceFeedback } from '@/shared/hooks/use-in-place-feedback';
import { useUiI18n, type I18nKey } from '@/shared/i18n';
import { clipboard } from '@/shared/services/effects';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  StatusText,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
  type StatusTone,
} from '@chardesk/ui';

const CollaborationIcon = HOST_ICONOLOGY.sessionAction.collaboration;
const CopyIcon = HOST_ICONOLOGY.editorAction.copy;
const readIncomingCollaboration = (): ReturnType<typeof parseCollaborationUrl> =>
  typeof window === 'undefined' ? { status: 'none' } : parseCollaborationUrl();
const getIncomingCollaborationErrorKey = (
  incoming: ReturnType<typeof parseCollaborationUrl>
): I18nKey | null => {
  if (incoming.status === 'unsupported') return 'collaboration.link.unsupported';
  if (incoming.status === 'retired') return 'collaboration.link.retired';
  if (incoming.status === 'invalid') return 'collaboration.link.invalid';
  return null;
};
const getStatusPresentation = (
  snapshot: ReturnType<typeof useCollaborationSnapshot>
): { key: I18nKey; tone: StatusTone } => {
  if (snapshot.documentStatus === 'restoring') {
    return { key: 'collaboration.status.loading-local', tone: 'neutral' };
  }
  if (snapshot.documentStatus === 'joining') {
    return { key: 'collaboration.status.joining', tone: 'neutral' };
  }
  if (snapshot.documentStatus === 'incompatible' || snapshot.documentStatus === 'error') {
    return { key: 'collaboration.status.error', tone: 'error' };
  }
  switch (snapshot.connectionStatus) {
    case 'connecting':
      return { key: 'collaboration.status.connecting', tone: 'neutral' };
    case 'online':
      return { key: 'collaboration.status.connected', tone: 'success' };
    case 'offline':
      return { key: 'collaboration.status.offline', tone: 'error' };
    default:
      return { key: 'collaboration.status.idle', tone: 'neutral' };
  }
};

export function CollaborationControl() {
  const canvas = useCanvasRuntime();
  const collaborationRuntime = useCollaborationRuntime();
  const { t } = useUiI18n();
  const [open, setOpen] = useState(false);
  const {
    feedback: copyFeedback,
    run: runCopyFeedback,
    clear: clearCopyFeedback,
  } = useInPlaceFeedback<'link'>();
  const snapshot = useCollaborationSnapshot();
  const activeSession = useCanvasState((state) =>
    state.canvasSessions.find((session) => session.id === state.activeCanvasId)
  );
  const setCollaboration = canvas.commands.sessions.setCollaboration;
  const descriptor = activeSession?.collaboration;
  const visibleControlErrorKey = descriptor
    ? null
    : getIncomingCollaborationErrorKey(readIncomingCollaboration());

  useEffect(() => {
    if (!open) return;
    const closeOnWindowBlur = () => setOpen(false);
    window.addEventListener('blur', closeOnWindowBlur);
    return () => window.removeEventListener('blur', closeOnWindowBlur);
  }, [open]);

  const statusPresentation = getStatusPresentation(snapshot);
  const statusLabel = t(statusPresentation.key);

  const start = () => {
    if (!activeSession || activeSession.mode === "slide" ||
        isSourceBackedCanvasSession(activeSession)) return;
    const next = createCollaborationDescriptor(activeSession.mode);
    setCollaboration(activeSession.id, next);
  };

  const copyLink = async () => {
    if (!descriptor) return;
    await runCopyFeedback('link', () =>
      clipboard.writeText(buildCollaborationUrl(descriptor))
    );
  };

  const leave = () => {
    if (!activeSession) return;
    setCollaboration(activeSession.id, null);
  };

  const forget = async () => {
    if (!descriptor) return;
    await collaborationRuntime.forget(descriptor);
    leave();
  };

  const managedEndpoint = getManagedCollaborationEndpoint();
  const copyLinkLabelKey =
    copyFeedback?.status === 'success'
      ? 'collaboration.link.copied'
      : copyFeedback?.status === 'error'
        ? 'collaboration.link.copyFailed'
        : 'collaboration.link.copy';
  const CopyFeedbackIcon =
    copyFeedback?.status === 'success'
      ? Check
      : copyFeedback?.status === 'error'
        ? X
        : CopyIcon;
  if (activeSession?.mode === "slide" || isSourceBackedCanvasSession(activeSession)) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) clearCopyFeedback();
      }}
    >
      <Tooltip>
        <PopoverTrigger asChild>
          <TooltipTrigger
            render={
              <Button
                tone="subtle"
                shape="square"
                size="md"
                open={open}
                status={
                  visibleControlErrorKey
                    ? 'error'
                    : descriptor
                      ? statusPresentation.tone
                      : undefined
                }
                data-error={visibleControlErrorKey ? "true" : undefined}
                className="pointer-events-auto"
                aria-label={t('collaboration.title')}
                data-testid="collaboration-control"
              />
            }
          >
            <CollaborationIcon />
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipPopup side="bottom">{t('collaboration.title')}</TooltipPopup>
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-72 max-w-[calc(100vw-1.5rem)]"
        role="dialog"
        aria-label={t('collaboration.title')}
      >
        <section
          className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs"
          aria-live="polite"
        >
          <span className="font-semibold">
            {descriptor ? t('collaboration.server') : t('collaboration.title')}
          </span>
          <StatusText tone={statusPresentation.tone}>
            {statusLabel}
          </StatusText>
        </section>

        {descriptor && (
          <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
            {t('collaboration.participants', {
              count: snapshot.peers.length + 1,
            })}
          </div>
        )}

        {visibleControlErrorKey ? (
          <StatusText tone="error" asChild>
            <div className="px-2 pb-1.5 text-[11px]" role="alert">
              {t(visibleControlErrorKey)}
            </div>
          </StatusText>
        ) : null}

        {snapshot.error && (
          <StatusText tone="error" asChild>
            <div className="px-2 pb-1.5 text-[11px]" role="alert">
              {snapshot.error === 'Incompatible collaboration document'
                ? t('collaboration.document.incompatible')
                : snapshot.error}
            </div>
          </StatusText>
        )}

        {snapshot.integrityIssues.length > 0 && (
          <StatusText tone="warning" asChild>
            <div className="px-2 pb-1.5 text-[11px]" role="status">
              {snapshot.integrityIssues[0].reason}
            </div>
          </StatusText>
        )}

        {descriptor && snapshot.peers.length > 0 && (
          <ul className="flex flex-col gap-1 px-2 pb-1.5" aria-label={t('collaboration.peers')}>
            {snapshot.peers.map((peer) => (
              <li key={peer.clientId} className="flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: peer.color }} />
                <span className="truncate">{peer.name}</span>
              </li>
            ))}
          </ul>
        )}

        <Separator className="my-1" />

        {!descriptor ? (
          <div className="flex flex-col gap-1.5 px-2 py-1.5">
            <Button
              type="button"
              tone="neutral"
              size="sm"
              className="w-full justify-center"
              disabled={!managedEndpoint}
              onClick={start}
            >
              {t('collaboration.start')}
            </Button>
            {!managedEndpoint ? (
              <StatusText tone="warning" asChild>
                <p className="text-[11px] leading-4" role="status">
                  {t('collaboration.service.unavailable')}
                </p>
              </StatusText>
            ) : null}
          </div>
        ) : (
          <>
            {snapshot.connectionStatus === 'offline' && (
              <Button
                type="button"
                tone="subtle"
                size="sm"
                className="w-full justify-start"
                onClick={() => void collaborationRuntime.retry()}
              >
                {t('collaboration.retry')}
              </Button>
            )}
            <Button
              type="button"
              tone="subtle"
              size="sm"
              feedback={copyFeedback?.status}
              data-copy-feedback={copyFeedback?.status}
              className="w-full justify-start gap-2"
              onClick={() => void copyLink()}
            >
              <CopyFeedbackIcon />
              {t(copyLinkLabelKey)}
            </Button>
            <span role="status" className="sr-only">
              {copyFeedback ? t(copyLinkLabelKey) : ''}
            </span>
            <Button
              type="button"
              tone="subtle"
              size="sm"
              className="w-full justify-start"
              onClick={leave}
            >
              {t('collaboration.leave')}
            </Button>
            <Button
              type="button"
              tone="subtle"
              destructive
              size="sm"
              className="w-full justify-start"
              onClick={() => void forget()}
            >
              {t('collaboration.forget')}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
