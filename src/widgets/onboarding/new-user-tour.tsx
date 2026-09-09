"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCanvasState } from "@/domains/canvas/public";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useUiI18n } from "@/shared/i18n";
import { feedback } from "@/shared/services/effects";

import {
  OnboardingTourContext,
  type OnboardingPhase,
  type OnboardingTourContextValue,
} from "./onboarding-context";
import {
  hadEditorPersistenceOnEntry,
  readOnboardingStatus,
  shouldAutoStartOnboarding,
  writeOnboardingStatus,
  type OnboardingStatus,
} from "./onboarding-model";
import {
  createOnboardingDriver,
  type OnboardingDriver,
  type OnboardingStep,
} from "./driver-adapter";

type Translate = ReturnType<typeof useUiI18n>["t"];

const writeStatus = (status: OnboardingStatus) => {
  try {
    writeOnboardingStatus(status);
  } catch {
    // The tour still works when storage is unavailable; it may be offered again.
  }
};

const waitForElement = (selector: string, timeout = 5000) =>
  new Promise<Element>((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve(element);
    });
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Missing onboarding target: ${selector}`));
    }, timeout);

    observer.observe(document.body, { childList: true, subtree: true });
  });

type TourActions = {
  setPhase: (phase: OnboardingPhase) => void;
  moveNext: () => void;
  finish: () => void;
  captureSessionBaseline: () => void;
};

function buildTourSteps(
  t: Translate,
  actions: TourActions,
  includeCharacterLibrary: boolean
): OnboardingStep[] {
  const actionStep = (
    element: string,
    phase: OnboardingPhase,
    title: string,
    description: string,
    options: Partial<OnboardingStep> = {}
  ): OnboardingStep => ({
    element,
    waitForElement: 5000,
    advanceOnClick: true,
    onHighlighted: () => actions.setPhase(phase),
    popover: {
      title,
      description,
      side: "bottom",
      align: "start",
      showButtons: ["close"],
    },
    ...options,
  });

  return [
    {
      onHighlighted: () => actions.setPhase("welcome"),
      popover: {
        title: t("onboarding.welcome.title"),
        description: t("onboarding.welcome.description"),
        showButtons: ["next", "close"],
        onNextClick: actions.moveNext,
      },
    },
    ...(includeCharacterLibrary
      ? [
          {
            element: '[data-onboarding-target="character-library"]',
            waitForElement: 5000,
            onHighlighted: () => actions.setPhase("character-library"),
            popover: {
              title: t("onboarding.characterLibrary.title"),
              description: t("onboarding.characterLibrary.description"),
              side: "left" as const,
              align: "center" as const,
              showButtons: ["next", "close"] as Array<"next" | "close">,
              onNextClick: actions.moveNext,
            },
          },
        ]
      : []),
    actionStep(
      '[data-onboarding-target="canvas-selector"]',
      "canvas-selector",
      t("onboarding.canvasSelector.title"),
      t("onboarding.canvasSelector.description")
    ),
    actionStep(
      '[data-onboarding-target="create-menu"]',
      "create-menu",
      t("onboarding.createMenu.title"),
      t("onboarding.createMenu.description"),
      { popover: {
        title: t("onboarding.createMenu.title"),
        description: t("onboarding.createMenu.description"),
        side: "right",
        align: "start",
        showButtons: ["close"],
      } }
    ),
    actionStep(
      '[data-onboarding-target="create-freeform"]',
      "canvas-create",
      t("session.newFreeform"),
      t("onboarding.template.description"),
      {
        onHighlighted: () => {
          actions.captureSessionBaseline();
          actions.setPhase("canvas-create");
        },
        popover: {
          title: t("session.newFreeform"),
          description: t("onboarding.template.description"),
          side: "right",
          align: "start",
          showButtons: ["close"],
        },
      }
    ),
    {
      element: '[data-onboarding-template-id="button"]',
      waitForElement: 5000,
      onHighlighted: () => actions.setPhase("template"),
      popover: {
        title: t("onboarding.template.title"),
        description: t("onboarding.template.description"),
        side: "left",
        align: "center",
        showButtons: ["next", "close"],
        onNextClick: actions.moveNext,
      },
    },
    {
      element: '[data-onboarding-template-id="button"]',
      waitForElement: 5000,
      onHighlighted: () => {
        actions.setPhase("drag");
      },
      popover: {
        title: t("onboarding.drag.title"),
        description: t("onboarding.drag.description"),
        side: "left",
        align: "center",
        showButtons: ["next", "close"],
        nextBtnText: t("onboarding.skip"),
        onNextClick: actions.moveNext,
      },
    },
    {
      onHighlighted: () => actions.setPhase("complete"),
      popover: {
        title: t("onboarding.complete.title"),
        description: t("onboarding.complete.description"),
        showButtons: ["next", "close"],
        doneBtnText: t("onboarding.done"),
        onDoneClick: actions.finish,
      },
    },
  ];
}

export function OnboardingTourProvider({
  children,
  autoStart = true,
}: {
  children: ReactNode;
  autoStart?: boolean;
}) {
  const isMobile = useIsMobile();
  const { t } = useUiI18n();
  const canvasMode = useCanvasState((state) => state.canvasMode);
  const activeCanvasId = useCanvasState((state) => state.activeCanvasId);
  const [phase, setPhase] = useState<OnboardingPhase>("idle");
  const driverRef = useRef<OnboardingDriver | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const tRef = useRef(t);
  const activeCanvasIdRef = useRef(activeCanvasId);
  const sessionBaselineRef = useRef<string | null>(null);
  const autoStartCheckedRef = useRef(false);
  const initialHasPersistenceRef = useRef(hadEditorPersistenceOnEntry());

  useEffect(() => {
    tRef.current = t;
    activeCanvasIdRef.current = activeCanvasId;
  }, [activeCanvasId, t]);

  const cleanRuntime = useCallback(() => {
    driverRef.current = null;
    loadingRef.current = false;
    document.documentElement.removeAttribute("data-onboarding-phase");
    if (mountedRef.current) setPhase("idle");
  }, []);

  const endTour = useCallback(
    (status: OnboardingStatus) => {
      writeStatus(status);
      const currentDriver = driverRef.current;
      if (currentDriver?.isActive()) currentDriver.destroy();
      else cleanRuntime();
    },
    [cleanRuntime]
  );

  const createSteps = useCallback(
    (translate: Translate) =>
      buildTourSteps(translate, {
        setPhase,
        moveNext: () => driverRef.current?.moveNext(),
        finish: () => endTour("completed"),
        captureSessionBaseline: () => {
          sessionBaselineRef.current = activeCanvasIdRef.current;
        },
      },
      canvasMode === "freeform"
    ),
    [canvasMode, endTour]
  );

  const startTour = useCallback(async () => {
    if (isMobile || loadingRef.current || driverRef.current?.isActive()) return;
    loadingRef.current = true;

    try {
      await waitForElement('[data-onboarding-target="canvas"]');
      const driverInstance = await createOnboardingDriver({
        steps: createSteps(tRef.current),
        progressText: tRef.current("onboarding.progress"),
        nextButtonText: tRef.current("onboarding.next"),
        doneButtonText: tRef.current("onboarding.done"),
        onClose: () => endTour("dismissed"),
        onDestroyed: cleanRuntime,
      });
      if (!mountedRef.current) {
        driverInstance.destroy();
        return;
      }
      driverRef.current = driverInstance;
      loadingRef.current = false;
      driverInstance.drive();
    } catch (error) {
      console.error("Failed to start onboarding tour", error);
      cleanRuntime();
      feedback.error(tRef.current("onboarding.unavailable"));
    }
  }, [cleanRuntime, createSteps, endTour, isMobile]);

  const requestStart = useCallback(() => {
    void startTour();
  }, [startTour]);

  useEffect(() => {
    if (
      phase !== "canvas-create" ||
      activeCanvasId === sessionBaselineRef.current
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => setPhase("preparing-template"), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeCanvasId, canvasMode, phase]);

  useEffect(() => {
    if (phase !== "character-library") return;
    const timeoutId = window.setTimeout(() => {
      driverRef.current?.refresh();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") {
      document.documentElement.removeAttribute("data-onboarding-phase");
    } else {
      document.documentElement.setAttribute("data-onboarding-phase", phase);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      endTour("dismissed");
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [endTour, phase]);

  useEffect(() => {
    if (!autoStart || autoStartCheckedRef.current) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled || autoStartCheckedRef.current) return;
      autoStartCheckedRef.current = true;
      if (
        shouldAutoStartOnboarding({
          isMobile,
          hasEditorPersistence: initialHasPersistenceRef.current,
          status: readOnboardingStatus(),
        })
      ) {
        void startTour();
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [autoStart, isMobile, startTour]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      document.documentElement.removeAttribute("data-onboarding-phase");
      driverRef.current?.destroy();
    };
  }, []);

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      phase,
      canStart: !isMobile,
      requestStart,
    }),
    [isMobile, phase, requestStart]
  );

  return (
    <OnboardingTourContext.Provider value={value}>
      {children}
    </OnboardingTourContext.Provider>
  );
}
