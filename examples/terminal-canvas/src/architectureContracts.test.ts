import { test } from 'bun:test';
import { architectureProbes } from './architectureProbes.ts';

for (const { id, run } of architectureProbes) test(`architecture contract: ${id}`, run);
