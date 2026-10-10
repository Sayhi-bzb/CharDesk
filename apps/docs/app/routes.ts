import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("api/search", "routes/search.ts"),
  route("llms.txt", "llms/index.ts"),
  route("llms-full.txt", "llms/full.ts"),
  route("agent-routes.json", "llms/routes.ts"),
  route("llms.mdx/*", "llms/mdx.ts"),
  index("routes/docs-index.tsx"),
  route("*", "routes/docs.tsx"),
] satisfies RouteConfig;
