'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasRuntime, useCanvasState } from '@/domains/canvas/public';
import {
  isSourceBackedCanvasSession,
  type CanvasMode,
} from '@/domains/sessions/public';
import { SLIDE_SIZE_PRESETS, type SlideSize } from '@/domains/slides/public';
import { getAvailableExportFormats, type ExportFormat } from '@/domains/export/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { useUiI18n, type I18nKey } from '@/shared/i18n';
import {
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
const SessionCloseIcon = HOST_ICONOLOGY.sessionAction.close;
const SlideModeIcon = HOST_ICONOLOGY.canvasMode.slide;

type ExportFeedbackTarget = {
  sessionId: string;
  format: ExportFormat;
  errorCode?: CanvasSessionExportErrorCode;
};

type RenameOrigin = 'create-menu' | 'actions-menu' | 'custom-slide-dialog';
type RenameFlow = {
  phase: 'handoff' | 'editing';
  sessionId: string;
  origin: RenameOrigin;
};

const createOptionMeta = [
  {
    kind: 'freeform' as const,
    labelKey: 'session.newFreeform',
    icon: HOST_ICONOLOGY.canvasMode.freeform,
  },
] satisfies Array<{
  kind: CanvasMode;
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
  const { t } = useUiI18n();
  const isMobile = useIsMobile();
  const { phase: onboardingPhase } = useOnboardingTour();
  const selectorTriggerRef = useRef<HTMLButtonElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const activeSessionButtonRef = useRef<HTMLButtonElement>(null);
  const suppressSelectorFocusRef = useRef(false);
  const deletingRef = useRef(false);
  // Radix close-autofocus may run before React commits the selection update.
  const renameFlowRef = useRef<RenameFlow | null>(null);
  const selectorTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const sessionActionTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const { canvasSessions, activeCanvasId } = useCanvasState(
    useShallow((state) => ({
      canvasSessions: state.canvasSessions,
      activeCanvasId: state.activeCanvasId,
    }))
  );
  const createCanvasSession = canvas.commands.sessions.create;
  const switchCanvasSession = canvas.commands.sessions.switch;
  const removeCanvasSession = canvas.commands.sessions.remove;
  const renameCanvasSession = canvas.commands.sessions.rename;
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [importDropTarget, setImportDropTarget] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [renameFlow, setRenameFlow] = useState<RenameFlow | null>(null);
  const [renamePanelWidth, setRenamePanelWidth] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [customSlideSizeOpen, setCustomSlideSizeOpen] = useState(false);
  const {
    fileInputRef,
    handleDrop,
    handleFileChange,
    isImporting,
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
    ? HOST_ICONOLOGY.sourceKind.document
    : HOST_ICONOLOGY.canvasMode[activeSession?.mode ?? 'freeform'];
  const canRemove = canvasSessions.length > 1;
  const renameTargetId = renameFlow?.phase === 'editing' ? renameFlow.sessionId : null;

  if (!manageSessions) {
    return (
      <TooltipTrigger
        handle={selectorTooltipHandle}
        payload={activeSession?.name ?? t('session.fallbackName')}
        render={
          <div
            data-canvas-ui="true"
            data-canvas-breadcrumb-host="true"
            className="pointer-events-auto flex min-w-0 items-center gap-1.5 px-2 text-sm"
          />
        }
      >
        <ActiveModeIcon className="size-4 shrink-0" />
        <span className="truncate">{activeSession?.name ?? t('session.fallbackName')}</span>
      </TooltipTrigger>
    );
  }

  const closeSelector = () => {
    setSelectorOpen(false);
    setCreateMenuOpen(false);
    setActionsOpenId(null);
    clearExportFeedback();
  };

  const openImportPicker = (openPicker: () => void) => {
    onActivate?.();
    openPicker();
    closeSelector();
  };

  const acceptImportDrag = (event: DragEvent<HTMLElement>) => {
    if (isImporting || !event.dataTransfer.types.includes('Files')) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setImportDropTarget(true);
    return true;
  };

  const dropImport = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setImportDropTarget(false);
    const items = Array.from(event.dataTransfer.items);
    const files = Array.from(event.dataTransfer.files);
    onActivate?.();
    closeSelector();
    void handleDrop(items, files);
  };

  const updateRenameFlow = (next: RenameFlow | null) => {
    renameFlowRef.current = next;
    setRenameFlow(next);
  };

  const requestRename = (sessionId: string, origin: RenameOrigin) => {
    setRenamePanelWidth(panelContentRef.current?.getBoundingClientRect().width ?? null);
    updateRenameFlow({ phase: 'handoff', sessionId, origin });
    if (origin === 'create-menu') setCreateMenuOpen(false);
    if (origin === 'actions-menu') setActionsOpenId(null);
  };

  const finishRename = () => {
    const origin = renameFlowRef.current?.origin;
    updateRenameFlow(null);
    setRenamePanelWidth(null);
    if (origin && origin !== 'actions-menu') closeSelector();
  };

  const completeRenameHandoff = (origin: RenameOrigin, event: Event) => {
    const pending = renameFlowRef.current;
    if (pending?.phase !== 'handoff' || pending.origin !== origin) return;
    event.preventDefault();
    updateRenameFlow({ ...pending, phase: 'editing' });
    if (origin === 'custom-slide-dialog') {
      suppressSelectorFocusRef.current = false;
      setSelectorOpen(true);
    }
  };

  const createSession = (kind: 'freeform') => {
    onActivate?.();
    const created = createCanvasSession(kind);
    if (onboardingPhase === 'idle') requestRename(created.id, 'create-menu');
    else closeSelector();
  };

  const createSlideSession = (size: SlideSize) => {
    onActivate?.();
    const created = createCanvasSession('slide', { slideSize: size });
    if (onboardingPhase !== 'idle') {
      closeSelector();
      return;
    }
    requestRename(created.id, customSlideSizeOpen ? 'custom-slide-dialog' : 'create-menu');
  };

  const commitRename = (name: string) => {
    const editing = renameFlowRef.current;
    if (editing?.phase !== 'editing') return;
    renameCanvasSession(editing.sessionId, name);
    finishRename();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteSession || deletingRef.current) return;
    deletingRef.current = true;
    setDeletePending(true);
    setDeleteError(false);
    try {
      if (!await removeCanvasSession(pendingDeleteSession.id)) {
        setDeleteError(true);
        return;
      }
      setPendingDeleteId(null);
      restoreSelectorFocus();
    } catch {
      setDeleteError(true);
    } finally {
      deletingRef.current = false;
      setDeletePending(false);
    }
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
      <Popover
        open={selectorOpen}
        onOpenChange={(open) => {
          if (open) onActivate?.();
          setSelectorOpen(keepCreateMenuOpen ? true : open);
          if (!open) {
            if (renameFlowRef.current?.phase === 'handoff' &&
              renameFlowRef.current.origin !== 'custom-slide-dialog') {
              updateRenameFlow(null);
            }
            setCreateMenuOpen(false);
            setActionsOpenId(null);
            setRenamePanelWidth(null);
            clearExportFeedback();
          }
        }}
      >
        <PopoverTrigger asChild>
          <TooltipTrigger
            handle={selectorTooltipHandle}
            payload={isImporting ? t('import.importing') : activeSession?.name ?? t('session.fallbackName')}
            render={
              <Button
                ref={selectorTriggerRef}
                data-onboarding-target={onboardingTarget ? 'canvas-selector' : undefined}
                data-pane-active={paneActive || undefined}
                data-drop-target={importDropTarget || undefined}
                tone="subtle"
                size="md"
                active={paneActive}
                className="max-w-[min(14rem,calc(100vw-5.5rem))] justify-start gap-1.5 px-2"
                aria-label={t('session.select')}
                aria-current={paneActive ? 'true' : undefined}
                aria-busy={isImporting}
                onDragEnter={(event) => {
                  if (acceptImportDrag(event)) setSelectorOpen(true);
                }}
                onDragOver={acceptImportDrag}
                onDragLeave={() => setImportDropTarget(false)}
                onDrop={dropImport}
              />
            }
          >
            <ActiveModeIcon />
            <span className="truncate" role={isImporting ? 'status' : undefined}>
              {isImporting ? t('import.importing') : activeSession?.name ?? t('session.fallbackName')}
            </span>
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
            if (renameFlowRef.current?.phase !== 'editing') {
              activeSessionButtonRef.current?.focus();
            }
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
            finishRename();
          }}
        >
          <div className="flex flex-col gap-0.5">
            {canvasSessions.map((session) => {
              const ModeIcon = isSourceBackedCanvasSession(session)
                ? HOST_ICONOLOGY.sourceKind.document
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
                  <div className="flex w-full min-w-0 items-center">
                    {isEditing ? (
                      <div className="flex h-7 min-w-0 flex-1 items-center gap-2 px-2">
                        <ModeIcon className="size-4 shrink-0" />
                        <InlineRenameInput
                          value={session.name}
                          onCommit={commitRename}
                          onCancel={finishRename}
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
                          className="min-w-0 flex-1 justify-start"
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
                            onCloseAutoFocus={(event) => {
                              completeRenameHandoff('actions-menu', event);
                            }}
                          >
                            <DropdownMenuGroup>
                              {!isSourceBackedCanvasSession(session) && (
                                <DropdownMenuItem onSelect={() => requestRename(session.id, 'actions-menu')}>
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
                                onSelect={() => openModalFromSelector(() => {
                                  setDeleteError(false);
                                  setPendingDeleteId(session.id);
                                })}
                              >
                                <SessionCloseIcon />
                                {t(isSourceBackedCanvasSession(session)
                                  ? 'session.closeAction'
                                  : 'session.deleteAction')}
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
              onCloseAutoFocus={(event) => {
                completeRenameHandoff('create-menu', event);
              }}
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

          <Button
            type="button"
            tone="subtle"
            size="sm"
            data-drop-target={importDropTarget || undefined}
            className="w-full justify-start px-2"
            disabled={isImporting}
            onClick={() => openImportPicker(openFilePicker)}
            onDragOver={acceptImportDrag}
            onDragLeave={() => setImportDropTarget(false)}
            onDrop={dropImport}
          >
            <SessionImportIcon />
            {isImporting ? t('import.importing') : t('session.import')}
          </Button>
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
            if (onboardingPhase !== 'idle') suppressSelectorFocusRef.current = false;
          }}
          returnFocusRef={selectorTriggerRef}
          onCloseAutoFocus={(event) => {
            completeRenameHandoff('custom-slide-dialog', event);
          }}
        />
      ) : null}

      <AlertDialog
        open={!!pendingDeleteSession}
        onOpenChange={(open) => {
          if (open || deletingRef.current) return;
          setPendingDeleteId(null);
          setDeleteError(false);
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
          {deleteError ? (
            <StatusText tone="error" role="alert" className="text-xs">
              {t(isSourceBackedCanvasSession(pendingDeleteSession)
                ? 'session.closeSource.failed'
                : 'session.delete.failed')}
            </StatusText>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{t('dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              tone={isSourceBackedCanvasSession(pendingDeleteSession) ? 'primary' : 'danger'}
              onClick={() => { void confirmDelete(); }}
            >
              {t(isSourceBackedCanvasSession(pendingDeleteSession)
                ? deletePending ? 'session.closeSource.pending' : 'session.closeSource.action'
                : deletePending ? 'session.delete.pending' : 'session.delete.action')}
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
