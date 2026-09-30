import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { BlackboardPackageError } from "@chardesk/legacy-blackboard/errors";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import { migrateBlackboardFile } from "./migrate.js";
import { initializeCharDeskWorkspace } from "./init.js";
import {
  CharDeskCliCommandError,
  decodeUtf8,
  resolveCharDeskInput,
  type CharDeskInputModeOption,
  type ResolvedCharDeskInput,
} from "./input.js";
import {
  closeManagedSessions,
  launchCharDeskOpenSession,
  listManagedSessions,
  openManagedSession,
  serveManagedOpenSession,
  startCharDeskOpenSession,
  waitForOpenSession,
} from "./open.js";
import {
  CharDeskCliRenderError,
  compileInspectSource,
  renderSource,
  type CharDeskCliDiagnostic,
  type CharDeskCliOutputFormat,
} from "./render.js";
import {
  CharDeskCliRasterProcessError,
  renderSourceInRasterProcess,
} from "./raster-process.js";
import {
  projectCharDeskInspect,
  type CharDeskInspectRegion,
} from "./inspect.js";

type CommonCommand = {
  input: string;
  inputMode: CharDeskInputModeOption;
  json: boolean;
};

type InitCommand = {
  kind: "init";
  directory: string;
  title?: string;
  mode: "freeform" | "slide";
};

type OpenCommand = CommonCommand & {
  kind: "open";
  port: number;
  browser: boolean;
  foreground: boolean;
};

type ServeCommand = CommonCommand & {
  kind: "__serve";
  port: number;
  sessionFile: string;
};

type SessionCommand = {
  kind: "status" | "close";
  input?: string;
  all: boolean;
  json: boolean;
};

type RenderCommand = CommonCommand & {
  kind: "render";
  output: string;
  format: CharDeskCliOutputFormat;
  scale: number;
  padding: number;
  strict: boolean;
};

type InspectCommand = CommonCommand & {
  kind: "inspect";
  canvas: boolean;
  region?: CharDeskInspectRegion;
  ruler: boolean;
  styles: boolean;
};

type CliCommand =
  | { kind: "migrate"; input: string; output: string }
  | InitCommand
  | OpenCommand
  | ServeCommand
  | SessionCommand
  | RenderCommand
  | InspectCommand;

type CliOutput = Pick<Writable, "write">;

type CliStreams = {
  stdin: AsyncIterable<Uint8Array | string>;
  stdout: CliOutput;
  stderr: Pick<Writable, "write">;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const CLI_USAGE = [
  "Usage:",
  "  chardesk init <file.chardesk> [--mode <freeform|slide>] [--title <title>]",
  "  chardesk migrate <blackboard.yaml|directory> --output <file.chardesk>",
  "  chardesk inspect <input|-> [options]",
  "  chardesk open <input> [options]",
  "  chardesk status [input] [--json]",
  "  chardesk close [input|--all] [--json]",
  "  chardesk render <input|-> -o <output|-> [options]",
  "",
  "Options:",
  "      --title <title>                 Workspace title for init",
  "      --mode <freeform|slide>       Workspace mode for init",
  "      --port <0..65535>               Local open port (default: random)",
  "      --no-browser                    Print the open URL without launching it",
  "      --foreground                    Keep the local Canvas attached to this process",
  "  -o, --output <path|->              Render output (required)",
  "      --format <png|chardesk|ansi|text>",
  "      --input <auto|chargraph|chardesk>",
  "      --region <x,y,columns,rows>      Inspect Canvas region (implies --canvas)",
  "      --canvas                        Inspect the spatial Canvas projection",
  "      --no-ruler                      Hide inspect coordinates",
  "      --styles                        Include materialized style evidence",
  "      --scale <1..4>                  PNG raster scale (default: 2)",
  "      --padding <0..256>              PNG logical padding (default: 16)",
  "      --strict                        Reject render diagnostics",
  "      --json                          Print a machine-readable result",
  "  -h, --help                          Show this help",
].join("\n");

const parseRawArguments = (args: readonly string[]) => parseArgs({
  args: [...args],
  allowPositionals: true,
  strict: true,
  options: {
    output: { type: "string", short: "o" },
    format: { type: "string" },
    input: { type: "string" },
    scale: { type: "string" },
    padding: { type: "string" },
    region: { type: "string" },
    canvas: { type: "boolean", default: false },
    "no-ruler": { type: "boolean", default: false },
    styles: { type: "boolean", default: false },
    strict: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    title: { type: "string" },
    mode: { type: "string" },
    port: { type: "string" },
    "no-browser": { type: "boolean", default: false },
    foreground: { type: "boolean", default: false },
    "session-file": { type: "string" },
    all: { type: "boolean", default: false },
  },
});

const integerOption = (
  value: string | undefined,
  name: "scale" | "padding",
  fallback: number
) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) throw new CliUsageError(`--${name} must be an integer.`);
  const parsed = Number(value);
  const minimum = name === "scale" ? 1 : 0;
  const maximum = name === "scale" ? 4 : 256;
  if (parsed < minimum || parsed > maximum) {
    throw new CliUsageError(`--${name} must be from ${minimum} through ${maximum}.`);
  }
  return parsed;
};

