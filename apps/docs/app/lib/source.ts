import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { docsHeadMarkdown } from "@/lib/docs-head";
import { agentRouteMarkdown } from "@/lib/agent-routes";
import { agentMarkdown } from "@/lib/agent-markdown";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    async: true,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

const docsSource = docs.toFumadocsSource();
const developmentDocsSource = {
  ...docsSource,
  files: docsSource.files.filter((file) =>
    file.path.startsWith("development/")
  ),
};

export const source = loader({
  source: docsSource,
  baseUrl: "/",
});

export const developmentSource = loader({
  source: developmentDocsSource,
  baseUrl: "/",
});

export const publicDevelopmentSource = loader({
  source: developmentDocsSource,
  baseUrl: "/docs",
});

export async function getLLMText(
  page: (typeof publicDevelopmentSource)["$inferPage"],
  { includeRoutes = true }: { includeRoutes?: boolean } = {},
) {
  const processed = agentMarkdown(await page.data.getText("processed"));
  const routes = includeRoutes && page.url === "/docs/development"
    ? `\n\n${agentRouteMarkdown()}`
    : "";

  return `# ${page.data.title} (${page.url})\n\n${docsHeadMarkdown()}\n\n${processed}${routes}`;
}
