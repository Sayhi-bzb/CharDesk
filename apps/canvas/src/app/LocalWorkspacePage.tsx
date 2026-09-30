import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { ChevronLeft, Files, MoreHorizontal, PanelLeft, Plus } from 'lucide-react';
import { useBlackboardRuntime, parseBlackboardSource, serializeBlackboardSource, type BlackboardWorkspace } from '@/domains/blackboard/public';
import { useCanvasRuntime, useCanvasState } from '@/domains/canvas/public';
import { bindCloudSession, blackboardSyncKey, cloudSignInUrl, cloudGoogleSignInUrl,
  cloudWorkspaceApi, getBoundCloudWorkId,
  getCloudConflict, getCloudSyncState, resolveCloudConflict,
  subscribeCloudSync, unbindCloudWork, type CloudAuthProvider, type CloudWork } from '@/domains/account/public';
import { prepareTextExport } from '@/domains/export/public';
import { isSourceBackedCanvasSession } from '@/domains/sessions/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { GoogleMarkIcon } from '@/shared/icons/google-mark-icon';
import { useUiI18n } from '@/shared/i18n';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button,
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Empty, EmptyTitle, InlineRenameInput, Input, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, SelectableItem, Sheet, SheetContent,
  SheetDescription, SheetHeader, SheetTitle,
} from '@chardesk/ui';
import { APP_ROUTE_EVENT, navigateApp } from '@/shared/navigation/workspace-route';
import { collectLocalWorks, type WorkItem, type WorkKind } from './local-workspace-items';
import { useCloudWorkspace } from './useCloudWorkspace';

type WorkspaceRow =
  | { source: 'local'; key: string; work: WorkItem; name: string; kind: WorkKind }
  | { source: 'cloud'; key: string; work: CloudWork; name: string; kind: WorkKind };

const icons = {
  canvas: HOST_ICONOLOGY.canvasMode.freeform,
  slides: HOST_ICONOLOGY.canvasMode.slide,
  blackboard: HOST_ICONOLOGY.sourceKind.blackboard,
};

const mib = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const syncKey = (work: WorkItem) => work.kind === 'blackboard' ? blackboardSyncKey(work.id) : work.sessionId;

const accountRoute = () => window.location.search;
const providerName = (provider: CloudAuthProvider) => provider === 'github' ? 'GitHub' : 'Google';
const GitHubMark = HOST_ICONOLOGY.appMenu.github;
const ProviderMark = ({ provider }: { provider: CloudAuthProvider }) => (
  <span className={`flex size-5 shrink-0 items-center justify-center rounded-sm ${provider === 'google' ? 'bg-white' : ''}`}>
    {provider === 'github' ? <GitHubMark className="size-4" /> : <GoogleMarkIcon />}
  </span>
);

const subscribeRoute = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  window.addEventListener(APP_ROUTE_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(APP_ROUTE_EVENT, listener);
  };
};

function WorkspaceNavigation({ onSelect }: { onSelect: () => void }) {
  const { t } = useUiI18n();
  return (
    <nav aria-label={t('workspace.navigation')} className="flex flex-col gap-1 p-2">
      <SelectableItem type="button" selected aria-current="page"
        className="w-full justify-start gap-2" onClick={onSelect}>
        <Files aria-hidden="true" className="size-4" />{t('workspace.works')}
      </SelectableItem>
    </nav>
  );
}

