"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type LucideIcon, X } from "lucide-react";
import {
  SidebarHeader,
  SidebarStandard,
  SidebarTrigger,
  useSidebar,
  cn,
  ContentScrollArea,
  Button,
  SurfaceContent,
  IconButton,
  Input,
  Surface,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from "@chardesk/ui";
import { CharLibrary } from "@/widgets/character-library/char-library";
import { SearchForm } from "@/widgets/character-library/search-form";
import {
  useLibraryStore,
  type CharacterViewId,
} from "@/domains/character-library/public";
import { CanvasTemplateLibrary } from "./canvas-template-library";
import { SlideAddButton, SlideNavigator } from "./slide-navigator";
import {
  CANVAS_COMPONENT_TEMPLATES,
  CANVAS_PAGE_TEMPLATES,
} from "@/domains/canvas-templates/public";








import { useShallow } from "zustand/react/shallow";
import { useUiI18n } from "@/shared/i18n";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import {
  isStaticGridMode,
  type CanvasMode,
} from "@/domains/sessions/public";
import { useOnboardingTour } from "@/widgets/onboarding/onboarding-context";

type TemplateSidebarTab = "template" | "components";
type SlideSidebarView = "slides" | CharacterViewId;

const TEMPLATE_SIDEBAR_TABS: Array<{
  id: TemplateSidebarTab;
  labelKey: "sidebar.tab.template" | "sidebar.tab.components";
  icon: LucideIcon;
}> = [
  {
    id: "components",
    labelKey: "sidebar.tab.components",
    icon: HOST_ICONOLOGY.templateView.components,
  },
  {
    id: "template",
    labelKey: "sidebar.tab.template",
    icon: HOST_ICONOLOGY.templateView.template,
  },
];

type SidebarView<ViewId extends string> = {
  id: ViewId;
  label: string;
  icon: LucideIcon;
};

const CHARACTER_VIEWS = [
  { id: "essentials", labelKey: "character.view.essentials", icon: HOST_ICONOLOGY.characterView.essentials },
  { id: "nerd", labelKey: "character.view.nerd", icon: HOST_ICONOLOGY.characterView.nerd },
  { id: "emoji", labelKey: "character.view.emoji", icon: HOST_ICONOLOGY.characterView.emoji },
  { id: "unicode", labelKey: "character.view.unicode", icon: HOST_ICONOLOGY.characterView.unicode },
] as const;

type FreeformSidebarView = CharacterViewId | TemplateSidebarTab;

const isCharacterView = (view: FreeformSidebarView): view is CharacterViewId =>
  CHARACTER_VIEWS.some(({ id }) => id === view);

function SidebarViewRail<ViewId extends string>({
  views,
  activeView,
  orientation,
  onSelect,
  ariaLabel,
  testIdPrefix,
}: {
  views: ReadonlyArray<SidebarView<ViewId>>;
  activeView: ViewId;
  orientation: "horizontal" | "vertical";
  onSelect: (view: ViewId) => void;
  ariaLabel: string;
  testIdPrefix: string;
}) {
  const tooltipHandle = useMemo(
    () => TooltipCreateHandle<ReactNode>(),
    []
  );

  return (
    <Surface kind="embedded" asChild>
      <nav
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={orientation}
        data-onboarding-target={
          testIdPrefix === "character" ? "character-library" : undefined
        }
        data-testid={`${testIdPrefix}-view-rail-${orientation}`}
        className={cn(
          "flex p-1",
          orientation === "vertical"
            ? "w-full flex-col items-center gap-1"
            : "w-full items-center justify-center gap-1"
        )}
      >
      {views.map((view) => {
        const Icon = view.icon;
        const isActive = activeView === view.id;
        return (
          <TooltipTrigger
            key={view.id}
            handle={tooltipHandle}
            payload={view.label}
            render={
              <Button
                type="button"
                tone="subtle"
                shape="square"
                size="md"
                active={isActive}
                role="tab"
                aria-selected={isActive}
                aria-label={view.label}
                onClick={() => onSelect(view.id)}
              />
            }
            className={cn(
              "relative",
              orientation === "vertical"
                ? "after:absolute after:top-0 after:left-full after:h-full after:w-1 after:content-['']"
                : "after:absolute after:top-full after:left-0 after:h-1 after:w-full after:content-['']"
            )}
          >
            <Icon />
          </TooltipTrigger>
        );
      })}
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => (
          <TooltipPopup
            side={orientation === "vertical" ? "right" : "bottom"}
          >
            {payload}
          </TooltipPopup>
        )}
      </Tooltip>
      </nav>
    </Surface>
  );
}

type SidebarCanvasMode = Exclude<CanvasMode, "blackboard">;

