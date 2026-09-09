import { createContext, useContext } from "react";

export type OnboardingPhase =
  | "idle"
  | "welcome"
  | "character-library"
  | "canvas-selector"
  | "create-menu"
  | "canvas-create"
  | "preparing-template"
  | "template"
  | "drag"
  | "complete";

export type OnboardingTourContextValue = {
  phase: OnboardingPhase;
  canStart: boolean;
  requestStart: () => void;
};

export const OnboardingTourContext = createContext<OnboardingTourContextValue>({
  phase: "idle",
  canStart: false,
  requestStart: () => undefined,
});

export function useOnboardingTour() {
  return useContext(OnboardingTourContext);
}
