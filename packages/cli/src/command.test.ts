import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliArguments, runCli } from "./command.js";

const temporaryDirectories: string[] = [];

const temporaryDirectory = async () => {
  const path = await mkdtemp(join(tmpdir(), "chardesk-cli-"));
  temporaryDirectories.push(path);
  return path;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

const capture = () => {
  let text = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, text: () => text };
};

const streams = (input: Uint8Array | string = "") => {
  const stdout = capture();
  const stderr = capture();
  return {
    value: {
      stdin: (async function* () { yield input; })(),
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
    stdout: stdout.text,
    stderr: stderr.text,
  };
};

describe("chardesk render command", () => {
  it("initializes one native document without overwriting it", async () => {
    const cwd = await temporaryDirectory();
    expect(await runCli(["init", "demo.chardesk", "--title", "GPU Notes"], streams().value, cwd)).toBe(0);
    const source = await readFile(join(cwd, "demo.chardesk"), "utf8");
    expect(source).toContain("chardesk: document/v1");
    expect(source).toContain("mode: freeform");
    const conflict = streams();
    expect(await runCli(["init", "demo.chardesk"], conflict.value, cwd)).toBe(1);
    expect(conflict.stderr()).toContain("init-conflict");
    expect(await readFile(join(cwd, "demo.chardesk"), "utf8")).toBe(source);
  });

  it("initializes a native slide deck", async () => {
    const cwd = await temporaryDirectory();
    expect(await runCli(["init", "deck.chardesk", "--mode", "slide"], streams().value, cwd)).toBe(0);
    const source = await readFile(join(cwd, "deck.chardesk"), "utf8");
    expect(source).toContain("mode: slide");
    expect(source).toContain("## Opening");
  });

  it("parses the open command without accepting stdin or unrelated options", () => {
    expect(parseCliArguments([
      "open", "boards/demo", "--port", "7331", "--no-browser",
      "--foreground", "--json",
    ])).toEqual({
      help: false,
      command: {
        kind: "open",
        input: "boards/demo",
        inputMode: "auto",
        json: true,
        port: 7331,
        browser: false,
        foreground: true,
      },
    });
    expect(() => parseCliArguments(["open", "-"])).toThrow("requires a file");
    for (const removed of ["check", "result", "preview"]) {
      expect(() => parseCliArguments([removed, "input.md"]))
        .toThrow("must be init, inspect, open, status, close, or render");
    }
  });

  it("parses the stable first-version command contract", () => {
    expect(parseCliArguments([
      "render", "input.md", "-o", "output.png", "--strict",
    ])).toEqual({
      help: false,
      command: {
        kind: "render",
        input: "input.md",
        output: "output.png",
        format: "png",
        inputMode: "auto",
        scale: 2,
        padding: 16,
        strict: true,
        json: false,
      },
    });
  });

  it("infers render formats and parses inspect options", () => {
    expect(parseCliArguments([
      "render", "input.md", "-o", "board.chardesk",
    ])).toMatchObject({ command: { kind: "render", format: "chardesk" } });
    expect(parseCliArguments([
      "render", "input.md", "-o", "-", "--format", "text",
    ])).toMatchObject({ command: { kind: "render", output: "-", format: "text" } });
    expect(() => parseCliArguments([
      "render", "input.md", "-o", "-", "--format", "text", "--json",
    ])).toThrow("--json cannot be combined");
    expect(() => parseCliArguments([
      "render", "input.md", "-o", "output.txt", "--scale", "2",
    ])).toThrow("apply only to PNG");
    expect(() => parseCliArguments([
      "render", "input.md", "-o", "output.txt", "--no-ruler",
    ])).toThrow("does not apply to render");
    expect(parseCliArguments([
      "inspect", "input.chardesk", "--region", "2,3,40,20", "--no-ruler",
    ])).toEqual({
      help: false,
      command: {
        kind: "inspect",
        input: "input.chardesk",
        inputMode: "auto",
        json: false,
        canvas: true,
        region: { x: 2, y: 3, columns: 40, rows: 20 },
        ruler: false,
        styles: false,
      },
    });
    expect(() => parseCliArguments(["inspect", "demo.chardesk", "--panel", "details"])).toThrow("Unknown option");
    expect(parseCliArguments([
      "inspect", "input.md", "--canvas",
    ])).toMatchObject({ command: { kind: "inspect", canvas: true } });
    expect(() => parseCliArguments(["inspect", "-", "--region", "1,2,0,4"]))
      .toThrow("positive safe integers");
  });

  it("prints a bounded materialized grid inspect view without style controls", async () => {
    const io = streams("[31mA[0m \u754c\nCD");
    expect(await runCli([
      "inspect", "-", "--input", "chardesk",
    ], io.value)).toBe(0);

    expect(io.stdout()).toContain("inspect: valid");
    expect(io.stdout()).toContain("projection: canvas");
    expect(io.stdout()).toContain("grid: 4 cols × 2 rows");
    expect(io.stdout()).toContain("0 │ A 界");
    expect(io.stdout()).toContain("1 │ CD");
    expect(io.stdout()).not.toContain("[31m");
    expect(io.stderr()).toBe("");
  });

  it("stacks block layout fields into a plain reading projection", async () => {
    const source = [
      "aa",
      "[31maa[0m",
      "|||",
      "[32mbb[0m",
      "bb",
      "---",
    ].join("\n");
    const reading = streams(source);
    expect(await runCli([
      "inspect", "-", "--input", "chargraph", "--no-ruler", "--styles", "--json",
    ], reading.value)).toBe(0);
    expect(JSON.parse(reading.stdout())).toMatchObject({
      status: "valid",
      projection: "blocks",
      columns: 2,
      rows: 5,
      text: "aa\naa\n\nbb\nbb",
      canvas: { columns: 8 },
      styles: expect.stringContaining("3:0-1{fg:#008000}"),
      diagnostics: [],
    });

    const canvas = streams(source);
    expect(await runCli([
      "inspect", "-", "--input", "chargraph", "--canvas", "--no-ruler", "--json",
    ], canvas.value)).toBe(0);
    const canvasResult = JSON.parse(canvas.stdout());
    expect(canvasResult).toMatchObject({ projection: "canvas" });
    expect(canvasResult.text).toMatch(/^aa {4}bb\naa {4}bb/u);

    const region = streams(source);
    expect(await runCli([
      "inspect", "-", "--input", "chargraph", "--region", "0,0,2,2",
      "--no-ruler", "--json",
    ], region.value)).toBe(0);
    expect(JSON.parse(region.stdout())).toMatchObject({
      projection: "canvas",
      text: "aa\naa",
    });
  });

  it("adds style evidence only when explicitly requested", async () => {
    const plain = streams("[31;1mStyled[0m plain");
    expect(await runCli([
      "inspect", "-", "--input", "chardesk", "--no-ruler",
    ], plain.value)).toBe(0);
    expect(plain.stdout()).not.toContain("styles:");

    const styled = streams("[31;1mStyled[0m plain");
    expect(await runCli([
      "inspect", "-", "--input", "chardesk", "--no-ruler", "--styles",
    ], styled.value)).toBe(0);
    expect(styled.stdout()).toContain("styles:\n  0:0-5{fg:#800000;bold}");
    expect(styled.stdout()).not.toContain("[31;1m");
  });

  it("supports absolute inspect regions and reports invalid fallback projections", async () => {
    const region = streams("0123456789\nabcdefghij");
    expect(await runCli([
      "inspect", "-", "--input", "chardesk", "--region", "5,1,4,1", "--no-ruler",
    ], region.value)).toBe(0);
    expect(region.stdout()).toContain("view: x=5..8, y=1..1 · 4×1 cells");
    expect(region.stdout()).toContain("\nfghi\n");

    const invalid = streams("```mermaid\nnot-a-diagram\n```");
    expect(await runCli(["inspect", "-"], invalid.value)).toBe(1);
    expect(invalid.stdout()).toContain("inspect: invalid");
    expect(invalid.stderr()).toContain("warning");
  });

  it("migrates legacy source explicitly and retains the original", async () => {
    const cwd = await temporaryDirectory();
    const board = join(cwd, "gpu");
    await mkdir(join(board, "panels"), { recursive: true });
    await writeFile(join(board, "blackboard.yaml"), [
      "chardesk: blackboard/v1",
      "panels:",
      "  left: { source: panels/left.panel }",
      "  right: { source: panels/right.panel }",
      "layout:",
      "  areas: [[left, right]]",
      "  gap: { column: 2, row: 0 }",
    ].join("\n"));
    await writeFile(join(board, "panels/left.panel"), "[31mGPU[0m");
    await writeFile(join(board, "panels/right.panel"), "\u663e卡");

    for (const input of ["gpu", "gpu/blackboard.yaml"]) {
      const io = streams();
      expect(await runCli(["inspect", input, "--no-ruler"], io.value, cwd)).toBe(1);
      expect(io.stderr()).toContain("retired-format");
    }

    expect(await runCli(["migrate", "gpu", "--output", "gpu.chardesk"], streams().value, cwd)).toBe(0);
    const styled = streams();
    expect(await runCli(["inspect", "gpu.chardesk", "--no-ruler", "--styles"], styled.value, cwd)).toBe(0);
    expect(styled.stdout()).toContain("GPU  显卡");
    expect(styled.stdout()).toContain("0:0-2{fg:#800000}");
    const conflict = streams();
    expect(await runCli(["migrate", "gpu", "--output", "gpu.chardesk"], conflict.value, cwd)).toBe(1);
    expect(conflict.stderr()).toContain("migration-conflict");
    expect(await readFile(join(board, "panels/left.panel"), "utf8")).toBe("[31mGPU[0m");

  });

  it("renders stdin to an atomically replaceable PNG and reports JSON", async () => {
    const cwd = await temporaryDirectory();
    const io = streams("# Agent\n\n**Ready** 中文🙂");
    const args = ["render", "-", "-o", "result.png", "--json"];

    await expect(runCli(args, io.value, cwd)).resolves.toBe(0);
    await expect(runCli(args, streams("# Updated").value, cwd)).resolves.toBe(0);
    const result = JSON.parse(io.stdout());
    expect(result).toMatchObject({
      status: "rendered",
      inputMode: "chargraph",
      renderer: "markdown",
      diagnostics: [],
    });
    expect(Array.from((await readFile(join(cwd, "result.png"))).slice(0, 4)))
      .toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("detects .chardesk inputs and rejects diagnostics in strict mode", async () => {
    const cwd = await temporaryDirectory();
    await writeFile(join(cwd, "board.chardesk"), "[31mRed[0m", "utf8");
    const board = streams();
    expect(await runCli([
      "render", "board.chardesk", "-o", "board.png", "--json",
    ], board.value, cwd)).toBe(0);
    expect(JSON.parse(board.stdout())).toMatchObject({ inputMode: "chardesk" });

    await writeFile(join(cwd, "canonical.chardesk"), [
      "---",
      "chardesk: document/v1",
      "mode: freeform",
      "---",
      "[32mCanonical[0m",
    ].join("\n"), "utf8");
    const canonical = streams();
    expect(await runCli([
      "render", "canonical.chardesk", "-o", "canonical.txt", "--json",
    ], canonical.value, cwd)).toBe(0);
    expect(await readFile(join(cwd, "canonical.txt"), "utf8")).toBe("Canonical");

    const invalid = streams("```mermaid\nnot-a-diagram\n```");
    expect(await runCli([
      "render", "-", "-o", "invalid.png", "--strict", "--json",
    ], invalid.value, cwd)).toBe(1);
    expect(JSON.parse(invalid.stdout())).toMatchObject({ status: "rejected" });
    await expect(access(join(cwd, "invalid.png"))).rejects.toThrow();
  });

  it("recognizes unsupported canonical document modes", async () => {
    const io = streams([
      "---",
      "chardesk: document/v1",
      "mode: slide",
      "---",
      "## Intro",
    ].join("\n"));

    expect(await runCli([
      "inspect", "-", "--input", "chardesk", "--json",
    ], io.value)).toBe(1);
    expect(JSON.parse(io.stdout())).toMatchObject({
      status: "error",
      code: "unsupported-document-mode",
    });
  });

  it("writes inferred text formats and supports plain text on stdout", async () => {
    const cwd = await temporaryDirectory();
    for (const [filename, marker] of [
      ["result.chardesk", "[1m"],
      ["result.ans", "\u001b["],
      ["result.txt", "Ready 界"],
    ] as const) {
      const io = streams("**Ready** 界");
      expect(await runCli([
        "render", "-", "-o", filename, "--strict",
      ], io.value, cwd)).toBe(0);
      expect(await readFile(join(cwd, filename), "utf8")).toContain(marker);
    }
    expect(await readFile(join(cwd, "result.chardesk"), "utf8"))
      .not.toContain("\u001b");
    expect(await readFile(join(cwd, "result.chardesk"), "utf8"))
      .toContain("chardesk: document/v1");

    const stdout = streams("**Ready** 界");
    expect(await runCli([
      "render", "-", "-o", "-", "--format", "text", "--strict",
    ], stdout.value, cwd)).toBe(0);
    expect(stdout.stdout()).toBe("Ready 界");
    expect(stdout.stderr()).toBe("");
  });

  it("keeps usage and content failures on distinct exit codes", async () => {
    const usage = streams();
    expect(await runCli(["render", "input.md"], usage.value)).toBe(2);
    expect(usage.stderr()).toContain("requires -o");

    const invalidUtf8 = streams(new Uint8Array([0xff]));
    expect(await runCli([
      "render", "-", "-o", "unused.png", "--json",
    ], invalidUtf8.value)).toBe(1);
    expect(JSON.parse(invalidUtf8.stdout())).toMatchObject({
      status: "error",
      code: "invalid-utf8",
    });
  });
});
