import type { SiteToolHostAdapter } from "../contracts";
import {
  hasRegisterTool,
  toWebMcpTool,
  type ImperativeWebMcpContext,
} from "../modelContext";

export const imperativeWebMcpAdapter: SiteToolHostAdapter<ImperativeWebMcpContext> = {
  id: "imperative-webmcp",
  supports: hasRegisterTool,
  async install(context, tools) {
    for (const tool of tools) {
      await context.registerTool(toWebMcpTool(tool, (input) => tool.execute(input)));
    }
    return { dispose: () => undefined };
  },
};
