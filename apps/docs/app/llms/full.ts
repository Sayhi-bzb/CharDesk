import { agentRouteMarkdown } from "@/lib/agent-routes";
import { getLLMText, publicDevelopmentSource } from "@/lib/source";

export async function loader() {
  const pages = await Promise.all(
    [...publicDevelopmentSource.getPages()]
      .sort((left, right) => left.url.localeCompare(right.url))
      .map(getLLMText)
  );

  return new Response(`${agentRouteMarkdown()}\n\n${pages.join("\n\n")}`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
