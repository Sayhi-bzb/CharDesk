import type { AgentToolDefinition } from "./contracts";

type WebMcpExecutionClient = Readonly<{
  signal?: AbortSignal;
}>;

export type WebMcpTool = Readonly<{
  name: string;
  title?: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema?: Readonly<Record<string, unknown>>;
  annotations?: Readonly<{ readOnlyHint?: boolean }>;
  execute: (
    input: Record<string, unknown>,
    client?: WebMcpExecutionClient,
  ) => Promise<unknown> | unknown;
}>;

export type ImperativeWebMcpContext = Readonly<{
  registerTool: (tool: WebMcpTool) => Promise<unknown> | unknown;
}>;

export type StandardWebMcpContext = ImperativeWebMcpContext & Readonly<{
  registerTool: (
    tool: WebMcpTool,
    options?: Readonly<{ signal?: AbortSignal }>,
  ) => Promise<unknown> | unknown;
  getTools: (...args: unknown[]) => Promise<unknown> | unknown;
  executeTool?: (...args: unknown[]) => Promise<unknown> | unknown;
}>;

export const getDocumentModelContext = (target: Document): unknown =>
  (target as Document & { modelContext?: unknown }).modelContext;

export const hasRegisterTool = (context: unknown): context is ImperativeWebMcpContext =>
  typeof context === "object" && context !== null &&
  typeof (context as { registerTool?: unknown }).registerTool === "function";

export const isStandardWebMcpContext = (
  context: unknown,
): context is StandardWebMcpContext =>
  hasRegisterTool(context) &&
  typeof (context as { getTools?: unknown }).getTools === "function";

const toWebMcpAnnotations = (tool: AgentToolDefinition) =>
  tool.readOnly === undefined ? undefined : { readOnlyHint: tool.readOnly };

export const toWebMcpTool = (
  tool: AgentToolDefinition,
  execute: WebMcpTool["execute"],
): WebMcpTool => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  annotations: toWebMcpAnnotations(tool),
  execute,
});
