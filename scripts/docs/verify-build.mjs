import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const docsContent = path.join(repositoryRoot, "apps/docs/content/docs");
const docsOutput = path.join(repositoryRoot, "apps/site/dist/docs");
const routeManifestPath = path.join(
  repositoryRoot,
  "apps/docs/content/agent-routes.json"
);
const docsHeadMetadata = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "apps/docs/content/docs-head.json"),
    "utf8"
  )
);
const docsHead = docsHeadMetadata.head;

if (typeof docsHead !== "string" || !/^[0-9a-f]{40}$/.test(docsHead)) {
  throw new Error("Documentation HEAD must be a full lowercase Git commit SHA");
}

const routeManifest = JSON.parse(await readFile(routeManifestPath, "utf8"));
if (
  routeManifest.version !== 1 ||
  !Array.isArray(routeManifest.routes) ||
  routeManifest.routes.length === 0 ||
  routeManifest.routes.some(
    (route) =>
      typeof route.id !== "string" ||
      !Array.isArray(route.when) ||
      route.when.length === 0 ||
      !Array.isArray(route.keywords) ||
      route.keywords.length === 0 ||
      !Array.isArray(route.identifiers) ||
      route.identifiers.length === 0 ||
      !Array.isArray(route.exclude) ||
      route.exclude.length === 0 ||
      typeof route.entry !== "string" ||
      typeof route.authority !== "string" ||
      !Array.isArray(route.next)
  )
) {
  throw new Error("Agent route manifest has an invalid shape");
}

const contentPages = [];
for await (const entry of glob("**/*.mdx", { cwd: docsContent })) {
  contentPages.push(entry);
}
const developmentPages = contentPages.filter((entry) =>
  entry.startsWith("development/")
);

for (const entry of contentPages) {
  const source = await readFile(path.join(docsContent, entry), "utf8");
  if (!/^title:\s*\S/m.test(source) || !/^description:\s*\S/m.test(source)) {
    throw new Error(`Documentation page is missing title or description: ${entry}`);
  }
}

for (const entry of contentPages) {
  const source = await readFile(path.join(docsContent, entry), "utf8");
  if (!source.includes("Read this page when") && !source.includes("本页适用于")) {
    throw new Error(`Route block is missing from ${entry}`);
  }
  for (const [field, labels] of [
    ["first answer", ["First answer", "首要结论"]],
    ["boundary", ["Boundary", "边界", "Owner or boundary"]],
    ["follow-up", ["Follow-up", "下一步"]],
  ]) {
    if (!labels.some((label) => source.includes(label))) {
      throw new Error(`Route block in ${entry} is missing ${field}`);
    }
  }
}