const parseInputMode = (value: string | undefined): CharDeskInputModeOption => {
  const inputMode = value ?? "auto";
  if (!("auto,chargraph,chardesk".split(",") as CharDeskInputModeOption[]).includes(
    inputMode as CharDeskInputModeOption
  )) {
    throw new CliUsageError("--input must be auto, chargraph, or chardesk.");
  }
  return inputMode as CharDeskInputModeOption;
};

const parsePort = (value: string | undefined) => {
  if (value === undefined) return 0;
  if (!/^\d+$/u.test(value)) throw new CliUsageError("--port must be an integer.");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new CliUsageError("--port must be from 0 through 65535.");
  }
  return port;
};

const parseRegion = (value: string | undefined): CharDeskInspectRegion | undefined => {
  if (value === undefined) return undefined;
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/u.test(part))) {
    throw new CliUsageError("--region must be x,y,columns,rows using integers.");
  }
  const [x, y, columns, rows] = parts.map(Number);
  if (
    !Number.isSafeInteger(x) || !Number.isSafeInteger(y)
    || !Number.isSafeInteger(columns) || !Number.isSafeInteger(rows)
    || columns === 0 || rows === 0
  ) {
    throw new CliUsageError("--region columns and rows must be positive safe integers.");
  }
  return { x: x!, y: y!, columns: columns!, rows: rows! };
};

const FORMAT_BY_EXTENSION: Record<string, CharDeskCliOutputFormat> = {
  ".png": "png",
  ".chardesk": "chardesk",
  ".ans": "ansi",
  ".txt": "text",
};

const parseOutputFormat = (
  output: string,
  value: string | undefined
): CharDeskCliOutputFormat => {
  if (value !== undefined) {
    if (!("png,chardesk,ansi,text".split(",") as CharDeskCliOutputFormat[]).includes(
      value as CharDeskCliOutputFormat
    )) {
      throw new CliUsageError("--format must be png, chardesk, ansi, or text.");
    }
    return value as CharDeskCliOutputFormat;
  }
  if (output === "-") {
    throw new CliUsageError("rendering to stdout requires --format.");
  }
  const format = FORMAT_BY_EXTENSION[extname(output).toLowerCase()];
  if (!format) {
    throw new CliUsageError(
      "The output suffix must be .png, .chardesk, .ans, or .txt, or use --format."
    );
  }
  return format;
};

