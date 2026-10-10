import routeManifest from "../../content/agent-routes.json";

type AgentRoute = (typeof routeManifest.routes)[number];

export const AGENT_ROUTE_MANIFEST = routeManifest;

export function agentRouteMarkdown() {
  const lines = ["## Agent route map", ""];

  for (const route of routeManifest.routes as AgentRoute[]) {
    lines.push(`- **${route.id}** — ${route.when.join("; ")}`);
    lines.push(`  - Keywords: ${route.keywords.join(", ")}`);
    lines.push(`  - Identifiers: ${route.identifiers.join(", ")}`);
    lines.push(`  - Boundary: ${route.exclude.join(", ")}`);
    lines.push(`  - Entry: ${route.entry}`);
    lines.push(`  - Authority: ${route.authority}`);
    lines.push(`  - Next: ${route.next.join(", ")}`);
  }

  return lines.join("\n");
}
