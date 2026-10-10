import type { Config } from "@react-router/dev/config";
import { glob } from "node:fs/promises";
import { createGetUrl, getSlugs } from "fumadocs-core/source";

const publicBase = "/docs";
const docsUrl = createGetUrl(publicBase);
const basename = `${publicBase}/`;

export default {
  basename,
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths = new Set(getStaticPaths());
    paths.add("/api/search");
    paths.add("/llms.txt");
    paths.add("/llms-full.txt");
    paths.add("/agent-routes.json");

    for await (const entry of glob("**/*.mdx", { cwd: "content/docs" })) {
      const slugs = getSlugs(entry);
      const publicUrl = docsUrl(slugs);
      paths.add(publicUrl.slice(publicBase.length) || "/");
      if (slugs[0] === "development") {
        paths.add(`/llms.mdx/${slugs.join("/")}/content.md`);
      }
    }

    return [...paths];
  },
} satisfies Config;
