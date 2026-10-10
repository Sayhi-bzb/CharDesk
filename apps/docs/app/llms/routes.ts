import { AGENT_ROUTE_MANIFEST } from "@/lib/agent-routes";

export function loader() {
  return Response.json(AGENT_ROUTE_MANIFEST);
}