export const parseCliArguments = (
  args: readonly string[]
): { help: true } | { help: false; command: CliCommand } => {
  let parsed: ReturnType<typeof parseRawArguments>;
  try {
    parsed = parseRawArguments(args);
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : "Invalid arguments.");
  }
  if (parsed.values.help) return { help: true };
  const [kind, input, ...extra] = parsed.positionals;
  const kinds = [
    "init", "migrate", "inspect", "open", "status", "close", "render", "__serve",
  ] as const;
  if (!kinds.includes(kind as typeof kinds[number])) {
    throw new CliUsageError("The first argument must be init, inspect, open, status, close, or render.");
  }
  const usedOptions = Object.entries(parsed.values).flatMap(([name, value]) =>
    name === "help" || value === undefined || value === false ? [] : [name]
  );
  const allow = (...names: string[]) => {
    const unexpected = usedOptions.find((name) => !names.includes(name));
    if (unexpected) throw new CliUsageError(`--${unexpected} does not apply to ${kind}.`);
  };
  if (kind === "status" || kind === "close") {
    if (extra.length > 0) throw new CliUsageError(`${kind} accepts at most one input.`);
    allow("json", ...(kind === "close" ? ["all"] : []));
    if (kind === "status" && parsed.values.all) throw new CliUsageError("--all applies only to close.");
    if (kind === "close" && parsed.values.all && input) {
      throw new CliUsageError("close accepts either an input or --all, not both.");
    }
    if (kind === "close" && !parsed.values.all && !input) {
      throw new CliUsageError("close requires an input or --all.");
    }
    return {
      help: false,
      command: { kind, input, all: parsed.values.all ?? false, json: parsed.values.json ?? false },
    };
  }
  if (!input || extra.length > 0) throw new CliUsageError(`${kind} requires exactly one input.`);
  if (kind === "migrate") {
    allow("output");
    if (!parsed.values.output) throw new CliUsageError("migrate requires --output <file.chardesk>.");
    return { help: false, command: { kind, input, output: parsed.values.output } };
  }
  if (kind === "init") {
    allow("title", "mode");
    const mode = parsed.values.mode ?? "freeform";
    if (mode !== "freeform" && mode !== "slide") {
      throw new CliUsageError("--mode must be freeform or slide.");
    }
    return {
      help: false,
      command: {
        kind,
        directory: input,
        mode,
        ...(parsed.values.title ? { title: parsed.values.title } : {}),
      },
    };
  }
  if (kind === "__serve") {
    allow("input", "port", "session-file");
    if (!parsed.values["session-file"]) throw new CliUsageError("__serve requires --session-file.");
    return {
      help: false,
      command: {
        kind,
        input,
        inputMode: parseInputMode(parsed.values.input),
        json: false,
        port: parsePort(parsed.values.port),
        sessionFile: parsed.values["session-file"],
      },
    };
  }
  const common = {
    input,
    inputMode: parseInputMode(parsed.values.input),
    json: parsed.values.json ?? false,
  };
  if (kind === "open") {
    allow("input", "port", "no-browser", "foreground", "json");
    if (input === "-") throw new CliUsageError("open requires a file or directory path.");
    return {
      help: false,
      command: {
        kind,
        ...common,
        port: parsePort(parsed.values.port),
        browser: !(parsed.values["no-browser"] ?? false),
        foreground: parsed.values.foreground ?? false,
      },
    };
  }
  if (kind === "inspect") {
    allow("input", "region", "canvas", "no-ruler", "styles", "json");
    return {
      help: false,
      command: {
        kind,
        ...common,
        canvas: (parsed.values.canvas ?? false) || parsed.values.region !== undefined,
        region: parseRegion(parsed.values.region),
        ruler: !(parsed.values["no-ruler"] ?? false),
        styles: parsed.values.styles ?? false,
      },
    };
  }
  allow("input", "output", "format", "scale", "padding", "strict", "json");
  const output = parsed.values.output;
  if (!output) throw new CliUsageError("render requires -o <output|->.");
  const format = parseOutputFormat(output, parsed.values.format);
  if (output === "-" && format === "png") throw new CliUsageError("PNG output requires a file path.");
  if (output === "-" && parsed.values.json) {
    throw new CliUsageError("--json cannot be combined with stdout artifact output.");
  }
  if (format !== "png" && (parsed.values.scale !== undefined || parsed.values.padding !== undefined)) {
    throw new CliUsageError("--scale and --padding apply only to PNG output.");
  }
  return {
    help: false,
    command: {
      kind: "render",
      ...common,
      output,
      format,
      scale: integerOption(parsed.values.scale, "scale", 2),
      padding: integerOption(parsed.values.padding, "padding", 16),
      strict: parsed.values.strict ?? false,
    },
  };
};

