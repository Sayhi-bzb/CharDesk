import type { DriveStep } from "driver.js";
import { readUiRuntimeTheme } from "@chardesk/ui";

export type OnboardingStep = DriveStep;
export type OnboardingDriver = Awaited<ReturnType<typeof createOnboardingDriver>>;

type CreateOnboardingDriverOptions = {
  steps: OnboardingStep[];
  progressText: string;
  nextButtonText: string;
  doneButtonText: string;
  onClose: () => void;
  onDestroyed: () => void;
};

export async function createOnboardingDriver({
  steps,
  progressText,
  nextButtonText,
  doneButtonText,
  onClose,
  onDestroyed,
}: CreateOnboardingDriverOptions) {
  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);
  const theme = readUiRuntimeTheme(document.body);

  const instance = driver({
    animate: !theme.motion.reduced,
    duration: theme.motion.reduced ? 0 : theme.motion.slowMs,
    overlayColor: theme.host.overlay,
    overlayOpacity: 1,
    stagePadding: 6,
    stageRadius: theme.surface.radiusPx,
    popoverClass: "chardesk-onboarding",
    popoverOffset: 10,
    showProgress: true,
    progressText,
    nextBtnText: nextButtonText,
    doneBtnText: doneButtonText,
    allowClose: true,
    allowScroll: false,
    allowKeyboardControl: true,
    overlayClickBehavior: () => undefined,
    onCloseClick: onClose,
    onDestroyed,
  });
  instance.setSteps(steps);
  return instance;
}
