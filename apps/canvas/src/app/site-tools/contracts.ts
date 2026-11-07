import type { AgentToolDefinition } from '@chardesk/canvas-capabilities/types';
export type {
  AgentToolDefinition,
  AgentToolContentBlock,
  AgentToolExecutionContext,
} from '@chardesk/canvas-capabilities/types';

export type SiteToolInstallation = Readonly<{
  dispose: () => void;
}>;

export type SiteToolHostAdapterId = 'standard-webmcp' | 'imperative-webmcp';

export interface SiteToolHostAdapter<Context = unknown> {
  readonly id: SiteToolHostAdapterId;
  supports(context: unknown): context is Context;
  install(context: Context, tools: readonly AgentToolDefinition[]): Promise<SiteToolInstallation>;
}
