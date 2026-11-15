import { expect, test } from 'vitest';
import { OperationCancelled, OperationCoordinator } from './operations.ts';

test('replacement is scoped to an owner and committed outcomes survive disconnection', () => {
  const coordinator = new OperationCoordinator(), human = {}, agent = {};
  const old = coordinator.begin({ owner: human });
  const independent = coordinator.begin({ owner: agent });
  const next = coordinator.begin({ owner: human });
  expect(() => old.assertCurrent()).toThrow(OperationCancelled);
  independent.assertCurrent();
  next.assertCurrent();
  independent.commit(() => independent.effect('file:durable'));
  coordinator.cancel(agent);
  coordinator.dispose();
  expect(independent.outcome).toEqual({ committed: true, cancelled: false, effects: ['file:durable'] });
  expect(() => next.commit(() => { throw new Error('unreachable'); })).toThrow(OperationCancelled);
});

test('cancellation retains prepared effects and binding guards reject a stale publication', () => {
  const coordinator = new OperationCoordinator(), abort = new AbortController();
  const ticket = coordinator.begin({ signal: abort.signal });
  ticket.effect('file:prepared-copy');
  abort.abort();
  expect(() => ticket.commit(() => {})).toThrowError('completed effects were retained');
  expect(ticket.outcome).toEqual({ committed: false, cancelled: true, effects: ['file:prepared-copy'] });
  let current = true, published = false;
  const guarded = coordinator.begin().guard(() => current);
  current = false;
  expect(() => guarded.commit(() => { published = true; })).toThrow(OperationCancelled);
  expect(published).toBe(false);
  coordinator.dispose();
});

test('an already disconnected owner cannot start or reuse work', () => {
  const coordinator = new OperationCoordinator(), abort = new AbortController();
  abort.abort();
  expect(() => coordinator.begin({ signal: abort.signal })).toThrow(OperationCancelled);
  const ticket = coordinator.begin();
  const foreign = new OperationCoordinator();
  expect(() => foreign.begin({ ticket })).toThrow(OperationCancelled);
  foreign.dispose();
  coordinator.dispose();
  expect(() => coordinator.begin({ ticket })).toThrow(OperationCancelled);
});

test('operation scope releases failed preparation and preserves a committed result', async () => {
  const coordinator = new OperationCoordinator();
  let failed: ReturnType<OperationCoordinator['begin']> | undefined;
  await expect(coordinator.run({ owner: {} }, async (ticket) => {
    failed = ticket;
    throw new Error('prepare failed');
  })).rejects.toThrow('prepare failed');
  expect(failed!.signal.aborted).toBe(true);
  const committed = await coordinator.run({ owner: {} }, async (ticket) => {
    ticket.commit(() => ticket.effect('published'));
    return ticket;
  });
  expect(committed.outcome).toEqual({ committed: true, cancelled: false, effects: ['published'] });
  coordinator.dispose();
});

test('nested preparation retains its parent ticket until the final activation commit', async () => {
  const coordinator = new OperationCoordinator(), abort = new AbortController();
  await expect(coordinator.run({ signal: abort.signal }, async (ticket) => {
    await coordinator.run({ ticket }, async (nested) => {
      nested.publish(() => nested.effect('registered:canvas'));
    });
    ticket.assertCurrent();
    expect(ticket.outcome.committed).toBe(false);
    abort.abort();
    ticket.commit(() => { throw new Error('must not activate'); });
  })).rejects.toMatchObject({ code: 'operation_cancelled', effects: ['registered:canvas'] });
  coordinator.dispose();
});