for (const section of [
  "development",
  "development/architecture",
  "development/host-ui",
  "development/cell-ui",
  "user",
]) {
  const sectionRoot = path.join(docsContent, section);
  const metadata = JSON.parse(await readFile(path.join(sectionRoot, "meta.json"), "utf8"));
  const files = [];
  for await (const entry of glob("*.mdx", { cwd: sectionRoot })) {
    if (entry !== "index.mdx") files.push(entry.replace(/\.mdx$/u, ""));
  }
  for await (const entry of glob("*/index.mdx", { cwd: sectionRoot })) {
    files.push(entry.split("/")[0]);
  }
  const expected = [...files].sort();
  const actual = [...metadata.pages].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Section navigation drift: ${section}`);
  }
}

const rootMetadata = JSON.parse(
  await readFile(path.join(docsContent, "meta.json"), "utf8")
);
for (const page of ["development", "user"]) {
  if (!rootMetadata.pages.includes(page)) {
    throw new Error(`Root navigation is missing ${page}`);
  }
}

const htmlPages = [];
for await (const entry of glob("**/index.html", { cwd: docsOutput })) {
  htmlPages.push(entry);
}
const markdownPages = [];
for await (const entry of glob("llms.mdx/**/content.md", { cwd: docsOutput })) {
  markdownPages.push(entry);
}

if (htmlPages.length !== contentPages.length) {
  throw new Error(
    `Expected ${contentPages.length} documentation pages, found ${htmlPages.length}`
  );
}
if (markdownPages.length !== developmentPages.length) {
  throw new Error(
    `Expected ${developmentPages.length} Agent Markdown pages, found ${markdownPages.length}`
  );
}

const llmsIndex = await readFile(path.join(docsOutput, "llms.txt"), "utf8");
const llmsFull = await readFile(path.join(docsOutput, "llms-full.txt"), "utf8");
const agentRoutes = JSON.parse(
  await readFile(path.join(docsOutput, "agent-routes.json"), "utf8")
);
const searchData = await readFile(path.join(docsOutput, "api/search"), "utf8");
JSON.parse(searchData);

if (
  agentRoutes.version !== 1 ||
  !Array.isArray(agentRoutes.routes) ||
  !agentRoutes.routes.some((route) => route.id === "architecture") ||
  !agentRoutes.routes.some((route) => route.id === "documentation")
) {
  throw new Error("Agent route manifest is missing required routes");
}

if (!llmsIndex.startsWith("# CharDesk Development Documentation")) {
  throw new Error("llms.txt has an unexpected root heading");
}
if (!llmsIndex.includes(docsHead) || !llmsFull.includes(docsHead)) {
  throw new Error("LLM indexes are missing the documentation HEAD");
}
if (!llmsIndex.includes("/docs/development/architecture/ansi-canvas-protocol")) {
  throw new Error("llms.txt is missing the LLM–Human Text Protocol");
}
if (!llmsIndex.includes("/docs/development/host-ui/canvas-inspector")) {
  throw new Error("llms.txt is missing the Canvas Inspector contract");
}
if (
  !llmsIndex.includes("## Agent route map") ||
  !llmsIndex.includes("**architecture**") ||
  !llmsIndex.includes("Keywords:") ||
  !llmsIndex.includes("Identifiers:") ||
  !llmsIndex.includes("Boundary:")
) {
  throw new Error("llms.txt is missing the Agent route map");
}
if (!llmsFull.includes("/docs/development/architecture/ownership")) {
  throw new Error("llms-full.txt is missing development content");
}
if (!llmsFull.includes("/docs/development/architecture/ansi-canvas-protocol")) {
  throw new Error("llms-full.txt is missing the LLM–Human Text Protocol");
}
if (!searchData.includes("/development/architecture/ownership")) {
  throw new Error("The search index is missing development content");
}
if (!searchData.includes("/development/architecture/ansi-canvas-protocol")) {
  throw new Error("The search index is missing the LLM–Human Text Protocol");
}
if (!searchData.includes("/development/host-ui/canvas-inspector")) {
  throw new Error("The search index is missing the Canvas Inspector contract");
}

const forbiddenRoutes = [
  "getting-started",
  "canvas-editing",
  "import-export",
  "keyboard-shortcuts",
];
for (const route of forbiddenRoutes) {
  if (searchData.includes(route) || llmsIndex.includes(route)) {
    throw new Error(`Removed user route remains indexed: ${route}`);
  }
}

const removedDevelopmentRoutes = [
  "start-here",
  "start-here/agent-workflow",
  "start-here/local-development",
  "start-here/repository-map",
  "domains/actions",
  "domains/canvas",
  "domains/character-library",
  "domains/collaboration",
  "domains/document",
  "domains/editor",
  "domains/export",
  "domains/selection",
  "domains/sessions",
  "domains/slides",
  "domains/structured-content",
  "formats-packages/fonts",
  "formats-packages/slides-markdown",
  "formats-packages/text-protocol",
  "quality/agent-navigation",
  "quality/generated-assets",
  "quality/guardrails",
  "quality/testing",
  "delivery/build",
  "delivery/documentation",
  "delivery/release",
];
for (const route of removedDevelopmentRoutes) {
  const contentRoute = `development/${route}`;
  const docsUrl = `/docs/${contentRoute}`;
  const searchUrl = `/${contentRoute}`;
  if (
    htmlPages.includes(`${contentRoute}/index.html`) ||
    markdownPages.includes(`llms.mdx/${contentRoute}/content.md`) ||
    llmsIndex.includes(docsUrl) ||
    llmsFull.includes(docsUrl) ||
    searchData.includes(searchUrl)
  ) {
    throw new Error(`Removed development route remains emitted: ${route}`);
  }
}

const internalLinks = new Set();
for (const entry of htmlPages) {
  const html = await readFile(path.join(docsOutput, entry), "utf8");
  const route = entry === "index.html"
    ? ""
    : entry.replace(/index\.html$/u, "");
  const canonical = `https://chardesk.com/docs/${route}`;
  if (
    !html.includes("chardesk-docs-head") ||
    !html.includes(`data-docs-head="${docsHead}"`)
  ) {
    throw new Error(`Documentation HEAD is missing from ${entry}`);
  }
  if (html.includes("/docs/docs")) {
    throw new Error(`Duplicated docs prefix in ${entry}`);
  }
  const canonicalMatches = html.match(/rel="canonical"/gu) ?? [];
  if (canonicalMatches.length !== 1 || !html.includes(`href="${canonical}"`)) {
    throw new Error(`Invalid canonical URL in ${entry}: expected ${canonical}`);
  }
  for (const required of [
    '<meta name="robots" content="index, follow"',
    'property="og:title"',
    'property="og:description"',
    'name="twitter:card"',
    'type="application/ld+json"',
    '"@type":"TechArticle"',
    '"@type":"BreadcrumbList"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Documentation SEO metadata is missing from ${entry}: ${required}`);
    }
  }
  for (const match of html.matchAll(/href="(\/docs(?:\/[^"?#]*)?)/g)) {
    internalLinks.add(match[1]);
  }
}

const fallbackHtml = await readFile(path.join(docsOutput, "404.html"), "utf8");
if (!fallbackHtml.includes('name="robots" content="noindex, nofollow"')) {
  throw new Error("Documentation 404 fallback must not be indexed");
}

for (const entry of markdownPages) {
  const markdown = await readFile(path.join(docsOutput, entry), "utf8");
  if (!markdown.includes(docsHead)) {
    throw new Error(`Documentation HEAD is missing from ${entry}`);
  }
}

for (const url of internalLinks) {
  const relative = url.replace(/^\/docs\/?/, "");
  if (relative.startsWith("@") || relative.startsWith("app/")) continue;
  const target = relative
    ? path.join(docsOutput, relative, "index.html")
    : path.join(docsOutput, "index.html");
  try {
    await readFile(target);
  } catch {
    throw new Error(`Broken internal documentation link: ${url}`);
  }
}

console.log(
  `Docs verified at ${docsHead.slice(0, 7)}: ${htmlPages.length} pages, ${markdownPages.length} Agent Markdown resources`
);
