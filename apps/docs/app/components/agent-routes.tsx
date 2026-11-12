import { AGENT_ROUTE_MANIFEST } from "../lib/agent-routes";

/** The website and Agent index select tasks from the same manifest. */
export function AgentRoutes() {
  return <table>
    <thead><tr><th>Task</th><th>Start here</th></tr></thead>
    <tbody>{AGENT_ROUTE_MANIFEST.routes.map(route => <tr key={route.id}>
      <td>{route.when.join("; ")}</td>
      <td><a href={route.entry}>{route.id}</a></td>
    </tr>)}</tbody>
  </table>;
}
