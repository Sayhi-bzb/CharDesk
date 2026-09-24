import prettier from "prettier";
import { componentContent, guideContent } from "../../apps/cell-ui/src/docs-content.ts";

const options = { printWidth: 88, tabWidth: 2 };
const snippets = [
  ...componentContent.map(({ slug, usage }) => ({ name: `components/${slug}`, code: usage, parser: "typescript" })),
  ...guideContent.flatMap(({ slug, sections }) => sections
    .filter(({ code }) => code)
    .map(({ id, code }) => ({
      name: `guides/${slug}#${id}`,
      code,
      parser: slug === "installation" ? id === "configure" ? "json" : null : "typescript",
    }))),
];

let failures = 0;
for (const { name, code, parser } of snippets) {
  if (!parser) {
    if (code.includes("\n")) {
      console.error(`${name}: command must remain one line`);
      failures++;
    }
    continue;
  }
  try {
    const formatted = (await prettier.format(code, { ...options, parser })).replace(/\n$/, "");
    if (formatted === code) continue;
    console.error(`${name}: code block needs formatting`);
  } catch (error) {
    console.error(`${name}: ${error.message}`);
  }
  failures++;
}

if (failures) {
  console.error(`${failures} Gallery code block(s) need attention.`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${snippets.length} Gallery code blocks.`);
}
