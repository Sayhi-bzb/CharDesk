import type { SiteToolHostAdapter } from "../contracts";
import {
  isStandardWebMcpContext,
  toWebMcpTool,
  type StandardWebMcpContext,
} from "../modelContext";

export const standardWebMcpAdapter: SiteToolHostAdapter<StandardWebMcpContext> = {
  id: "standard-webmcp",
  supports: isStandardWebMcpContext,
  async install(context, tools) {
    const controller = new AbortController();
    try {
      for (const tool of tools) {
        await context.registerTool(toWebMcpTool(
          tool,
          (input, client) => tool.execute(input, { signal: client?.signal }),
        ), { signal: controller.signal });
      }
    } catch (error) {
      controller.abort();
      throw error;
    }
    return { dispose: () => controller.abort() };
  },
};
