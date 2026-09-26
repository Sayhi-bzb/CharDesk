type AgentToolExecutionContext = Readonly<{
  signal?: AbortSignal;
}>;

export type AgentToolDefinition = Readonly<{
  name: string;
  title?: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema?: Readonly<Record<string, unknown>>;
  readOnly?: boolean;
  execute: (
    input: Record<string, unknown>,
    context?: AgentToolExecutionContext,
  ) => Promise<unknown> | unknown;
}>;

export type SiteToolInstallation = Readonly<{
  dispose: () => void;
}>;

export type SiteToolHostAdapterId = "standard-webmcp" | "imperative-webmcp";

export interface SiteToolHostAdapter<Context = unknown> {
  readonly id: SiteToolHostAdapterId;
  supports(context: unknown): context is Context;
  install(
    context: Context,
    tools: readonly AgentToolDefinition[],
  ): Promise<SiteToolInstallation>;
}