export function SidebarRight({
  canvasMode,
  readOnly = false,
}: {
  canvasMode: SidebarCanvasMode;
  readOnly?: boolean;
}) {

  const { loadMainPacks, searchUnicode, unicodeSearchLoading } =
    useLibraryStore(
      useShallow((library) => ({
        loadMainPacks: library.loadMainPacks,
        searchUnicode: library.searchUnicode,
        unicodeSearchLoading: library.unicodeSearchLoading,
      }))
    );
  const { state, isMobile, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const { t } = useUiI18n();
  const { phase: onboardingPhase } = useOnboardingTour();
  const [activeFreeformView, setActiveFreeformView] =
    useState<FreeformSidebarView>("components");
  const [templateQuery, setTemplateQuery] = useState("");
  const [activeSlideView, setActiveSlideView] =
    useState<SlideSidebarView>("slides");
  const [unicodeQuery, setUnicodeQuery] = useState("");
  const navigationOnly = canvasMode === "slide" && readOnly;
  const templateSearchRef = useRef<HTMLInputElement>(null);
  const characterViews: ReadonlyArray<SidebarView<CharacterViewId>> =
    CHARACTER_VIEWS.map((view) => ({
      id: view.id,
      label: t(view.labelKey),
      icon: view.icon,
    }));
  const slideViews: ReadonlyArray<SidebarView<SlideSidebarView>> = [
    { id: "slides", label: t("slide.sidebar.title"), icon: HOST_ICONOLOGY.canvasMode.slide },
    ...characterViews,
  ];
  const templateViews = TEMPLATE_SIDEBAR_TABS.map((view) => ({
    id: view.id,
    label: t(view.labelKey),
    icon: view.icon,
  }));
  const freeformViews: ReadonlyArray<SidebarView<FreeformSidebarView>> = [
    ...templateViews,
    ...characterViews,
  ];
  const activeFreeformViewMeta =
    freeformViews.find((view) => view.id === activeFreeformView) ??
    freeformViews[0];
  const orientation = isMobile ? "horizontal" : "vertical";
  const templateLibrary =
    activeFreeformView === "template"
      ? {
          templates: CANVAS_PAGE_TEMPLATES,
          emptyLabel: t("sidebar.empty.templates"),
        }
      : {
          templates: CANVAS_COMPONENT_TEMPLATES,
          emptyLabel: t("sidebar.empty.components"),
        };

  useEffect(() => {
    if (!isStaticGridMode(canvasMode) || navigationOnly) return;
    void loadMainPacks();
  }, [canvasMode, loadMainPacks, navigationOnly]);

  useEffect(() => {
    if (onboardingPhase !== "character-library") return;
    setOpen(true);
  }, [onboardingPhase, setOpen]);

  useEffect(() => {
    if (onboardingPhase !== "preparing-template") return;
    const timeoutId = window.setTimeout(() => {
    setActiveFreeformView("components");
    setTemplateQuery("");
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [onboardingPhase, setOpen]);

  const selectFreeformView = (view: FreeformSidebarView) => {
    setActiveFreeformView(view);
    if (isCollapsed) setOpen(true);
  };

  const selectSlideView = (view: SlideSidebarView) => {
    setActiveSlideView(view);
    if (isCollapsed) setOpen(true);
  };

  function renderCharacterPanel(
    view: CharacterViewId,
    label: string
  ): ReactNode {
    return (
      <div
        role="tabpanel"
        aria-label={t("sidebar.characterPanel", {
          name: label,
        })}
      >
        <CharLibrary view={view} />
      </div>
    );
  }

  function renderSearchForm(view: CharacterViewId): ReactNode {
    return (
      <SearchForm
        view={view}
        unicodeQuery={unicodeQuery}
        unicodeLoading={unicodeSearchLoading}
        onUnicodeQueryChange={setUnicodeQuery}
        onUnicodeSubmit={() => void searchUnicode(unicodeQuery)}
        className="min-w-0 flex-1"
      />
    );
  }

  let viewRail: ReactNode;
  let viewContent: ReactNode;
  let headerContent: ReactNode;

  switch (canvasMode) {
    case "freeform":
      viewRail = (
        <SidebarViewRail
          views={freeformViews}
          activeView={activeFreeformView}
          orientation={orientation}
          onSelect={selectFreeformView}
          ariaLabel={t("sidebar.characterViews")}
          testIdPrefix="freeform"
        />
      );
      if (isCharacterView(activeFreeformView)) {
        viewContent = renderCharacterPanel(
          activeFreeformView,
          activeFreeformViewMeta.label
        );
        headerContent = renderSearchForm(activeFreeformView);
      } else {
        viewContent = (
          <SurfaceContent role="tabpanel" aria-label={activeFreeformViewMeta.label}>
            <CanvasTemplateLibrary
              templates={templateLibrary.templates}
              query={templateQuery}
              emptyLabel={templateLibrary.emptyLabel}
            />
          </SurfaceContent>
        );
        headerContent = (
          <div className="relative min-w-0 flex-1">
            <Input
              ref={templateSearchRef}
              type="search"
              aria-label={t("sidebar.search.templates")}
              value={templateQuery}
              onChange={(event) => setTemplateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !templateQuery) return;
                event.preventDefault();
                event.stopPropagation();
                setTemplateQuery("");
              }}
              placeholder={t("sidebar.search.placeholder")}
              appearance="search"
              className="h-8 w-full px-2 pr-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {templateQuery ? (
              <IconButton
                type="button"
                size="xs"
                aria-label={t("search.clear")}
                onClick={() => {
                  setTemplateQuery("");
                  templateSearchRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                <X />
              </IconButton>
            ) : null}
          </div>
        );
      }
      break;
    case "slide": {
      if (navigationOnly) {
        viewRail = null;
        viewContent = <SlideNavigator readOnly />;
        headerContent = (
          <span className="truncate text-sm font-medium">
            {t("slide.sidebar.title")}
          </span>
        );
        break;
      }
      viewRail = (
        <SidebarViewRail
          views={slideViews}
          activeView={activeSlideView}
          orientation={orientation}
          onSelect={selectSlideView}
          ariaLabel={t("slide.sidebar.title")}
          testIdPrefix="slide"
        />
      );
      if (activeSlideView === "slides") {
        viewContent = <SlideNavigator />;
        headerContent = <SlideAddButton />;
        break;
      }
      const activeSlideViewMeta = slideViews.find(
        (view) => view.id === activeSlideView
      );
      viewContent = renderCharacterPanel(
        activeSlideView,
        activeSlideViewMeta?.label ?? ""
      );
      headerContent = renderSearchForm(activeSlideView);
      break;
    }
  }

  const sidebarBody = (
    <div
      data-testid="sidebar-mode-layout"
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-hidden",
        navigationOnly
          ? "flex flex-col"
          : isMobile
          ? "flex flex-col"
          : "grid grid-cols-[var(--sidebar-width-icon)_minmax(0,1fr)]"
      )}
    >
      {!navigationOnly ? (
        <div
          data-testid="sidebar-view-rail-column"
          className={cn(
            "shrink-0",
            isMobile
              ? "p-1 pb-0"
              : "col-start-1 row-start-1 px-0 py-1"
          )}
        >
          {viewRail}
        </div>
      ) : null}
      <ContentScrollArea
        data-testid="sidebar-view-content"
        aria-hidden={isCollapsed || undefined}
        inert={isCollapsed || undefined}
        viewportClassName={!isMobile ? "[&>div]:!block" : undefined}
        contentClassName={!isMobile ? "min-w-0 pr-1" : undefined}
        className={cn(
          "min-h-0 min-w-0 flex-1 transition-opacity duration-[var(--motion-standard)] motion-reduce:transition-none",
          !isMobile && !navigationOnly && "col-start-2 row-start-1",
          isCollapsed
            ? "pointer-events-none opacity-0"
            : "opacity-100"
        )}
      >
        {isCollapsed ? null : viewContent}
      </ContentScrollArea>
    </div>
  );

  return (
    <SidebarStandard
      variant="floating"
      side="right"
      collapsedAppearance="trigger"
      contentScroll="none"
      className="pointer-events-auto"
      data-canvas-ui="true"
      contentClassName="min-h-0 gap-0 overflow-hidden p-0"
      header={
        <SidebarHeader
          className={cn(
            "h-12 shrink-0 items-center py-0",
            isMobile
              ? "flex flex-row gap-2 px-3"
              : "grid grid-cols-[var(--sidebar-width-icon)_minmax(0,1fr)] gap-0 px-0"
          )}
        >
          <div
            data-testid="sidebar-header-content"
            aria-hidden={isCollapsed || undefined}
            inert={isCollapsed || undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center overflow-hidden py-px transition-[opacity,transform] duration-[var(--motion-standard)] ease-out motion-reduce:transition-none motion-reduce:transform-none",
              !isMobile && "col-start-2 row-start-1 pl-2 pr-3",
              isCollapsed
                ? "pointer-events-none translate-x-2 opacity-0"
                : "translate-x-0 opacity-100 delay-[60ms]"
            )}
          >
            {headerContent}
          </div>
          <div
            data-testid="sidebar-toggle-column"
            className={cn(
              "flex h-full items-center justify-center",
              !isMobile && "col-start-1 row-start-1",
              isCollapsed && "pointer-events-auto"
            )}
          >
            <SidebarTrigger
              side="right"
              aria-label={t("sidebar.toggle")}
              className="shrink-0"
            />
          </div>
        </SidebarHeader>
      }
    >
      {sidebarBody}
    </SidebarStandard>
  );
}
