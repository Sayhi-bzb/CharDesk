import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { AgentRoutes } from "./agent-routes";

function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AgentRoutes,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
