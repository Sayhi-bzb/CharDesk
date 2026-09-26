export const createEntityId = (prefix: string) =>
  `${prefix}-${globalThis.crypto.randomUUID()}`;
