import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { componentContent, guideContent, publicUsage, sourceLinksForComponent } from "../../apps/cell-ui/src/docs-content.ts";

const root = fileURLToPath(new URL("../../apps/cell-ui/public/", import.meta.url));
const verify = process.argv.includes("--verify");
const base = "https://ui.chardesk.com";
const outputs = new Map();

const installation = `Install the full editable source in a React project with components.json and aliases.lib: [Installation](${base}/guides/installation.md).`;

for (const guide of guideContent) {
  const sections = guide.sections.map(({ title, body, code, link }) =>
    `## ${title}\n\n${body}${code ? `\n\n\`\`\`tsx\n${code}\n\`\`\`` : ""}${link ? `\n\n[${link.label}](${link.href})` : ""}`);
  outputs.set(`guides/${guide.slug}.md`, `# ${guide.title}\n\n${guide.description}\n\n${sections.join("\n\n")}\n`);
}

for (const component of componentContent) {
  const source = sourceLinksForComponent(component.slug)
    .map(({ label, href }) => `- [${label}](${href})`).join("\n");
  const api = component.api.map(({ name, type, description }) =>
    `| \`${name}\` | \`${type.replaceAll("|", "\\|")}\` | ${description.replaceAll("|", "\\|")} |`).join("\n");
  outputs.set(`components/${component.slug}.md`, `# ${component.title}\n\n${component.description}\n\n## Installation\n\n${installation}\n\n## Usage\n\n\`\`\`tsx\n${publicUsage(component.usage)}\n\`\`\`\n\n## View source\n\n${source}\n\n## API\n\n| Prop | Type | Description |\n| --- | --- | --- |\n${api}\n`);
}

outputs.set("llms.txt", `# CharDesk Cell UI\n\nEditable Unicode Cell interfaces for React. The Gallery and these Markdown files share one documentation source. The registry installs the entire library, not individual components.\n\n## Sections\n\n${guideContent.map(({ title, slug, description }) => `- [${title}](${base}/guides/${slug}.md): ${description}`).join("\n")}\n\n## Components\n\n${componentContent.toSorted((a, b) => a.title.localeCompare(b.title, "en")).map(({ title, slug, description }) => `- [${title}](${base}/components/${slug}.md): ${description}`).join("\n")}\n\n## Internal development\n\n- [Architecture](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/overview.mdx)\n- [Widget contracts](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/widgets.mdx)\n`);

const stale = [];
for (const dir of ["guides", "components"]) {
  try {
    for (const name of await readdir(join(root, dir))) {
      if (name.endsWith(".md") && !outputs.has(`${dir}/${name}`)) stale.push(`${dir}/${name}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (stale.length) throw new Error(`Stale generated docs: ${stale.join(", ")}`);

let changed = false;
for (const [path, body] of outputs) {
  const target = join(root, path);
  const old = await readFile(target, "utf8").catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (old === body) continue;
  changed = true;
  if (verify) console.error(`Out of date: ${path}`);
  else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}
if (verify && changed) process.exitCode = 1;
else console.log(`${verify ? "Verified" : "Generated"} ${outputs.size} Gallery documents.`);
