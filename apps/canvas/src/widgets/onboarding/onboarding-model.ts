import {
  CANVAS_CATALOG_MARKER_KEY,
  EDITOR_PERSISTENCE_KEY,
  LEGACY_EDITOR_PERSISTENCE_KEY,
} from "@/domains/sessions/public";

export const ONBOARDING_STORAGE_KEY = "chardesk-onboarding-v1";
const LEGACY_ONBOARDING_STORAGE_KEY = "ascii-canvas-onboarding-v1";

export type OnboardingStatus = "completed" | "dismissed";

const isOnboardingStatus = (value: string | null): value is OnboardingStatus =>
  value === "completed" || value === "dismissed";

export function readOnboardingStatus(): OnboardingStatus | null {
  try {
    const current = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (isOnboardingStatus(current)) {
      window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
      return current;
    }
    const legacy = window.localStorage.getItem(LEGACY_ONBOARDING_STORAGE_KEY);
    if (!isOnboardingStatus(legacy)) return null;
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, legacy);
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === legacy) {
      window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
    }
    return legacy;
  } catch {
    return null;
  }
}

export function writeOnboardingStatus(status: OnboardingStatus) {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
  if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === status) {
    window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
  }
}

let hadEditorPersistenceAtEntry: boolean | undefined;

function hasEditorPersistence() {
  try {
    return (
      window.localStorage.getItem(EDITOR_PERSISTENCE_KEY) !== null ||
      window.localStorage.getItem(LEGACY_EDITOR_PERSISTENCE_KEY) !== null ||
      window.localStorage.getItem(CANVAS_CATALOG_MARKER_KEY) !== null
    );
  } catch {
    return false;
  }
}

export function captureOnboardingEntryState() {
  if (hadEditorPersistenceAtEntry === undefined) {
    hadEditorPersistenceAtEntry = hasEditorPersistence();
  }
}

export function hadEditorPersistenceOnEntry() {
  return hadEditorPersistenceAtEntry ?? hasEditorPersistence();
}

export function shouldAutoStartOnboarding({
  isMobile,
  hasEditorPersistence,
  status,
}: {
  isMobile: boolean;
  hasEditorPersistence: boolean;
  status: string | null;
}) {
  return !isMobile && !hasEditorPersistence && status === null;
}
