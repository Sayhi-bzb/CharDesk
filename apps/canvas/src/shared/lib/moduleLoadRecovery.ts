const MODULE_LOAD_RECOVERY_KEY = 'chardesk-module-load-recovery-v1';
const AUTO_RELOAD_GUARD_MS = 60_000;

const MODULE_LOAD_ERROR_PATTERN =
  /chunkloaderror|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .+ failed|unable to preload css|load failed/i;

type RecoveryEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

type ModuleLoadRecoveryOptions = {
  eventTarget?: RecoveryEventTarget;
  storage?: RecoveryStorage;
  reload?: () => void;
  now?: () => number;
};

let moduleReloadPending = false;

class ModuleLoadError extends Error {
  constructor() {
    super('A dynamically imported module did not load');
    this.name = 'ModuleLoadError';
  }
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
};

const readLastAttempt = (storage: RecoveryStorage) => {
  try {
    const value = Number(storage.getItem(MODULE_LOAD_RECOVERY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeLastAttempt = (storage: RecoveryStorage, attemptedAt: number) => {
  try {
    storage.setItem(MODULE_LOAD_RECOVERY_KEY, String(attemptedAt));
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
};

export const requireLoadedModule = <Module,>(module: Module | undefined): Module => {
  if (!module) throw new ModuleLoadError();
  return module;
};

export const isRecoverableModuleLoadError = (error: unknown) =>
  error instanceof ModuleLoadError ||
  MODULE_LOAD_ERROR_PATTERN.test(errorMessage(error));

export const isModuleReloadPending = () => moduleReloadPending;

export function installModuleLoadRecovery({
  eventTarget = window,
  storage = window.sessionStorage,
  reload = () => window.location.reload(),
  now = Date.now,
}: ModuleLoadRecoveryOptions = {}) {
  const handlePreloadError = (event: Event) => {
    const failedAt = now();
    moduleReloadPending = false;
    event.preventDefault();

    const lastAttempt = readLastAttempt(storage);
    if (lastAttempt > 0 && failedAt - lastAttempt < AUTO_RELOAD_GUARD_MS) return;

    writeLastAttempt(storage, failedAt);
    moduleReloadPending = true;
    reload();
  };

  eventTarget.addEventListener('vite:preloadError', handlePreloadError);
  return () => {
    eventTarget.removeEventListener('vite:preloadError', handlePreloadError);
    moduleReloadPending = false;
  };
}
