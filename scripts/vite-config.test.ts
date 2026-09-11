import { readFileSync } from "node:fs";
import path from "node:path";
import { readConfigFile } from "typescript";
import { describe, expect, it } from "vitest";

import config from "../vite.config";
import testConfig from "../vitest.config";

const findAlias = (
  aliases: readonly unknown[],
  specifier: string
) => aliases.find(
  (alias): alias is { find: RegExp; replacement: string } =>
    typeof alias === "object" &&
    alias !== null &&
    "find" in alias &&
    alias.find instanceof RegExp &&
    alias.find.test(specifier)
);

describe("Vite development server", () => {
  it("ignores experiment documentation without ignoring gallery sources", () => {
    expect(config).not.toBeTypeOf("function");
    expect(config.server?.watch?.ignored).toEqual(["**/exp/**/*.md"]);
  });
});

describe("Vite workspace aliases", () => {
  it("serves the font stylesheet and its assets from the active worktree", () => {
    expect(config).not.toBeTypeOf("function");
    const aliases = Array.isArray(config.resolve?.alias) ? config.resolve.alias : [];
    const fontStylesheet = findAlias(
      aliases,
      "@chardesk/fonts/fonts.css"
    );
    const mapleStylesheet = findAlias(
      aliases,
      "@chardesk/font-maple/fonts.css"
    );

    expect(fontStylesheet).toMatchObject({
      replacement: path.resolve(import.meta.dirname, "../packages/fonts/fonts.css"),
    });
    expect(fontStylesheet && aliases.indexOf(fontStylesheet)).toBeLessThan(
      aliases.findIndex(
        (alias) =>
          typeof alias === "object" &&
          alias !== null &&
          "find" in alias &&
          alias.find instanceof RegExp &&
          alias.find.test("@chardesk/fonts")
      )
    );
    expect(mapleStylesheet).toMatchObject({
      replacement: path.resolve(import.meta.dirname, "../packages/font-maple/fonts.css"),
    });
  });

  it.each([
    ["@chardesk/cell-core", "packages/cell-core/src/index.ts"],
    ["@chardesk/chargraph/markdown", "packages/chargraph/src/markdown-default.ts"],
    ["@chardesk/chargraph/theme", "packages/chargraph/src/render-theme.ts"],
    ["@chardesk/keyboard", "packages/keyboard/src/index.ts"],
    ["@chardesk/keyboard/browser", "packages/keyboard/src/browser.ts"],
    ["@chardesk/rendering", "packages/rendering/src/index.ts"],
    ["@chardesk/rendering/canvas", "packages/rendering/src/canvas.ts"],
    ["@chardesk/rendering/theme", "packages/rendering/src/content-theme.ts"],
  ])("resolves %s from source in TypeScript, Vite, and Vitest", (
    specifier,
    sourcePath
  ) => {
    const expected = path.resolve(import.meta.dirname, "..", sourcePath);
    const tsconfigPath = path.resolve(import.meta.dirname, "../tsconfig.app.json");
    const { config: tsconfig, error } = readConfigFile(
      tsconfigPath,
      (file) => readFileSync(file, "utf8")
    );
    expect(error).toBeUndefined();
    expect(tsconfig.compilerOptions.paths[specifier]).toEqual([
      `./${sourcePath}`,
    ]);

    for (const candidate of [config, testConfig]) {
      expect(candidate).not.toBeTypeOf("function");
      const aliases = Array.isArray(candidate.resolve?.alias)
        ? candidate.resolve.alias
        : [];
      const alias = findAlias(aliases, specifier);
      const packageRoot = specifier.split("/").slice(0, 2).join("/");
      const rootAlias = findAlias(aliases, packageRoot);

      expect(alias).toMatchObject({ replacement: expected });
      if (specifier !== packageRoot) {
        expect(alias && aliases.indexOf(alias)).toBeLessThan(
          rootAlias ? aliases.indexOf(rootAlias) : -1
        );
      }
    }
  });
});