function WorkspaceAccountFooter({ label, open, onSelect, buttonRef }: {
  label: string;
  open: boolean;
  onSelect: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const AccountIcon = HOST_ICONOLOGY.appMenu.account;
  return (
    <footer className="mt-auto border-t border-separator p-2">
      <Button ref={buttonRef} type="button" tone="subtle" open={open} aria-haspopup="dialog"
        className="w-full min-w-0 justify-start" onClick={onSelect}>
        <AccountIcon aria-hidden="true" />
        <span className="truncate">{label}</span>
      </Button>
    </footer>
  );
}

export function LocalWorkspacePage() {
  const { t } = useUiI18n();
  const canvas = useCanvasRuntime();
  const blackboard = useBlackboardRuntime();
  const cloud = useCloudWorkspace();
  const accountQuery = useSyncExternalStore(subscribeRoute, accountRoute, () => '');
  const accountParams = new URLSearchParams(accountQuery);
  const accountOpen = accountParams.get('view') === 'account';
  const authStatus = accountParams.get('auth');
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const desktopAccountRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLButtonElement>(null);
  const sessions = useCanvasState((state) => state.canvasSessions);
  const [blackboards, setBlackboards] = useState<readonly BlackboardWorkspace[]>([]);
  const [loadingBlackboards, setLoadingBlackboards] = useState(true);
  const [query, setQuery] = useState('');
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceRow | null>(null);
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);
  const [conflictCloudWorkId, setConflictCloudWorkId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [, refreshSync] = useState(0);
  useEffect(() => subscribeCloudSync(() => refreshSync((value) => value + 1)), []);

  useEffect(() => {
    let current = true;
    const refresh = () => {
      void blackboard.repository.listWorkspaces().then((items) => {
        if (current) { setBlackboards(items); setLoadingBlackboards(false); }
      }).catch(() => { if (current) { setError(true); setLoadingBlackboards(false); } });
    };
    refresh();
    const unsubscribe = blackboard.repository.subscribe(refresh);
    return () => { current = false; unsubscribe(); };
  }, [blackboard]);

  const localWorks = useMemo(() => collectLocalWorks(sessions, blackboards), [sessions, blackboards]);
  const rows = useMemo<WorkspaceRow[]>(() => [
    ...localWorks.map((work) => ({ source: 'local' as const, key: `local:${work.id}`, work, name: work.name, kind: work.kind })),
    ...cloud.works.filter((work) => !cloud.user ||
      !localWorks.some((local) => syncKey(local) &&
        getBoundCloudWorkId(cloud.user!.id, syncKey(local)!) === work.id)).map((work) =>
      ({ source: 'cloud' as const, key: `cloud:${work.id}`, work, name: work.title, kind: work.kind })),
  ], [localWorks, cloud.works, cloud.user]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRows = rows.filter((row) => row.name.toLocaleLowerCase().includes(normalizedQuery));
  const activeSession = sessions.find((session) => session.id === canvas.getState().activeCanvasId);
  const editorPath = activeSession && isSourceBackedCanvasSession(activeSession) &&
    activeSession.sourceBinding.provider === 'browser-workspace'
    ? `/blackboard?workspace=${encodeURIComponent(activeSession.sourceBinding.id)}`
    : '/';
  const closeAccount = () => {
    if (accountOpen) navigateApp('/workspace');
  };
  const openAccount = () => {
    setMobileNavigationOpen(false);
    if (!accountOpen) navigateApp('/workspace?view=account');
  };
  const accountLabel = cloud.loading ? t('workspace.cloudLoading') : cloud.user?.login ??
    t(cloud.configured ? 'workspace.signIn' : 'workspace.account');

  const openWork = async (work: WorkItem) => {
    setError(false);
    try {
      if (work.kind === 'blackboard') {
        const existing = canvas.getState().canvasSessions.find((session) =>
          isSourceBackedCanvasSession(session) &&
          session.sourceBinding.provider === 'browser-workspace' &&
          session.sourceBinding.id === work.id
        );
        if (existing) {
          if (!await canvas.commands.sessions.switch(existing.id)) throw new Error('Session unavailable');
        } else {
          canvas.commands.sessions.openSource({
            kind: 'blackboard', provider: 'browser-workspace', id: work.id,
          }, { name: work.name });
        }
        navigateApp(`/blackboard?workspace=${encodeURIComponent(work.id)}`);
      } else if (work.sessionId && await canvas.commands.sessions.switch(work.sessionId)) {
        navigateApp('/');
      } else {
        throw new Error('Session unavailable');
      }
    } catch { setError(true); }
  };

  const createWork = async (kind: WorkKind) => {
    setError(false);
    try {
      if (kind === 'blackboard') {
        const { workspace } = await blackboard.repository.createWorkspace();
        canvas.commands.sessions.openSource({
          kind: 'blackboard', provider: 'browser-workspace', id: workspace.id,
        }, { name: workspace.title });
        navigateApp(`/blackboard?workspace=${encodeURIComponent(workspace.id)}`);
      } else {
        canvas.commands.sessions.create(kind === 'slides' ? 'slide' : 'freeform');
        navigateApp('/');
      }
    } catch { setError(true); }
  };

  const renameWork = async (row: WorkspaceRow, name: string) => {
    setRenameKey(null);
    if (name === row.name) return;
    if (row.source === 'cloud') {
      await cloud.rename(row.work, name);
      return;
    }
    setError(false);
    try {
      if (row.work.kind === 'blackboard') {
        const renamed = await blackboard.repository.renameWorkspace(row.work.id, name);
        canvas.commands.sessions.syncBlackboardTitle(row.work.id, renamed.workspace.title);
      } else if (row.work.sessionId) {
        canvas.commands.sessions.rename(row.work.sessionId, name);
      }
    } catch { setError(true); }
  };

  const removeSession = async (id: string) => {
    if (canvas.getState().canvasSessions.length === 1) canvas.commands.sessions.create('freeform');
    if (!await canvas.commands.sessions.remove(id)) throw new Error('Could not remove session');
  };

  const deleteWork = async () => {
    if (!pendingDelete || busy || cloud.busy) return;
    const row = pendingDelete;
    if (row.source === 'cloud') {
      if (await cloud.remove(row.work)) setPendingDelete(null);
      return;
    }
    setBusy(true);
    setError(false);
    try {
      if (row.work.kind === 'blackboard') {
        const boundIds = canvas.getState().canvasSessions.filter((session) =>
          isSourceBackedCanvasSession(session) &&
          session.sourceBinding.provider === 'browser-workspace' &&
          session.sourceBinding.id === row.work.id
        ).map((session) => session.id);
        for (const id of boundIds) await removeSession(id);
        await blackboard.repository.deleteWorkspace(row.work.id);
        if (cloud.user) {
          const cloudId = getBoundCloudWorkId(cloud.user.id, blackboardSyncKey(row.work.id));
          if (cloudId) unbindCloudWork(cloud.user.id, cloudId);
        }
      } else if (row.work.sessionId) {
        await removeSession(row.work.sessionId);
      }
      setPendingDelete(null);
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const backupWork = async (work: WorkItem) => {
    if (work.shared || busy || cloud.busy) return;
    setBusy(true);
    setError(false);
    try {
      if (work.kind === 'blackboard') {
        const source = await blackboard.repository.readWorkspace(work.id);
        if (!source) throw new Error('Blackboard unavailable');
        await cloud.backup('blackboard', source.workspace.title, serializeBlackboardSource(source), blackboardSyncKey(work.id));
        return;
      }
      if (!work.sessionId) throw new Error('Session unavailable');
      const session = await canvas.materializeSession(work.sessionId);
      if (!session) throw new Error('Session unavailable');
      const exported = prepareTextExport({
        canvasMode: session.mode,
        surface: session.surface,
        slideDeck: session.slideDeck,
        documentName: session.name,
        includeColor: true,
        showGrid: false,
      }, 'chardesk');
      if (!exported.ok) throw new Error('Backup export failed');
      await cloud.backup(work.kind, work.name, exported.value.content, work.sessionId);
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const openCloudWork = async (work: CloudWork) => {
    if (work.contentStatus !== 'uploaded' || busy) return;
    setBusy(true);
    setError(false);
    try {
      if (work.kind === 'blackboard') {
        const existing = cloud.user && blackboards.find((item) =>
          getBoundCloudWorkId(cloud.user!.id, blackboardSyncKey(item.id)) === work.id);
        if (existing) {
          await openWork({ id: existing.id, name: existing.title, kind: 'blackboard', shared: false });
          return;
        }
        const { title, content, revision } = await cloudWorkspaceApi.readBackup(work.id);
        const imported = await blackboard.repository.importWorkspace(title, parseBlackboardSource(content));
        if (cloud.user) {
          try { await bindCloudSession(cloud.user.id, blackboardSyncKey(imported.workspace.id), work.id,
            revision, imported.workspace.title, serializeBlackboardSource(imported), work.conflictWith); }
          catch { /* The imported local source remains available. */ }
        }
        await openWork({ id: imported.workspace.id, name: imported.workspace.title, kind: 'blackboard', shared: false });
        return;
      }
      const boundId = cloud.user && canvas.getState().canvasSessions.find((session) =>
        getBoundCloudWorkId(cloud.user!.id, session.id) === work.id)?.id;
      if (boundId) {
        if (!await canvas.commands.sessions.switch(boundId)) throw new Error('Session unavailable');
        navigateApp('/');
        return;
      }
      const { title, content, revision } = await cloudWorkspaceApi.readBackup(work.id);
      const restored = await canvas.commands.sessions.import(content, {
        name: title, sourceName: `${title}.chardesk`,
      });
      if (cloud.user && restored) {
        try {
          const local = await canvas.materializeSession(restored.id);
          const exported = local && prepareTextExport({ canvasMode: local.mode, surface: local.surface,
            slideDeck: local.slideDeck, documentName: local.name, includeColor: true, showGrid: false }, 'chardesk');
          if (exported?.ok) await bindCloudSession(cloud.user.id, restored.id, work.id, revision,
            local!.name, exported.value.content, work.conflictWith);
        }
        catch { /* Import succeeded; a missing sync binding must not hide the restored local copy. */ }
      }
      navigateApp('/');
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const conflictCloudWork = cloud.works.find((work) => work.id === conflictCloudWorkId);
  const conflictLocalWork = localWorks.find((work) => syncKey(work) === conflictSessionId);
  const conflictWorkId = conflictCloudWork?.conflictWith ?? (cloud.user && conflictSessionId
    ? getCloudConflict(cloud.user.id, conflictSessionId) : null);
  const otherVersion = cloud.works.find((work) => work.id === conflictWorkId);
  const chooseConflictVersion = (openOther: boolean) => {
    if (conflictCloudWork) {
      setConflictCloudWorkId(null);
      const selected = openOther ? otherVersion : conflictCloudWork;
      if (selected) void openCloudWork(selected);
      return;
    }
    if (!cloud.user || !conflictSessionId) return;
    const localVersion = localWorks.find((work) => syncKey(work) === conflictSessionId);
    resolveCloudConflict(cloud.user.id, conflictSessionId);
    setConflictSessionId(null);
    if (openOther && otherVersion) void openCloudWork(otherVersion);
    else if (!openOther && localVersion) void openWork(localVersion);
  };

  return (
    <div data-testid="local-workspace" className="flex min-h-dvh min-w-0 bg-background text-foreground">
      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetHeader className="border-b border-separator">
            <SheetTitle>{t('workspace.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('workspace.navigation')}</SheetDescription>
          </SheetHeader>
          <WorkspaceNavigation onSelect={() => setMobileNavigationOpen(false)} />
          <WorkspaceAccountFooter label={accountLabel} open={accountOpen} onSelect={openAccount} />
        </SheetContent>
      </Sheet>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-separator md:flex">
        <div className="border-b border-separator px-4 py-3 text-sm font-semibold">{t('workspace.title')}</div>
        <WorkspaceNavigation onSelect={closeAccount} />
        <WorkspaceAccountFooter label={accountLabel} open={accountOpen} onSelect={openAccount}
          buttonRef={desktopAccountRef} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" tone="subtle" shape="square" size="sm" className="md:hidden"
            ref={mobileNavigationRef} aria-label={t('workspace.openNavigation')}
            onClick={() => setMobileNavigationOpen(true)}>
            <PanelLeft aria-hidden="true" />
          </Button>
          <h1 className="truncate text-lg font-semibold">{t('workspace.works')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" tone="subtle" size="sm" onClick={() => navigateApp(editorPath)}>
            <ChevronLeft aria-hidden="true" />{t('workspace.back')}
          </Button>
        </div>
      </header>
      <main className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 border-b border-separator px-3 py-2">
          <Input type="search" appearance="search" aria-label={t('workspace.search')}
            placeholder={t('workspace.search')} value={query} onChange={(event) => setQuery(event.target.value)}
            className="min-w-40 flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm"><Plus aria-hidden="true" />{t('workspace.new')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['canvas', 'slides', 'blackboard'] as const).map((kind) => (
                <DropdownMenuItem key={kind} onSelect={() => void createWork(kind)}>{t(`workspace.${kind}`)}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {error && <p role="alert" className="px-3 py-2 text-sm text-destructive">{t('workspace.error')}</p>}
        {cloud.error && <p role="alert" className="px-3 py-2 text-sm text-destructive">{t(cloud.limitExceeded ? 'workspace.cloudLimit' : 'workspace.cloudError')}</p>}
        {cloud.loading && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">{t('workspace.cloudLoading')}</p>}
        <Table aria-label={t('workspace.title')} density="compact" className="min-w-[38rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">{t('workspace.columnName')}</TableHead>
              <TableHead>{t('workspace.columnType')}</TableHead>
              <TableHead>{t('workspace.columnStatus')}</TableHead>
              <TableHead>{t('workspace.columnLocation')}</TableHead>
              <TableHead><span className="sr-only">{t('workspace.columnActions')}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const Icon = icons[row.kind];
              return (
                <TableRow key={row.key} data-work-id={row.work.id} data-work-kind={row.kind} data-work-source={row.source}>
                  <TableCell className="min-w-56 max-w-0">
                    {renameKey === row.key ? (
                      <InlineRenameInput autoFocus value={row.name} aria-label={t('workspace.renameLabel')}
                        className="w-full" onCommit={(name) => void renameWork(row, name)} onCancel={() => setRenameKey(null)} />
                    ) : row.source === 'local' ? (
                      <Button type="button" tone="subtle" className="w-full min-w-0 justify-start"
                        aria-label={t('workspace.open', { name: row.name })} onClick={() => void openWork(row.work)}>
                        <Icon aria-hidden="true" className="shrink-0" />
                        <span className="truncate text-left">{row.name}</span>
                      </Button>
                    ) : row.work.contentStatus === 'uploaded' ? (
                      <Button type="button" tone="subtle" className="w-full min-w-0 justify-start"
                        aria-label={t('workspace.open', { name: row.name })} onClick={() => void openCloudWork(row.work)}>
                        <Icon aria-hidden="true" className="shrink-0" />
                        <span className="truncate text-left">{row.name}</span>
                      </Button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2 px-2" title={row.name}>
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate">{row.name}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(`workspace.${row.kind}`)}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.source === 'cloud'
                    ? t(row.work.conflictWith ? 'workspace.sync.conflict-copy'
                      : row.work.contentStatus === 'uploaded' ? 'workspace.backedUp' : 'workspace.contentNotUploaded')
                    : row.work.shared ? t('workspace.sharedStatus')
                      : cloud.user && syncKey(row.work)
                        ? t(`workspace.sync.${getCloudSyncState(cloud.user.id, syncKey(row.work)!) ?? 'local'}`)
                        : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{t(row.source === 'cloud' && row.work.contentStatus === 'uploaded'
                    ? 'workspace.cloudStorage' : row.source === 'cloud' ? 'workspace.cloudCatalog'
                      : cloud.user && syncKey(row.work) && getBoundCloudWorkId(cloud.user.id, syncKey(row.work)!)
                        ? 'workspace.thisBrowserAndCloud' : 'workspace.thisBrowser')}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" tone="subtle" shape="square" size="sm" disabled={busy || cloud.busy}
                          aria-label={t('workspace.actions', { name: row.name })}><MoreHorizontal aria-hidden="true" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row.source === 'local' && cloud.user && !row.work.shared && (
                          <DropdownMenuItem onSelect={() => void backupWork(row.work)}>{t('workspace.backup')}</DropdownMenuItem>
                        )}
                        {row.source === 'cloud' && row.work.contentStatus === 'uploaded' && (
                          <DropdownMenuItem onSelect={() => void openCloudWork(row.work)}>{t('workspace.restore')}</DropdownMenuItem>
                        )}
                        {row.source === 'cloud' && row.work.conflictWith && (
                          <DropdownMenuItem onSelect={() => setConflictCloudWorkId(row.work.id)}>
                            {t('workspace.reviewConflict')}
                          </DropdownMenuItem>
                        )}
                        {row.source === 'local' && cloud.user && syncKey(row.work) &&
                          getCloudConflict(cloud.user.id, syncKey(row.work)!) && (
                            <DropdownMenuItem onSelect={() => setConflictSessionId(syncKey(row.work)!)}>
                              {t('workspace.reviewConflict')}
                            </DropdownMenuItem>
                          )}
                        {(row.source === 'local' || row.work.contentStatus === 'not-uploaded') &&
                          <DropdownMenuItem onSelect={() => setRenameKey(row.key)}>{t('workspace.rename')}</DropdownMenuItem>}
                        <DropdownMenuItem variant="destructive" onSelect={() => setPendingDelete(row)}>{t('workspace.delete')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {loadingBlackboards && visibleRows.length === 0 ? (
          <p role="status" className="px-3 py-3 text-sm text-muted-foreground">{t('workspace.loading')}</p>
        ) : visibleRows.length === 0 ? (
          <Empty><EmptyTitle>{t('workspace.empty')}</EmptyTitle></Empty>
        ) : null}
      </main>
      </div>
      <Dialog open={accountOpen} onOpenChange={(open) => { if (!open) closeAccount(); }}>
        <DialogContent className="sm:max-w-sm" onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = window.matchMedia?.('(min-width: 768px)').matches
            ? desktopAccountRef.current : mobileNavigationRef.current;
          target?.focus();
        }}>
          <DialogHeader>
            <DialogTitle>{t(cloud.user ? 'workspace.account' : 'workspace.signInTitle')}</DialogTitle>
            {!cloud.user && cloud.configured && !cloud.loading &&
              <DialogDescription>{t('workspace.cloudSecurityNote')}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {!cloud.configured ? (
              <p className="text-sm text-muted-foreground">{t('workspace.cloudUnavailable')}</p>
            ) : cloud.loading ? (
              <p role="status" className="text-sm text-muted-foreground">{t('workspace.cloudLoading')}</p>
            ) : cloud.user ? (
              <>
                <p className="text-sm font-medium">{cloud.user.login}</p>
                {cloud.limits && <p className="text-sm text-muted-foreground">
                  {t('workspace.storageUsage', {
                    used: mib(cloud.limits.usedBytes), total: mib(cloud.limits.maxAccountBytes),
                    work: mib(cloud.limits.maxWorkBytes),
                  })}
                </p>}
                <p className="text-sm text-muted-foreground">{t('workspace.cloudSecurityNote')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('workspace.connectedProviders')}: {cloud.linkedProviders.map(providerName).join(' · ')}
                </p>
                {cloud.availableProviders.filter((provider) => !cloud.linkedProviders.includes(provider))
                  .map((provider) => <Button key={provider} type="button" tone="neutral" outlined
                    disabled={cloud.busy} onClick={() => void cloud.linkProvider(provider)}>
                    <ProviderMark provider={provider} />
                    {t(provider === 'github' ? 'workspace.connectGitHub' : 'workspace.connectGoogle')}
                  </Button>)}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {cloud.availableProviders.includes('github') &&
                  <Button type="button" tone="neutral" outlined className="w-full"
                    onClick={() => { window.location.href = cloudSignInUrl; }}>
                    <ProviderMark provider="github" />
                    {t('workspace.signInGitHub')}
                  </Button>}
                {cloud.availableProviders.includes('google') &&
                  <Button type="button" tone="neutral" outlined className="w-full"
                    onClick={() => { window.location.href = cloudGoogleSignInUrl; }}>
                    <ProviderMark provider="google" />
                    {t('workspace.signInGoogle')}
                  </Button>}
              </div>
            )}
            {authStatus && <p role={authStatus === 'linked' || authStatus === 'cancelled' ? 'status' : 'alert'}
              className="text-sm text-muted-foreground">
              {t(authStatus === 'linked' ? 'workspace.authLinked' : authStatus === 'identity-in-use'
                ? 'workspace.authIdentityInUse' : authStatus === 'cancelled'
                  ? 'workspace.authCancelled' : 'workspace.authFailed')}
            </p>}
            {cloud.error && <p role="alert" className="text-sm text-destructive">
              {t(cloud.limitExceeded ? 'workspace.cloudLimit' : 'workspace.cloudError')}
            </p>}
          </DialogBody>
          {cloud.user && <DialogFooter>
            <Button type="button" tone="subtle" disabled={cloud.busy}
              onClick={() => void cloud.signOut()}>{t('workspace.signOut')}</Button>
          </DialogFooter>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !busy && !cloud.busy) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspace.deleteTitle', { name: pendingDelete?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(pendingDelete?.source === 'cloud'
                ? pendingDelete.work.contentStatus === 'uploaded'
                  ? 'workspace.deleteBackupDescription' : 'workspace.deleteCloudDescription'
                : pendingDelete?.source === 'local' && pendingDelete.work.shared
                  ? 'workspace.removeSharedDescription' : 'workspace.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || cloud.busy}>{t('dialog.cancel')}</AlertDialogCancel>
            <Button type="button" destructive disabled={busy || cloud.busy} onClick={() => void deleteWork()}>{t('workspace.delete')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={conflictSessionId !== null || conflictCloudWorkId !== null}
        onOpenChange={(open) => { if (!open) { setConflictSessionId(null); setConflictCloudWorkId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('workspace.conflictTitle')}</DialogTitle>
            <DialogDescription>{t('workspace.conflictDescription')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-1 text-sm">
            <p>{t('workspace.currentCopy')}: {conflictCloudWork?.title ?? conflictLocalWork?.name}</p>
            <p>{t('workspace.otherCopy')}: {otherVersion?.title ?? t('workspace.otherCopyUnavailable')}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" tone="subtle" onClick={() => chooseConflictVersion(false)}>
              {t('workspace.keepThisVersion')}
            </Button>
            <Button type="button" disabled={!otherVersion} onClick={() => chooseConflictVersion(true)}>
              {t('workspace.openOtherVersion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
