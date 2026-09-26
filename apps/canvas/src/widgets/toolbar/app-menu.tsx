'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useCanvasRuntime } from '@/domains/canvas/public';
import { useUiI18n } from '@/shared/i18n';
import { browser } from '@/shared/services/effects';
import { APP_SOURCE_URL } from '@/shared/lib/constants';
import { useGitHubStars } from './use-github-stars';
import { useCanvasWorkspaceOptional } from '@/widgets/canvas-editor/engine/CanvasWorkspace';
import { useOnboardingTour } from '@/widgets/onboarding/onboarding-context';
import { useEditorPresentation, type EditorFormFactor } from '@/widgets/editor-chrome/public';
import { RecoverableLazyBoundary } from '@/shared/components/RecoverableLazyBoundary';
import { requireLoadedModule } from '@/shared/lib/moduleLoadRecovery';
import { CellAppMenu } from './cell-app-menu';

const ClearCanvasDialog = lazy(() =>
  import('@/widgets/dialogs/clear-canvas-dialog').then((loaded) => ({
    default: requireLoadedModule(loaded).ClearCanvasDialog,
  }))
);
const SettingsDialog = lazy(() =>
  import('@/widgets/dialogs/settings-dialog').then((loaded) => ({
    default: requireLoadedModule(loaded).SettingsDialog,
  }))
);
const MobileGuideDialog = lazy(() => import('@/widgets/dialogs/mobile-guide-dialog'));

type AppMenuProps = {
  formFactor?: EditorFormFactor;
  splitAvailable?: boolean;
};

const focusTrigger = () =>
  document
    .querySelector<HTMLElement>('[data-cell-semantic-id="app-menu-trigger"]')
    ?.focus({ preventScroll: true });

export function AppMenu({ formFactor = 'desktop', splitAvailable = true }: AppMenuProps = {}) {
  const canvas = useCanvasRuntime();
  const workspace = useCanvasWorkspaceOptional();
  const { mode, setMode } = useEditorPresentation();
  const zenMode = mode === 'zen';
  const { t } = useUiI18n();
  const { canStart: canStartTour, requestStart: requestTourStart } = useOnboardingTour();
  const [clearOpen, setClearOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const githubStars = useGitHubStars(menuOpen);
  const formattedGitHubStars = useMemo(
    () => (githubStars === null ? null : new Intl.NumberFormat().format(githubStars)),
    [githubStars]
  );
  const clearLabel = t('sidebar.clear.canvas');
  const clearDescription = t('sidebar.clear.canvasDescription');
  const labels = {
    open: t('appMenu.open'),
    split: workspace?.splitEnabled ? t('action.closeSplitView') : t('action.splitView'),
    zen: t(zenMode ? 'appMenu.exitZenMode' : 'appMenu.zenMode'),
    clear: t('appMenu.clear'),
    settings: t('appMenu.settings'),
    help: t('appMenu.help'),
    guide: t('appMenu.guide'),
    documentation: t('appMenu.documentation'),
    github: `${t('appMenu.github')}${formattedGitHubStars === null ? '' : `  ${formattedGitHubStars}`}`,
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnWindowBlur = () => setMenuOpen(false);
    window.addEventListener('blur', closeOnWindowBlur);
    return () => window.removeEventListener('blur', closeOnWindowBlur);
  }, [menuOpen]);

  const onAction = (
    action: 'split' | 'zen' | 'clear' | 'settings' | 'guide' | 'documentation' | 'github'
  ) => {
    switch (action) {
      case 'split':
        window.setTimeout(() => workspace?.setSplitEnabled(!workspace.splitEnabled), 0);
        break;
      case 'zen':
        window.setTimeout(() => setMode(zenMode ? 'standard' : 'zen'), 0);
        break;
      case 'clear':
        setClearOpen(true);
        break;
      case 'settings':
        window.setTimeout(() => setSettingsOpen(true), 0);
        break;
      case 'guide':
        if (zenMode) setMode('standard');
        window.setTimeout(() => {
          if (formFactor === 'phone') setMobileGuideOpen(true);
          else requestTourStart();
        }, 0);
        break;
      case 'documentation':
        browser.openExternal('/docs');
        break;
      case 'github':
        browser.openExternal(APP_SOURCE_URL);
        break;
    }
  };

  return (
    <>
      <CellAppMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        labels={labels}
        splitAvailable={!!workspace && splitAvailable}
        guideAvailable={formFactor === 'phone' || canStartTour}
        onAction={onAction}
      />
      <RecoverableLazyBoundary
        resetKey={`${clearOpen}:${settingsOpen}:${mobileGuideOpen}`}
        onError={() => {
          setClearOpen(false);
          setSettingsOpen(false);
          setMobileGuideOpen(false);
        }}
      >
        <Suspense fallback={null}>
          {clearOpen && (
            <ClearCanvasDialog
              isCollapsed={false}
              label={clearLabel}
              description={clearDescription}
              onConfirm={canvas.commands.grid.clear}
              open={clearOpen}
              onOpenChange={setClearOpen}
              trigger={null}
            />
          )}
          {settingsOpen && (
            <SettingsDialog
              open={settingsOpen}
              onOpenChange={(open) => {
                setSettingsOpen(open);
                if (!open) window.setTimeout(focusTrigger, 0);
              }}
            />
          )}
          {mobileGuideOpen && (
            <MobileGuideDialog
              open={mobileGuideOpen}
              onOpenChange={(open) => {
                setMobileGuideOpen(open);
                if (!open) window.setTimeout(focusTrigger, 0);
              }}
            />
          )}
        </Suspense>
      </RecoverableLazyBoundary>
    </>
  );
}
