import Ajv from 'ajv';
import { localToolContracts } from './contracts.mjs';
import type { AgentToolDefinition } from './types.ts';
export type { AgentToolDefinition } from './types.ts';
const validator = new Ajv({ strict: false });
const validators = new Map(
  localToolContracts.map((contract) => [contract.name, validator.compile(contract.inputSchema)])
);
export type CapabilityHost = { tools: readonly AgentToolDefinition[] };
/** One dispatch boundary shared by browser and local hosts. Transports own authentication. */
export function createCanvasCapabilities(host: CapabilityHost) {
  const tools = new Map(host.tools.map((tool) => [tool.name, tool]));
  return {
    tools: host.tools,
    async execute(
      name: string,
      input: Record<string, unknown>,
      context?: { signal?: AbortSignal }
    ) {
      context?.signal?.throwIfAborted();
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return { ok: false, code: 'invalid_input', message: 'Expected an object.' };
      const contract = localToolContracts.find((tool) => tool.name === name);
      if (!contract)
        return { ok: false, code: 'invalid_input', message: 'Unknown Canvas operation.' };
      if (!validators.get(name)!(input))
        return {
          ok: false,
          code: 'invalid_input',
          message: 'Parameters do not match the Canvas operation contract.',
        };
      if (!tools.has(name))
        return { ok: false, code: 'unsupported_capability', message: `Unavailable: ${name}` };
      return tools.get(name)!.execute(input, context);
    },
  };
}
