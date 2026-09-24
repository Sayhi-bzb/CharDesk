"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasRuntime } from "@/domains/canvas/public";
import {
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
} from "@chardesk/ui";
import { useUiI18n } from "@/shared/i18n";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { browser } from "@/shared/services/effects";
import { APP_SOURCE_URL } from "@/shared/lib/constants";
import { useGitHubStars } from "./use-github-stars";
import { useCanvasWorkspaceOptional } from "@/widgets/canvas-editor/engine/CanvasWorkspace";
import { useOnboardingTour } from "@/widgets/onboarding/onboarding-context";
import {
  useEditorPresentation,
  type EditorFormFactor,
} from "@/widgets/editor-chrome/public";
import { RecoverableLazyBoundary } from "@/shared/components/RecoverableLazyBoundary";
import { requireLoadedModule } from "@/shared/lib/moduleLoadRecovery";

const AppMenuTriggerIcon = HOST_ICONOLOGY.appMenu.trigger;
const SplitViewIcon = HOST_ICONOLOGY.appMenu.splitView;
const ZenModeIcon = HOST_ICONOLOGY.appMenu.zenMode;
const HelpIcon = HOST_ICONOLOGY.appMenu.help;
const GuideIcon = HOST_ICONOLOGY.appMenu.guide;
const DocumentationIcon = HOST_ICONOLOGY.appMenu.documentation;
const GitHubIcon = HOST_ICONOLOGY.appMenu.github;
const GitHubStarIcon = HOST_ICONOLOGY.appMenu.githubStar;
const SettingsIcon = HOST_ICONOLOGY.appMenu.settings;
const ClearIcon = HOST_ICONOLOGY.appMenu.clear;
const ClearCanvasDialog = lazy(() =>
  import("@/widgets/dialogs/clear-canvas-dialog").then((loaded) => ({
    default: requireLoadedModule(loaded).ClearCanvasDialog,
  }))
);
const SettingsDialog = lazy(() =>
  import("@/widgets/dialogs/settings-dialog").then((loaded) => ({
    default: requireLoadedModule(loaded).SettingsDialog,
  }))
);
const MobileGuideDialog = lazy(() => import("@/widgets/dialogs/mobile-guide-dialog"));

type AppMenuProps = {
  formFactor?: EditorFormFactor;
  splitAvailable?: boolean;
};

export function AppMenu({
  formFactor = "desktop",
  splitAvailable = true,
}: AppMenuProps = {}) {
  const canvas = useCanvasRuntime();
  const workspace = useCanvasWorkspaceOptional();
  const { mode, setMode } = useEditorPresentation();
  const zenMode = mode === "zen";
  const clearCanvas = canvas.commands.grid.clear;
  const { t } = useUiI18n();
  const { canStart: canStartTour, requestStart: requestTourStart } =
    useOnboardingTour();
  const [clearOpen, setClearOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const githubStars = useGitHubStars(menuOpen);
  const formattedGitHubStars = useMemo(
    () =>
      githubStars === null ? null : new Intl.NumberFormat().format(githubStars),
    [githubStars]
  );
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const clearLabel = t("sidebar.clear.canvas");
  const clearDescription = t("sidebar.clear.canvasDescription");

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnWindowBlur = () => setMenuOpen(false);
    window.addEventListener("blur", closeOnWindowBlur);
    return () => window.removeEventListener("blur", closeOnWindowBlur);
  }, [menuOpen]);

  return (
    <>
      <div
        data-canvas-ui="true"
        data-testid="app-menu-host"
        className="relative z-(--layer-chrome) pointer-events-auto"
      >
            <DropdownMenu
              key={mode}
              modal={false}
              open={menuOpen}
              onOpenChange={setMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  ref={menuTriggerRef}
                  tone="subtle"
                  shape="square"
                  size="md"
                  aria-label={t("appMenu.open")}
                >
                  <AppMenuTriggerIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                className="w-48"
                aria-label={t("appMenu.open")}
              >
                <DropdownMenuGroup>
                  {workspace && splitAvailable && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setMenuOpen(false);
                        window.setTimeout(
                          () => workspace.setSplitEnabled(!workspace.splitEnabled),
                          0
                        );
                      }}
                    >
                      <SplitViewIcon />
                      {workspace.splitEnabled
                        ? t("action.closeSplitView")
                        : t("action.splitView")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      window.setTimeout(
                        () => setMode(zenMode ? "standard" : "zen"),
                        0
                      );
                    }}
                  >
                    <ZenModeIcon />
                    {t(zenMode ? "appMenu.exitZenMode" : "appMenu.zenMode")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setClearOpen(true)}
                  >
                    <ClearIcon />
                    {t("appMenu.clear")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      window.setTimeout(() => setSettingsOpen(true), 0);
                    }}
                  >
                    <SettingsIcon />
                    {t("appMenu.settings")}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <HelpIcon />
                      {t("appMenu.help")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48" aria-label={t("appMenu.help")}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          disabled={formFactor !== "phone" && !canStartTour}
                          onSelect={() => {
                            setMenuOpen(false);
                            if (zenMode) setMode("standard");
                            window.setTimeout(() => {
                              if (formFactor === "phone") {
                                setMobileGuideOpen(true);
                              } else {
                                requestTourStart();
                              }
                            }, 0);
                          }}
                        >
                          <GuideIcon />
                          {t("appMenu.guide")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => browser.openExternal("/docs")}
                        >
                          <DocumentationIcon />
                          {t("appMenu.documentation")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onSelect={() => browser.openExternal(APP_SOURCE_URL)}
                  >
                    <GitHubIcon />
                    {t("appMenu.github")}
                    {formattedGitHubStars !== null && (
                      <span className="ml-auto flex items-center gap-1 tabular-nums text-muted-foreground">
                        <GitHubStarIcon />
                        {formattedGitHubStars}
                      </span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
      </div>

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
              onConfirm={clearCanvas}
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
                if (!open) {
                  window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
                }
              }}
            />
          )}
          {mobileGuideOpen && (
            <MobileGuideDialog
              open={mobileGuideOpen}
              onOpenChange={(open) => {
                setMobileGuideOpen(open);
                if (!open) {
                  window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
                }
              }}
            />
          )}
        </Suspense>
      </RecoverableLazyBoundary>
    </>
  );
}
