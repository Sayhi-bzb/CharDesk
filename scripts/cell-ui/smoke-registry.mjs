import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tempRoot = await mkdtemp(path.join(process.env.CELL_UI_REGISTRY_TMP ?? tmpdir(), "cell-ui-registry-"));
const consumer = path.join(tempRoot, "consumer");
const builtRegistry = path.join(tempRoot, "registry");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
const shadcn = (args, cwd) => process.env.CELL_UI_SHADCN_CLI
  ? run(process.execPath, [process.env.CELL_UI_SHADCN_CLI, ...args], cwd)
  : run("npx", ["--yes", "shadcn@4.21.0", ...args], cwd);

try {
  await mkdir(path.join(consumer, "src"), { recursive: true });
  await writeFile(path.join(consumer, "package.json"), JSON.stringify({
    name: "cell-ui-registry-consumer",
    private: true,
    type: "module",
    dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
    devDependencies: { typescript: "~5.9.3", "@types/react": "^19.2.5", "@types/react-dom": "^19.2.3" },
  }, null, 2));
  await writeFile(path.join(consumer, "components.json"), JSON.stringify({
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: { config: "", css: "src/app.css", baseColor: "", cssVariables: true, prefix: "" },
    iconLibrary: "lucide",
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
    registries: {},
  }, null, 2));
  await writeFile(path.join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "ES2022.Intl", "DOM", "DOM.Iterable"],
      module: "NodeNext",
      moduleResolution: "NodeNext",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      paths: { "@/*": ["./src/*"] },
      noUncheckedIndexedAccess: true,
      verbatimModuleSyntax: true,
    },
    include: ["src"],
  }, null, 2));
  await writeFile(path.join(consumer, "src/smoke.tsx"), `import { Button, CellUiRuntime, Root, Text } from "./lib/cell-ui/index.js";
import { CellSurface } from "./lib/cell-ui/browser.js";

const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
const frame = runtime.render(<Root><Button id="save"><Text>Save</Text></Button></Root>);
if (!frame.buffer.toText().includes("Save") || typeof CellSurface !== "function") {
  throw new Error("Registry source failed its headless/browser smoke test.");
}
runtime.dispose();
`);

  shadcn(["build", path.join(repoRoot, "registry.json"), "--output", builtRegistry], repoRoot);
  run("npm", ["install", "--no-audit", "--no-fund"], consumer);
  shadcn(["add", path.join(builtRegistry, "cell-ui.json"), "--cwd", consumer, "--yes"], consumer);
  run(path.join(consumer, "node_modules/.bin/tsc"), ["-p", path.join(consumer, "tsconfig.json")], consumer);
  run(process.execPath, [path.join(consumer, "dist/smoke.js")], consumer);
  console.log("Verified Registry installation in a fresh React project.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
