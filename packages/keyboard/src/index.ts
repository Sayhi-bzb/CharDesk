export type KeyPhase = "down" | "up";
export type KeyLocation = 0 | 1 | 2 | 3;

export type KeyModifiers = Readonly<{
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  altGraph: boolean;
}>;

export type KeyInput = Readonly<{
  type: "key";
  phase: KeyPhase;
  key: string;
  code: string;
  location: KeyLocation;
  modifiers: KeyModifiers;
  repeat: boolean;
  composing: boolean;
}>;

export type KeyInputInit = Readonly<{
  key: string;
  phase?: KeyPhase;
  code?: string;
  location?: number;
  modifiers?: Partial<KeyModifiers>;
  repeat?: boolean;
  composing?: boolean;
}>;

const normalizeLocation = (location: number | undefined): KeyLocation =>
  location === 1 || location === 2 || location === 3 ? location : 0;

export const createKeyInput = (init: KeyInputInit): KeyInput => ({
  type: "key",
  phase: init.phase ?? "down",
  key: init.key,
  code: init.code ?? "",
  location: normalizeLocation(init.location),
  modifiers: {
    alt: init.modifiers?.alt ?? false,
    ctrl: init.modifiers?.ctrl ?? false,
    meta: init.modifiers?.meta ?? false,
    shift: init.modifiers?.shift ?? false,
    altGraph: init.modifiers?.altGraph ?? false,
  },
  repeat: init.repeat ?? false,
  composing: init.composing ?? false,
});
