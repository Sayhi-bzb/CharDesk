import { AssertionError } from 'node:assert/strict';
import { architectureProbes } from '../architectureProbes.ts';

  let failures = 0;
  for (const { id, run } of architectureProbes) {
    try {
      await run();
      console.log(JSON.stringify({ id, status: 'passed' }));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ id,
        status: error instanceof AssertionError ? 'invariant_failed' : 'setup_failed',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  process.exitCode = failures ? 1 : 0;
