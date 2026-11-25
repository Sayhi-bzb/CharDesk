import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { TachyonEffects } from '../../../packages/terminal/src/tachyonfx.ts';

test('the shipped TachyonFX WASM needs no host imports and owns the read pulse timing', () => {
  const module = new WebAssembly.Module(readFileSync(new URL('./tachyonfx.wasm', import.meta.url)));
  expect(WebAssembly.Module.imports(module)).toEqual([]);
  const effects = new TachyonEffects();
  const pulse = effects.read();
  expect(pulse.advance(0)).toBe(0);
  expect(pulse.advance(90)).toBeGreaterThan(0);
  expect(pulse.advance(90)).toBe(1);
  expect(pulse.advance(280)).toBe(1);
  const fading = pulse.advance(370)!;
  expect(fading).toBeGreaterThan(0);
  expect(fading).toBeLessThan(1);
  expect(pulse.advance(370)).toBeNull();
  expect(effects.size).toBe(0);
  pulse.dispose();
  expect(pulse.advance(0)).toBeNull();
});

test('TachyonFX instances are isolated, bounded and release completed or cancelled effects', () => {
  const one = new TachyonEffects(),
    two = new TachyonEffects();
  const pulses = Array.from({ length: 8 }, () => one.read());
  expect(() => one.read()).toThrow('capacity');
  expect(two.size).toBe(0);
  expect(() => pulses[0]!.advance(NaN)).toThrow(RangeError);
  expect(() => pulses[0]!.advance(-1)).toThrow(RangeError);
  expect(one.size).toBe(8);
  pulses[0]!.dispose();
  expect(one.size).toBe(7);
  const replacement = one.read();
  replacement.advance(60_000);
  for (const pulse of pulses) pulse.dispose();
  expect(one.size).toBe(0);
});

test('real TachyonFX write sweeps reveal monotonically and leave a fading tail', () => {
  const effects = new TachyonEffects();
  const sweep = effects.write(10, 1000);
  expect(sweep.advance(0)).toBe(0);
  expect(sweep.tail(0)).toBe(0);
  let previous = 0;
  for (let i = 0; i < 10; i++) {
    const visible = sweep.advance(100)!;
    expect(visible).toBeGreaterThanOrEqual(previous);
    previous = visible;
  }
  expect(previous).toBe(10);
  const tail = sweep.tail(9);
  expect(tail).toBeGreaterThan(0);
  expect(tail).toBeLessThan(1);
  expect(sweep.tail(10)).toBe(0);
  expect(sweep.advance(350)).toBe(10);
  expect(sweep.tail(9)).toBeLessThan(tail);
  expect(sweep.advance(350)).toBeNull();
  expect(effects.size).toBe(0);
  expect(sweep.tail(0)).toBe(0);
});

test('write sweeps share bounded ownership with reads and validate their dimensions', () => {
  const effects = new TachyonEffects();
  for (const [units, duration] of [
    [0, 1000],
    [4097, 1000],
    [1.5, 1000],
    [1, 0],
    [1, 15001],
  ])
    expect(() => effects.write(units!, duration!)).toThrow(RangeError);
  const sweeps = Array.from({ length: 8 }, () => effects.write(1, 1000));
  expect(() => effects.read()).toThrow('capacity');
  expect(() => sweeps[0]!.advance(NaN)).toThrow(RangeError);
  for (const sweep of sweeps) sweep.dispose();
  expect(effects.size).toBe(0);
});

test('a full read camera fits the real write mask and completes its accelerated reveal', () => {
  const effects = new TachyonEffects();
  const sweep = effects.write(4000, 9000);
  expect(sweep.advance(4500)).toBe(2000);
  expect(sweep.advance(4500)).toBe(4000);
  expect(sweep.tail(3999)).toBeGreaterThan(0);
  expect(sweep.advance(700)).toBeNull();
  expect(effects.size).toBe(0);
});
