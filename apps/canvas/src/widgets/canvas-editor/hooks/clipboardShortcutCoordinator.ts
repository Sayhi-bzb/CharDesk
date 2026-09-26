export type ClipboardShortcutAction = 'copy' | 'cut' | 'paste';

export type ClipboardShortcutTrace = {
  attemptId: number | null;
  actionId: ClipboardShortcutAction;
  stage:
    | 'keydown'
    | 'fallback-scheduled'
    | 'fallback-dispatched'
    | 'native-dispatched'
    | 'native-suppressed';
  elapsedMs: number;
};

type AttemptPhase =
  | 'waiting-native'
  | 'fallback-dispatched'
  | 'native-dispatched';

type ShortcutAttempt = {
  id: number;
  actionId: ClipboardShortcutAction;
  phase: AttemptPhase;
  startedAt: number;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
};

type ClipboardShortcutCoordinatorOptions = {
  fallbackDelayMs?: number;
  dedupeWindowMs?: number;
  now?: () => number;
  onFallback?: (actionId: ClipboardShortcutAction) => void;
  onTrace?: (trace: ClipboardShortcutTrace) => void;
};

type ClipboardShortcutCoordinator = {
  begin: (actionId: ClipboardShortcutAction) => void;
  handleNative: (actionId: ClipboardShortcutAction) => 'dispatch' | 'suppress';
  setFallbackHandler: (
    handler: ((actionId: ClipboardShortcutAction) => void) | undefined
  ) => void;
  setTraceHandler: (
    handler: ((trace: ClipboardShortcutTrace) => void) | undefined
  ) => void;
  dispose: () => void;
};

const DEFAULT_FALLBACK_DELAY_MS = 150;
const DEFAULT_DEDUPE_WINDOW_MS = 1_000;

export const createClipboardShortcutCoordinator = ({
  fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS,
  dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
  now = () => performance.now(),
  onFallback,
  onTrace,
}: ClipboardShortcutCoordinatorOptions): ClipboardShortcutCoordinator => {
  let nextAttemptId = 1;
  let activeAttempt: ShortcutAttempt | null = null;
  let fallbackHandler = onFallback;
  let traceHandler = onTrace;

  const trace = (
    attempt: ShortcutAttempt | null,
    actionId: ClipboardShortcutAction,
    stage: ClipboardShortcutTrace['stage']
  ) => {
    traceHandler?.({
      attemptId: attempt?.id ?? null,
      actionId,
      stage,
      elapsedMs: attempt ? Math.max(0, now() - attempt.startedAt) : 0,
    });
  };

  const clearAttemptTimers = (attempt: ShortcutAttempt) => {
    if (attempt.fallbackTimer !== null) {
      clearTimeout(attempt.fallbackTimer);
      attempt.fallbackTimer = null;
    }
    if (attempt.expiryTimer !== null) {
      clearTimeout(attempt.expiryTimer);
      attempt.expiryTimer = null;
    }
  };

  const expireAttemptLater = (attempt: ShortcutAttempt) => {
    if (attempt.expiryTimer !== null) clearTimeout(attempt.expiryTimer);
    attempt.expiryTimer = setTimeout(() => {
      if (activeAttempt === attempt) activeAttempt = null;
    }, dedupeWindowMs);
  };

  const begin = (actionId: ClipboardShortcutAction) => {
    if (activeAttempt) clearAttemptTimers(activeAttempt);
    const attempt: ShortcutAttempt = {
      id: nextAttemptId++,
      actionId,
      phase: 'waiting-native',
      startedAt: now(),
      fallbackTimer: null,
      expiryTimer: null,
    };
    activeAttempt = attempt;
    trace(attempt, actionId, 'keydown');
    trace(attempt, actionId, 'fallback-scheduled');
    attempt.fallbackTimer = setTimeout(() => {
      if (activeAttempt !== attempt || attempt.phase !== 'waiting-native') return;
      attempt.fallbackTimer = null;
      attempt.phase = 'fallback-dispatched';
      trace(attempt, actionId, 'fallback-dispatched');
      fallbackHandler?.(actionId);
      expireAttemptLater(attempt);
    }, fallbackDelayMs);
  };

  const handleNative = (actionId: ClipboardShortcutAction) => {
    const attempt = activeAttempt;
    if (!attempt || attempt.actionId !== actionId) {
      trace(null, actionId, 'native-dispatched');
      return 'dispatch' as const;
    }

    if (attempt.phase === 'waiting-native') {
      if (attempt.fallbackTimer !== null) {
        clearTimeout(attempt.fallbackTimer);
        attempt.fallbackTimer = null;
      }
      attempt.phase = 'native-dispatched';
      trace(attempt, actionId, 'native-dispatched');
      expireAttemptLater(attempt);
      return 'dispatch' as const;
    }

    trace(attempt, actionId, 'native-suppressed');
    return 'suppress' as const;
  };

  const dispose = () => {
    if (activeAttempt) clearAttemptTimers(activeAttempt);
    activeAttempt = null;
    fallbackHandler = undefined;
    traceHandler = undefined;
  };

  const setFallbackHandler = (
    handler: ((actionId: ClipboardShortcutAction) => void) | undefined
  ) => {
    fallbackHandler = handler;
  };

  const setTraceHandler = (
    handler: ((trace: ClipboardShortcutTrace) => void) | undefined
  ) => {
    traceHandler = handler;
  };

  return {
    begin,
    handleNative,
    setFallbackHandler,
    setTraceHandler,
    dispose,
  };
};
