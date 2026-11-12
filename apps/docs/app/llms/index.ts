import { agentRouteMarkdown } from "@/lib/agent-routes";
import { docsHeadMarkdown } from "@/lib/docs-head";

export function loader() {
  const index = [
    "# CharDesk Development Documentation", docsHeadMarkdown(),
    "Read one contract: `/docs/llms.mdx/development/<path>/content.md`. Full corpus: `/docs/llms-full.txt`. Rich routes: `/docs/agent-routes.json`.",
    agentRouteMarkdown(),
    "## Section catalogs\n- [Architecture](/docs/development/architecture)\n- [Host UI](/docs/development/host-ui)\n- [Cell UI](/docs/development/cell-ui)",
  ].join("\n\n");

  return new Response(index, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
