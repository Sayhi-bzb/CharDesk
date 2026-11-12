import type { LoaderFunctionArgs } from "react-router";
import { getLLMText, publicDevelopmentSource } from "@/lib/source";

export async function loader({ params }: LoaderFunctionArgs) {
  const slugs = (params["*"] ?? "").split("/").filter(Boolean);
  if (slugs.at(-1) !== "content.md") {
    return new Response("Not found", { status: 404 });
  }

  slugs.pop();
  if (slugs[0] !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const page = publicDevelopmentSource.getPage(slugs);
  if (!page) return new Response("Not found", { status: 404 });

  return new Response(await getLLMText(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
