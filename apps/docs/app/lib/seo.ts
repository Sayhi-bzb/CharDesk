const SITE_URL = "https://chardesk.com";

export const DOCS_SOCIAL_IMAGE = `${SITE_URL}/showcase/01-shared-medium.png`;
export const DOCS_SOCIAL_IMAGE_ALT =
  "CharDesk shared Unicode canvas for humans and AI";

const breadcrumbLabels: Record<string, string> = {
  "cell-ui": "Cell UI",
  "host-ui": "Host UI",
};

const titleFromSlug = (slug: string) =>
  breadcrumbLabels[slug]
  ?? slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function createDocsSeo(
  slugs: readonly string[],
  page: { title: string; description?: string },
) {
  const route = slugs.length > 0 ? `${slugs.join("/")}/` : "";
  const canonical = `${SITE_URL}/docs/${route}`;
  const title = `${page.title} | CharDesk Docs`;
  const description = page.description ?? "CharDesk documentation.";
  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "CharDesk Docs",
      item: `${SITE_URL}/docs/`,
    },
    ...slugs.map((slug, index) => ({
      "@type": "ListItem",
      position: index + 2,
      name: index === slugs.length - 1 ? page.title : titleFromSlug(slug),
      item: `${SITE_URL}/docs/${slugs.slice(0, index + 1).join("/")}/`,
    })),
  ];

  return {
    title,
    description,
    canonical,
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          headline: page.title,
          description,
          url: canonical,
          mainEntityOfPage: canonical,
          image: DOCS_SOCIAL_IMAGE,
          publisher: {
            "@type": "Organization",
            name: "CharDesk",
            url: SITE_URL,
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbItems,
        },
      ],
    },
  };
}

export const serializeStructuredData = (value: unknown) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");
