type AgentToolExecutionContext = Readonly<{
  signal?: AbortSignal;
}>;

/** Content blocks are the transport-neutral representation used by tools that
 * can return more than plain JSON text (for example a Canvas image read). */
export type AgentToolContentBlock =
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{ type: "note"; text: string }>
  | Readonly<{
      type: "image";
      mimeType: string;
      data: string;
      width: number;
      height: number;
      scale: number;
    }>;

export type AgentToolResultEnvelope<TStructured extends Record<string, unknown> = Record<string, unknown>> = Readonly<{
  structuredContent: TStructured;
  content: readonly AgentToolContentBlock[];
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
