import routeManifest from "../../content/agent-routes.json";

type AgentRoute = (typeof routeManifest.routes)[number];

export const AGENT_ROUTE_MANIFEST = routeManifest;

export function agentRouteMarkdown() {
  const lines = ["## Agent route map", ""];

  for (const route of routeManifest.routes as AgentRoute[]) {
    lines.push(`- **${route.id}**: ${route.when.join("; ")} → ${route.entry}`);
  }

  return lines.join("\n");
}
