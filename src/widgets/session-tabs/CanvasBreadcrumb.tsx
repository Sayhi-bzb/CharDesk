'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasRuntime, useCanvasState } from '@/domains/canvas/public';
import {
  isSourceBackedCanvasSession,
  type CanvasMode,
} from '@/domains/sessions/public';
import {
  createBlackboardArchive,
  useBlackboardRuntimeOptional,
} from '@/domains/blackboard/public';
import { SLIDE_SIZE_PRESETS, type SlideSize } from '@/domains/slides/public';
import { getAvailableExportFormats, type ExportFormat } from '@/domains/export/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { useUiI18n, type I18nKey } from '@/shared/i18n';
import {
  cn,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  InlineRenameInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  SelectableItem,
  StatusText,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from '@chardesk/ui';

import { CustomSlideSizeDialog } from '@/widgets/dialogs/custom-slide-size-dialog';
import { useOnboardingTour } from '@/widgets/onboarding/onboarding-context';
import { useCanvasImport } from '@/widgets/import/useCanvasImport';
import {
  useCanvasSessionExport,
  type CanvasSessionExportErrorCode,
} from '@/widgets/export/use-canvas-session-export';
import { useInPlaceFeedback } from '@/shared/hooks/use-in-place-feedback';
import { useIsMobile } from '@/shared/hooks/use-mobile';

const SessionExpandIcon = HOST_ICONOLOGY.sessionAction.expand;
const SessionMoreIcon = HOST_ICONOLOGY.sessionAction.more;
const SessionRenameIcon = HOST_ICONOLOGY.sessionAction.rename;
const SessionCreateIcon = HOST_ICONOLOGY.sessionAction.create;
const SessionImportIcon = HOST_ICONOLOGY.sessionAction.import;
const SessionExportIcon = HOST_ICONOLOGY.sessionAction.export;
const BlackboardImportIcon = HOST_ICONOLOGY.sessionAction.importBlackboard;
const SessionCloseIcon = HOST_ICONOLOGY.sessionAction.close;
const SlideModeIcon = HOST_ICONOLOGY.canvasMode.slide;

type ExportFeedbackTarget = {
  sessionId: string;
  format: ExportFormat;
  errorCode?: CanvasSessionExportErrorCode;
};

const createOptionMeta = [
  {
    kind: 'freeform' as const,
    labelKey: 'session.newFreeform',
    icon: HOST_ICONOLOGY.canvasMode.freeform,
  },
  {
    kind: 'blackboard' as const,
    labelKey: 'session.newBlackboard',
    icon: HOST_ICONOLOGY.sourceKind.blackboard,
  },
] satisfies Array<{
  kind: CanvasMode | 'blackboard';
  labelKey: I18nKey;
  icon: (typeof HOST_ICONOLOGY.canvasMode)[keyof typeof HOST_ICONOLOGY.canvasMode];
}>;

type CanvasSessionSelectorProps = {
  manageSessions?: boolean;
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onActivate?: () => void;
  onboardingTarget?: boolean;
  paneActive?: boolean;
};

export function CanvasSessionSelector({
  manageSessions = true,
  selectedSessionId,
  onSelectSession,
  onActivate,
  onboardingTarget = false,
  paneActive = false,
}: CanvasSessionSelectorProps) {
  const canvas = useCanvasRuntime();
  const blackboard = useBlackboardRuntimeOptional();
  const { t } = useUiI18n();
  const isMobile = useIsMobile();
  const { phase: onboardingPhase } = useOnboardingTour();
  const selectorTriggerRef = useRef<HTMLButtonElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const activeSessionButtonRef = useRef<HTMLButtonElement>(null);
  const suppressSelectorFocusRef = useRef(false);
  const selectorTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const sessionActionTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const { canvasSessions, activeCanvasId } = useCanvasState(
    useShallow((state) => ({
      canvasSessions: state.canvasSessions,
      activeCanvasId: state.activeCanvasId,
    }))
  );
  const createCanvasSession = canvas.commands.sessions.create;
  const openSourceSession = canvas.commands.sessions.openSource;
  const switchCanvasSession = canvas.commands.sessions.switch;
  const removeCanvasSession = canvas.commands.sessions.remove;
  const renameCanvasSession = canvas.commands.sessions.rename;
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renamePanelWidth, setRenamePanelWidth] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [customSlideSizeOpen, setCustomSlideSizeOpen] = useState(false);
  const {
    directoryInputRef,
    fileInputRef,
    handleBlackboardDirectoryChange,
    handleFileChange,
    isImporting,
    openBlackboardPicker,
    openFilePicker,
  } = useCanvasImport();
  const exportActions = useCanvasSessionExport();
  const {
    feedback: exportFeedback,
    run: runExportFeedback,
    clear: clearExportFeedback,
  } = useInPlaceFeedback<ExportFeedbackTarget>({ errorDurationMs: 4000 });
  const keepCreateMenuOpen =
    onboardingPhase === 'canvas-selector' ||
    onboardingPhase === 'create-menu' ||
    onboardingPhase === 'canvas-create';

  const selectedId = selectedSessionId ?? activeCanvasId;
  const activeSession =
    canvasSessions.find((session) => session.id === selectedId) ?? canvasSessions[0];
  const pendingDeleteSession = pendingDeleteId
    ? (canvasSessions.find((session) => session.id === pendingDeleteId) ?? null)
    : null;
  const ActiveModeIcon = isSourceBackedCanvasSession(activeSession)
    ? HOST_ICONOLOGY.sourceKind.blackboard
    : HOST_ICONOLOGY.canvasMode[activeSession?.mode ?? 'freeform'];
  const canRemove = canvasSessions.length > 1;

  if (!manageSessions) {
    return (
      <div
        data-canvas-ui="true"
        data-canvas-breadcrumb-host="true"
        className="pointer-events-auto flex min-w-0 items-center gap-1.5 px-2 text-sm"
      >
        <ActiveModeIcon className="size-4 shrink-0" />
        <span className="truncate">{activeSession?.name ?? t('session.fallbackName')}</span>
      </div>
    );
  }

  const closeSelector = () => {
    setSelectorOpen(false);
    setCreateMenuOpen(false);
    setImportMenuOpen(false);
    setActionsOpenId(null);
    clearExportFeedback();
  };

  const openImportPicker = (openPicker: () => void) => {
    onActivate?.();
    openPicker();
    closeSelector();
  };

  const createSession = async (kind: 'freeform' | 'blackboard') => {
    onActivate?.();
    if (kind === 'blackboard') {
      if (!blackboard) throw new Error('Blackboard runtime is unavailable.');
      const source = await blackboard.repository.createWorkspace();
      openSourceSession({
        kind: 'blackboard',
        provider: 'browser-workspace',
        id: source.workspace.id,
      }, {
        name: source.workspace.title,
      });
    } else {
      createCanvasSession(kind);
    }
    closeSelector();
  };

  const createSlideSession = (size: SlideSize) => {
    onActivate?.();
    createCanvasSession('slide', { slideSize: size });
    closeSelector();
  };

  const openRename = (id: string) => {
    setRenamePanelWidth(panelContentRef.current?.getBoundingClientRect().width ?? null);
    setActionsOpenId(null);
    setRenameTargetId(id);
  };

  const exportBlackboard = async (workspaceId: string, name: string) => {
    const source = await blackboard?.repository.readWorkspace(workspaceId);
    if (!source) return;
    const url = URL.createObjectURL(createBlackboardArchive(source));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/[^a-z0-9._-]+/giu, '-') || 'blackboard'}.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const commitRename = (name: string) => {
    if (!renameTargetId) return;
    renameCanvasSession(renameTargetId, name);
    setRenameTargetId(null);
    setRenamePanelWidth(null);
  };

  const cancelRename = () => {
    setRenameTargetId(null);
    setRenamePanelWidth(null);
  };

  const openModalFromSelector = (openModal: () => void) => {
    suppressSelectorFocusRef.current = true;
    closeSelector();
    openModal();
  };

  const restoreSelectorFocus = () => {
    suppressSelectorFocusRef.current = false;
    window.setTimeout(() => selectorTriggerRef.current?.focus(), 0);
  };

  return (
    <div
      data-canvas-ui="true"
      data-canvas-breadcrumb-host="true"
      className="pointer-events-auto min-w-0"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".chardesk,.slides.md,.ans,.txt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
      <input
        ref={(input) => {
          directoryInputRef.current = input;
          if (input) input.webkitdirectory = true;
        }}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleBlackboardDirectoryChange}
      />
      <Popover
        open={selectorOpen}
        onOpenChange={(open) => {
          if (open) onActivate?.();
          setSelectorOpen(keepCreateMenuOpen ? true : open);
          if (!open) {
            setCreateMenuOpen(false);
            setImportMenuOpen(false);
            setActionsOpenId(null);
            setRenamePanelWidth(null);
            clearExportFeedback();
          }
        }}
      >
        <PopoverTrigger asChild>
          <TooltipTrigger
            handle={selectorTooltipHandle}
            payload={activeSession?.name ?? t('session.fallbackName')}
            render={
              <Button
                ref={selectorTriggerRef}
                data-onboarding-target={onboardingTarget ? 'canvas-selector' : undefined}
                data-pane-active={paneActive || undefined}
                tone="subtle"
                size="md"
                active={paneActive}
                className={cn('max-w-[min(14rem,calc(100vw-5.5rem))] justify-start gap-1.5 px-2')}
                aria-label={t('session.select')}
                aria-current={paneActive ? 'true' : undefined}
              />
            }
          >
            <ActiveModeIcon />
            <span className="truncate">{activeSession?.name ?? t('session.fallbackName')}</span>
            <SessionExpandIcon className="opacity-60" />
          </TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent
          ref={panelContentRef}
          align="start"
          className="w-max min-w-44 max-w-[min(14rem,calc(100vw-1.5rem))]"
          style={renamePanelWidth === null ? undefined : { width: renamePanelWidth }}
          role="dialog"
          aria-label={t('session.select')}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            activeSessionButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (suppressSelectorFocusRef.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-slot^="dropdown-menu"]')
            ) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!renameTargetId) return;
            event.preventDefault();
            cancelRename();
          }}
        >
          <div className="flex flex-col gap-0.5">
            {canvasSessions.map((session) => {
              const ModeIcon = isSourceBackedCanvasSession(session)
                ? HOST_ICONOLOGY.sourceKind.blackboard
                : HOST_ICONOLOGY.canvasMode[session.mode];
              const manageLabel = t('session.manage', { name: session.name });
              const isActive = session.id === selectedId;
              const isEditing = session.id === renameTargetId;
              return (
                <SelectableItem
                  asChild
                  key={session.id}
                  selected={isActive}
                  status={session.collaboration ? 'success' : undefined}
                  data-canvas-session-row={session.id}
                  data-active={isActive ? 'true' : undefined}
                  className="group/session-row flex w-full min-w-0 items-center p-0"
                >
                  <div>
                    {isEditing ? (
                      <div className="flex h-7 min-w-0 flex-1 items-center gap-2 px-2">
                        <ModeIcon className="size-4 shrink-0" />
                        <InlineRenameInput
                          value={session.name}
                          onCommit={commitRename}
                          onCancel={cancelRename}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          className="flex-1 px-1.5"
                          aria-label={t('session.renameLabel')}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <>
                        <Button
                          ref={isActive ? activeSessionButtonRef : undefined}
                          type="button"
                          tone="subtle"
                          size="sm"
                          aria-current={isActive ? 'page' : undefined}
                          className="min-w-0 flex-1 justify-start px-2"
                          onClick={() => {
                            onActivate?.();
                            (onSelectSession ?? switchCanvasSession)(session.id);
                            closeSelector();
                          }}
                        >
                          <ModeIcon />
                          <span className="truncate">{session.name}</span>
                        </Button>
                        <DropdownMenu
                          modal={false}
                          open={actionsOpenId === session.id}
                          onOpenChange={(open) => setActionsOpenId(open ? session.id : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <TooltipTrigger
                              handle={sessionActionTooltipHandle}
                              payload={manageLabel}
                              render={
                                <Button
                                  type="button"
                                  tone="subtle"
                                  shape="square"
                                  size="sm"
                                  data-session-actions="true"
                                  aria-label={manageLabel}
                                  className="shrink-0"
                                />
                              }
                            >
                              <SessionMoreIcon />
                            </TooltipTrigger>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side="right"
                            align="start"
                            className="w-36"
                            aria-label={manageLabel}
                          >
                            <DropdownMenuGroup>
                              {!isSourceBackedCanvasSession(session) && (
                                <DropdownMenuItem onSelect={() => openRename(session.id)}>
                                  <SessionRenameIcon />
                                  {t('session.rename')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <SessionExportIcon />
                                  {t('session.export')}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                  className="w-40"
                                  aria-label={t('session.export')}
                                >
                                  <DropdownMenuGroup>
                                    {getAvailableExportFormats(session.mode).map((definition) => {
                                      const isTarget =
                                        exportFeedback?.target.sessionId === session.id &&
                                        exportFeedback.target.format === definition.format;
                                      return (
                                        <DropdownMenuItem
                                          key={definition.format}
                                          feedback={isTarget ? exportFeedback.status : undefined}
                                          onSelect={(event) => {
                                            event.preventDefault();
                                            void runExportFeedback(
                                              { sessionId: session.id, format: definition.format },
                                              async () => {
                                                const result = await exportActions.save(
                                                  session.id,
                                                  definition.format
                                                );
                                                return result.ok
                                                  ? true
                                                  : {
                                                      success: false,
                                                      target: {
                                                        sessionId: session.id,
                                                        format: definition.format,
                                                        errorCode: result.errorCode,
                                                      },
                                                    };
                                              }
                                            );
                                          }}
                                        >
                                          {definition.label}
                                          {isTarget && exportFeedback.status === 'success' ? (
                                            <span className="ml-auto">
                                              <Check />
                                            </span>
                                          ) : isTarget && exportFeedback.status === 'error' ? (
                                            <span className="ml-auto">
                                              <X />
                                            </span>
                                          ) : null}
                                        </DropdownMenuItem>
                                      );
                                    })}
                                    {isSourceBackedCanvasSession(session) &&
                                    session.sourceBinding.provider === 'browser-workspace' ? (
                                      <DropdownMenuItem onSelect={() => {
                                        void exportBlackboard(
                                          session.sourceBinding.id,
                                          session.name,
                                        );
                                      }}>
                                        {t('session.exportSource')}
                                      </DropdownMenuItem>
                                    ) : null}
                                  </DropdownMenuGroup>
                                  {exportFeedback?.status === 'error' &&
                                  exportFeedback.target.sessionId === session.id ? (
                                    <StatusText tone="error" asChild>
                                      <div
                                        role="alert"
                                        className="px-2 py-1.5 text-[11px] leading-4"
                                      >
                                        {exportFeedback.target.errorCode === 'image-too-large'
                                          ? t('export.imageTooLargeDescription')
                                          : t('export.saveFailedDescription', {
                                              format: exportFeedback.target.format.toUpperCase(),
                                            })}
                                      </div>
                                    </StatusText>
                                  ) : null}
                                  <span role="status" className="sr-only">
                                    {exportFeedback?.status === 'success' &&
                                    exportFeedback.target.sessionId === session.id
                                      ? t('export.saved', {
                                          format: exportFeedback.target.format.toUpperCase(),
                                        })
                                      : ''}
                                  </span>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={!canRemove}
                                onSelect={() =>
                                  openModalFromSelector(() => setPendingDeleteId(session.id))
                                }
                              >
                                <SessionCloseIcon />
                                {t('session.closeAction')}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </SelectableItem>
              );
            })}
          </div>

          <Separator className="my-1" />

          <DropdownMenu
            modal={false}
            open={keepCreateMenuOpen ? true : createMenuOpen}
            onOpenChange={(open) => setCreateMenuOpen(keepCreateMenuOpen ? true : open)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                tone="subtle"
                size="sm"
                data-onboarding-target="create-menu"
                className="w-full justify-start bg-transparent px-2"
              >
                <SessionCreateIcon />
                {t('session.new')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? 'bottom' : 'right'}
              align="start"
              avoidCollisions
              collisionPadding={12}
              className="w-[calc(50vw-1.5rem)] max-w-44"
              aria-label={t('session.new')}
            >
              <DropdownMenuGroup>
                {createOptionMeta.map((option) => {
                  const Icon = option.icon;
                  return (
                    <DropdownMenuItem
                      key={option.kind}
                      data-onboarding-target={
                        option.kind === 'freeform' ? 'create-freeform' : undefined
                      }
                      onSelect={() => { void createSession(option.kind); }}
                    >
                      <Icon />
                      {t(option.labelKey)}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <SlideModeIcon />
                    {t('session.newSlides')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44" aria-label={t('session.newSlides')}>
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onSelect={() => createSlideSession(SLIDE_SIZE_PRESETS.widescreen)}
                      >
                        {t('session.slideWidescreen')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => createSlideSession(SLIDE_SIZE_PRESETS.classic)}
                      >
                        {t('session.slideClassic')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onSelect={() => openModalFromSelector(() => setCustomSlideSizeOpen(true))}
                      >
                        {t('session.slideCustom.item')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false} open={importMenuOpen} onOpenChange={setImportMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                tone="subtle"
                size="sm"
                className="w-full justify-start bg-transparent px-2"
              >
                <SessionImportIcon />
                {t('session.import')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? 'bottom' : 'right'}
              align="start"
              avoidCollisions
              collisionPadding={12}
              className="w-[calc(50vw-1.5rem)] max-w-44"
              aria-label={t('session.import')}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={isImporting}
                  onSelect={() => openImportPicker(openFilePicker)}
                >
                  <SessionImportIcon />
                  {isImporting ? t('import.importing') : t('session.importFile')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isImporting}
                  onSelect={() => openImportPicker(openBlackboardPicker)}
                >
                  <BlackboardImportIcon />
                  {t('session.importBlackboard')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </PopoverContent>
      </Popover>

      <Tooltip handle={selectorTooltipHandle}>
        {({ payload }) => <TooltipPopup side="bottom">{payload}</TooltipPopup>}
      </Tooltip>
      <Tooltip handle={sessionActionTooltipHandle}>
        {({ payload }) => <TooltipPopup side="left">{payload}</TooltipPopup>}
      </Tooltip>

      {customSlideSizeOpen ? (
        <CustomSlideSizeDialog
          open={customSlideSizeOpen}
          onOpenChange={(open) => {
            setCustomSlideSizeOpen(open);
            if (!open) suppressSelectorFocusRef.current = false;
          }}
          onConfirm={(size) => {
            createSlideSession(size);
            setCustomSlideSizeOpen(false);
            suppressSelectorFocusRef.current = false;
          }}
          returnFocusRef={selectorTriggerRef}
        />
      ) : null}

      <AlertDialog
        open={!!pendingDeleteSession}
        onOpenChange={(open) => {
          if (open) return;
          setPendingDeleteId(null);
          restoreSelectorFocus();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(isSourceBackedCanvasSession(pendingDeleteSession)
                ? 'session.closeSource.title'
                : 'session.delete.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteSession
                ? t(isSourceBackedCanvasSession(pendingDeleteSession)
                    ? 'session.closeSource.description'
                    : 'session.delete.description', { name: pendingDeleteSession.name })
                : t('session.delete.fallbackDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              tone={isSourceBackedCanvasSession(pendingDeleteSession) ? 'primary' : 'danger'}
              onClick={() => {
                if (!pendingDeleteSession) return;
                void removeCanvasSession(pendingDeleteSession.id);
                setPendingDeleteId(null);
                restoreSelectorFocus();
              }}
            >
              {t(isSourceBackedCanvasSession(pendingDeleteSession)
                ? 'session.closeSource.action'
                : 'session.delete.action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CanvasBreadcrumb({ manageSessions = true }: { manageSessions?: boolean }) {
  return <CanvasSessionSelector manageSessions={manageSessions} onboardingTarget />;
}
