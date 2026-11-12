import { index, route, type RouteConfig } from '@react-router/dev/routes';
export default [
  route('api/search', 'routes/search.ts'),
  route('llms.txt', 'routes/llms.ts'),
  route('llms-full.txt', 'routes/full.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  index('routes/index.tsx'),
  route('*', 'routes/article.tsx'),
] satisfies RouteConfig;
