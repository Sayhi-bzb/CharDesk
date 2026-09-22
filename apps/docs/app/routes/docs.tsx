/* eslint-disable react-refresh/only-export-components */
import { use } from "react";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import type { Route } from "./+types/docs";
import { useMDXComponents } from "@/components/mdx";
import { DocsShellContainer } from "@/components/docs-shell";
import {
  DOCS_HEAD,
  DOCS_HEAD_SHORT,
  DOCS_HEAD_URL,
} from "@/lib/docs-head";
import { baseOptions } from "@/lib/layout";
import { docs, source } from "@/lib/source";
import {
  createDocsSeo,
  DOCS_SOCIAL_IMAGE,
  DOCS_SOCIAL_IMAGE_ALT,
  serializeStructuredData,
} from "@/lib/seo";

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = (params["*"] ?? "").split("/").filter(Boolean);
  const page = source.getPage(slugs);
  if (!page) throw new Response("Not found", { status: 404 });

  return {
    path: page.path,
    pageTree: await source.serializePageTree(source.getPageTree()),
    seo: createDocsSeo(slugs, page.data),
  };
}

function Content({
  path,
  seo,
}: {
  path: string;
  seo: ReturnType<typeof createDocsSeo>;
}) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`Unknown documentation page: ${path}`);

  const { toc } = use(page.load());
  const Mdx = page.body;

  return (
    <DocsPage toc={toc}>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={seo.canonical} />
      <meta property="og:type" content="article" />
      <meta property="og:url" content={seo.canonical} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:image" content={DOCS_SOCIAL_IMAGE} />
      <meta property="og:image:alt" content={DOCS_SOCIAL_IMAGE_ALT} />
      <meta property="og:site_name" content="CharDesk" />
      <meta property="og:locale" content="en_US" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:image" content={DOCS_SOCIAL_IMAGE} />
      <meta name="twitter:image:alt" content={DOCS_SOCIAL_IMAGE_ALT} />
      <script type="application/ld+json">
        {serializeStructuredData(seo.structuredData)}
      </script>
      <meta name="chardesk-docs-head" content={DOCS_HEAD} />
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <a
        data-docs-head={DOCS_HEAD}
        href={DOCS_HEAD_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={`Documentation reviewed at commit ${DOCS_HEAD}`}
        className="mt-3 inline-flex w-fit items-center rounded-full border bg-fd-muted px-2 py-0.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
      >
        HEAD {DOCS_HEAD_SHORT}
      </a>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export default function DocsRoute({ loaderData }: Route.ComponentProps) {
  const { pageTree, path, seo } = useFumadocsLoader(loaderData);

  return (
    <DocsLayout
      {...baseOptions()}
      tree={pageTree}
      slots={{ container: DocsShellContainer }}
    >
      <Content path={path} seo={seo} />
    </DocsLayout>
  );
}