const writeAtomically = async (output: string, bytes: Uint8Array) => {
  const temporary = resolve(
    dirname(output),
    `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, output);
  } catch (error) {
    throw new CharDeskCliCommandError(
      "write-failed",
      `Could not write output: ${output}`,
      { cause: error }
    );
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
};

const warning = (diagnostic: CharDeskCliDiagnostic) => {
  const position = diagnostic.offset === undefined ? "" : ` at ${diagnostic.offset}`;
  return `warning ${diagnostic.code}${position}: ${diagnostic.message}\n`;
};

const errorCode = (error: unknown) => {
  if (
    error instanceof CharDeskCliCommandError
    || error instanceof CharDeskCliRenderError
    || error instanceof CharDeskCliRasterProcessError
    || error instanceof BlackboardPackageError
  ) {
    return error.code;
  }
  return "render-failed";
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "CharDesk command failed.";

const runRender = async (
  command: RenderCommand,
  input: ResolvedCharDeskInput,
  streams: CliStreams,
  cwd: string
) => {
  const inputMode = input.inputMode;
  const rendered = command.format === "png"
    ? await renderSourceInRasterProcess({
        source: input.source,
        inputMode,
        scale: command.scale,
        padding: command.padding,
      })
    : await renderSource({
        source: input.source,
        inputMode,
        format: command.format,
        scale: command.scale,
        padding: command.padding,
      });
  if (command.strict && rendered.diagnostics.length > 0) {
    const rejected = {
      status: "rejected",
      format: rendered.format,
      diagnostics: rendered.diagnostics,
    };
    if (command.json) streams.stdout.write(`${JSON.stringify(rejected)}\n`);
    else rendered.diagnostics.forEach((item) => streams.stderr.write(warning(item)));
    return 1;
  }

  const output = command.output === "-" ? "-" : resolve(cwd, command.output);
  const artifactBytes = command.format === "chardesk"
    ? new TextEncoder().encode(serializeCharDeskDocumentEnvelope({
        mode: "freeform",
        body: decodeUtf8(rendered.bytes),
      }))
    : rendered.bytes;
  if (output === "-") streams.stdout.write(artifactBytes);
  else await writeAtomically(output, artifactBytes);
  const result = {
    status: "rendered",
    output,
    format: rendered.format,
    inputMode: rendered.inputMode,
    renderer: rendered.renderer,
    pipeline: rendered.pipeline,
    columns: rendered.columns,
    rows: rendered.rows,
    ...(rendered.width === undefined ? {} : { width: rendered.width }),
    ...(rendered.height === undefined ? {} : { height: rendered.height }),
    diagnostics: rendered.diagnostics,
  };
  if (output !== "-") {
    if ("json" in command && command.json) streams.stdout.write(`${JSON.stringify(result)}\n`);
    else streams.stdout.write(`${output}\n`);
  }
  if (!command.json) {
    rendered.diagnostics.forEach((item) => streams.stderr.write(warning(item)));
    input.warnings.forEach((item) => streams.stderr.write(`warning blackboard: ${item}\n`));
  }
  return 0;
};

const omittedSummary = (
  omitted: ReturnType<typeof projectCharDeskInspect>["omitted"],
) => {
  const parts = (Object.entries(omitted) as Array<[
    keyof typeof omitted,
    number,
  ]>).flatMap(([side, amount]) => amount === 0 ? [] : [`${side} ${amount}`]);
  return parts.length === 0 ? "none" : parts.join(" · ");
};

const runInspect = async (
  command: InspectCommand,
  input: ResolvedCharDeskInput,
  streams: CliStreams,
) => {
  const compiled = await compileInspectSource({
    source: input.source,
    inputMode: input.inputMode,
    canvas: command.canvas,
  });
  if (
    command.region
    && (command.region.x >= compiled.columns || command.region.y >= compiled.rows)
  ) {
    throw new CharDeskCliCommandError(
      "region-out-of-bounds",
      `Region origin must be inside the ${compiled.columns}×${compiled.rows} grid.`,
    );
  }
  const projection = projectCharDeskInspect(compiled.document, {
    region: command.region,
    ruler: command.ruler,
    styles: command.styles,
  });
  const status = compiled.diagnostics.length === 0 ? "valid" : "invalid";
  const endX = projection.view.x + projection.view.columns - 1;
  const endY = projection.view.y + projection.view.rows - 1;
  const result = {
    status,
    projection: compiled.projection,
    inputMode: compiled.inputMode,
    renderer: compiled.renderer,
    pipeline: compiled.pipeline,
    columns: compiled.columns,
    rows: compiled.rows,
    ...(compiled.projection === "blocks" ? { canvas: compiled.canvas } : {}),
    view: projection.view,
    omitted: projection.omitted,
    text: projection.text,
    ...(projection.styleText ? { styles: projection.styleText } : {}),
    diagnostics: compiled.diagnostics,
  };
  if (command.json) {
    streams.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    const output = [
    `${command.kind}: ${status}`,
    `projection: ${compiled.projection}`,
    `renderer: ${compiled.renderer}`,
    `pipeline: ${compiled.pipeline.join(" → ")}`,
    `grid: ${compiled.columns} cols × ${compiled.rows} rows`,
    ...(compiled.projection === "blocks"
      ? [`canvas: ${compiled.canvas.columns} cols × ${compiled.canvas.rows} rows`]
      : []),
    `view: x=${projection.view.x}..${endX}, y=${projection.view.y}..${endY} · ${projection.view.columns}×${projection.view.rows} cells`,
    `omitted: ${omittedSummary(projection.omitted)}`,
    "",
    projection.text,
    ];
    if (projection.styleText) output.push("", projection.styleText);
    streams.stdout.write(`${output.join("\n")}\n`);
  }
  compiled.diagnostics.forEach((item) => streams.stderr.write(warning(item)));
  input.warnings.forEach((item) => streams.stderr.write(`warning blackboard: ${item}\n`));
  return status === "valid" ? 0 : 1;
};

export const runCli = async (
  args: readonly string[],
  streams: CliStreams,
  cwd = process.cwd(),
): Promise<number> => {
  let parsed: ReturnType<typeof parseCliArguments>;
  try {
    parsed = parseCliArguments(args);
  } catch (error) {
    streams.stderr.write(`${errorMessage(error)}\n\n${CLI_USAGE}\n`);
    return 2;
  }
  if (parsed.help) {
    streams.stdout.write(`${CLI_USAGE}\n`);
    return 0;
  }

  const command = parsed.command;
  try {
    if (command.kind === "migrate") {
      const path = await migrateBlackboardFile(cwd, command.input, command.output);
      streams.stdout.write(`${path}\n`);
      return 0;
    }
    if (command.kind === "init") {
      const root = await initializeCharDeskWorkspace({
        cwd,
        directory: command.directory,
        title: command.title,
        mode: command.mode,
      });
      streams.stdout.write(`${root}\n`);
      return 0;
    }
    if (command.kind === "open") {
      const options = { request: command, cwd, port: command.port };
      if (command.foreground) {
        const session = await startCharDeskOpenSession(options);
        const result = {
          status: "opened",
          input: command.input,
          url: session.url,
          runtimeReady: false,
          watching: true,
          foreground: true,
        };
        streams.stdout.write(command.json
          ? `${JSON.stringify(result)}\n`
          : command.browser
            ? "Opened CharDesk. Source updates are live.\n"
            : `${session.url}\n`);
        if (command.browser) await launchCharDeskOpenSession(session);
        await waitForOpenSession(session);
        return 0;
      }
      const session = await openManagedSession({
        options,
        cliEntry: process.argv[1]!,
        browser: command.browser,
      });
      if (command.json) {
        const result = {
          status: session.status,
          input: session.input,
          url: session.url,
          runtimeReady: session.runtimeReady,
          watching: true,
          ...(session.fallbackOutput ? { fallbackOutput: session.fallbackOutput } : {}),
          ...(session.message ? { message: session.message } : {}),
        };
        streams.stdout.write(`${JSON.stringify(result)}\n`);
      }
      else if (session.status === "fallback") {
        streams.stdout.write(`${session.fallbackOutput}\n`);
        streams.stderr.write(`${session.message}\n`);
      } else if (!command.browser) streams.stdout.write(`${session.url}\n`);
      else streams.stdout.write(
        session.status === "reused"
          ? "Reused CharDesk. Source updates are live.\n"
          : "Opened CharDesk. Source updates are live.\n"
      );
      return 0;
    }
    if (command.kind === "__serve") {
      return await serveManagedOpenSession({
        options: { request: command, cwd, port: command.port },
        sessionFile: command.sessionFile,
      });
    }
    if (command.kind === "status") {
      const sessions = await listManagedSessions(command.input, cwd);
      if (command.json) {
        const result = {
          status: "ok",
          sessions: sessions.map((session) => ({
            input: session.input,
            url: session.url,
            runtimeReady: session.runtimeReady,
            startedAt: session.startedAt,
            idleExpiresAt: session.idleExpiresAt,
          })),
        };
        streams.stdout.write(`${JSON.stringify(result)}\n`);
      }
      else if (sessions.length === 0) streams.stdout.write("No active CharDesk sessions.\n");
      else sessions.forEach((session) => streams.stdout.write(`${session.input}\n${session.url}\n`));
      return 0;
    }
    if (command.kind === "close") {
      const closed = await closeManagedSessions(command.all ? undefined : command.input, cwd);
      const result = { status: "closed", count: closed };
      streams.stdout.write(command.json ? `${JSON.stringify(result)}\n` : `Closed ${closed} session(s).\n`);
      return 0;
    }
    if (!("inputMode" in command)) throw new Error("Invalid CharDesk command state.");
    const input = await resolveCharDeskInput({
      request: command,
      cwd,
      stdin: streams.stdin,
    });
    if (command.kind === "inspect") return await runInspect(command, input, streams);
    if (command.kind === "render") return await runRender(command, input, streams, cwd);
    throw new Error("Unhandled CharDesk command.");
  } catch (error) {
    const result = {
      status: "error",
      code: errorCode(error),
      message: errorMessage(error),
    };
    if ("json" in command && command.json) streams.stdout.write(`${JSON.stringify(result)}\n`);
    else streams.stderr.write(`${result.code}: ${result.message}\n`);
    return 1;
  }
};
