import { readFileSync } from 'node:fs';

type EffectsExports = {
  tachyonfx_version(): number;
  read_new(): number;
  read_tick(id: number, milliseconds: number): number;
  effect_drop(id: number): void;
  effect_count(): number;
  write_new(units: number, milliseconds: number): number;
  write_tick(id: number, milliseconds: number): number;
  write_tail(id: number, index: number): number;
};
export interface ReadPulse {
  advance(milliseconds: number): number | null;
  dispose(): void;
}
export interface WriteSweep extends ReadPulse {
  tail(index: number): number;
}
export const MAX_WRITE_UNITS = 4096;
let compiled: WebAssembly.Module | undefined;

export class TachyonEffects {
  readonly #exports: EffectsExports;
  constructor() {
    compiled ??= new WebAssembly.Module(readFileSync(new URL('./tachyonfx.wasm', import.meta.url)));
    this.#exports = new WebAssembly.Instance(compiled).exports as unknown as EffectsExports;
    if (this.#exports.tachyonfx_version() !== 25_002)
      throw new Error('Unexpected TachyonFX artifact.');
  }
  get size() {
    return this.#exports.effect_count();
  }
  read(): ReadPulse {
    let id = this.#exports.read_new();
    if (!id) throw new Error('TachyonFX effect capacity reached.');
    return {
      advance: (milliseconds) => {
        if (!id) return null;
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
          throw new RangeError('Invalid effect delta.');
        const alpha = this.#exports.read_tick(id, Math.min(60_000, Math.round(milliseconds)));
        if (alpha < 0) {
          id = 0;
          return null;
        }
        return alpha;
      },
      dispose: () => {
        if (id) this.#exports.effect_drop(id);
        id = 0;
      },
    };
  }
  write(units: number, milliseconds: number): WriteSweep {
    if (
      !Number.isInteger(units) ||
      units < 1 ||
      units > MAX_WRITE_UNITS ||
      !Number.isInteger(milliseconds) ||
      milliseconds < 1 ||
      milliseconds > 15_000
    )
      throw new RangeError('Invalid write effect size or duration.');
    let id = this.#exports.write_new(units, milliseconds);
    if (!id) throw new Error('TachyonFX effect capacity reached.');
    return {
      advance: (delta) => {
        if (!id) return null;
        if (!Number.isFinite(delta) || delta < 0) throw new RangeError('Invalid effect delta.');
        const visible = this.#exports.write_tick(id, Math.min(60_000, Math.round(delta)));
        if (visible < 0) {
          id = 0;
          return null;
        }
        return visible;
      },
      tail: (index) =>
        id && Number.isInteger(index) && index >= 0 ? this.#exports.write_tail(id, index) : 0,
      dispose: () => {
        if (id) this.#exports.effect_drop(id);
        id = 0;
      },
    };
  }
}
