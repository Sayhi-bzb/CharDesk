import { useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
import {
  Box, Button, Markdown, Root, ScrollArea, Tab, TabPanel, Tabs, Text,
  type CellPoint, type MarkdownCodeToken, type RootProps, type WidgetCommand,
} from "@chardesk/cell-ui";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe, useCellScrollState, type CellScrollState } from "@chardesk/cell-ui/browser";
import { GallerySurface, useGalleryAppearance } from "./appearance";
import { CellArticleSurface } from "./cell-article-surface";
import { sourceLinksForComponent, type ComponentDocument } from "./component-catalog";
import { installationCommands, publicUsage, type GuideContent } from "./docs-content";
import { CODE_BLOCK_PREVIEW_LINES, shouldCollapseCode } from "./code-block-lines";
import { ClassicMacintoshDemo, MarkdownIntroductionDemo, NotesIntroductionDemo, ProgressIntroductionDemo, SettingsIntroductionDemo } from "./introduction-demos";
import highlightedCode from "virtual:gallery-code-tokens";

type ApiRow = Readonly<{ name: string; type: string; description: string }>;
type ArticlePart = Readonly<{
  id?: string;
  source?: string;
  code?: Readonly<{ id: string; source: string; language: "tsx" | "text" }>;
  api?: readonly ApiRow[];
  installation?: boolean;
}>;
type ArticleItem = Readonly<{ type: "part"; part: ArticlePart }> | Readonly<{
  type: "preview";
  Demo: ComponentType;
  probeId?: string;
}>;
type ArticleSegment = Readonly<{ id: string; parts: readonly ArticlePart[] }>;
type ArticleGroup = ArticleSegment | Extract<ArticleItem, { type: "preview" }>;
type CopyState = "Copy" | "Copied" | "Copy failed";

const guideDemos = {
  settings: SettingsIntroductionDemo,
  progress: ProgressIntroductionDemo,
  notes: NotesIntroductionDemo,
  macintosh: ClassicMacintoshDemo,
  markdown: MarkdownIntroductionDemo,
} satisfies Record<NonNullable<GuideContent["sections"][number]["demo"]>, ComponentType>;

const fence = (code: string, language: string) => `\`\`\`${language}\n${code}\n\`\`\``;
const heading = (title: string, body?: string) => [`## ${title}`, body].filter(Boolean).join("\n\n");
const link = ({ label, href }: Readonly<{ label: string; href: string }>) => `[${label}](${href})`;
const escapeTable = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const apiSource = (rows: readonly ApiRow[]) => [
  "| Prop | Type | Description |",
  "| --- | --- | --- |",
  ...rows.map(({ name, type, description }) =>
    `| \`${escapeTable(name)}\` | \`${escapeTable(type)}\` | ${escapeTable(description)} |`),
].join("\n");

const componentItems = (document: ComponentDocument): ArticleItem[] => [
  { type: "part", part: { source: `# ${document.title}\n\n${document.description}` } },
  { type: "part", part: { id: "preview", source: heading("Preview") } },
  { type: "preview", Demo: document.Demo, probeId: document.probeId },
  { type: "part", part: { id: "installation", source: heading("Installation"), installation: true } },
  { type: "part", part: { id: "usage", source: heading("Usage"), code: { id: "usage", source: publicUsage(document.usage), language: "tsx" } } },
  { type: "part", part: { id: "source", source: [heading("View source", "Start with the component definition, then open its supporting implementation as needed."),
    ...sourceLinksForComponent(document.slug).map((source) => `- ${link(source)}`)].join("\n\n") } },
  { type: "part", part: { id: "api", source: heading("API"), api: document.api } },
];

const guideItems = (guide: GuideContent): ArticleItem[] => {
  const items: ArticleItem[] = [{ type: "part", part: { source: `# ${guide.title}\n\n${guide.description}` } }];
  for (const section of guide.sections) {
    const Demo = section.demo ? guideDemos[section.demo] : undefined;
    items.push({ type: "part", part: {
      id: section.id,
      source: heading(section.title, section.body),
      installation: section.installation,
    } });
    if (Demo) items.push({ type: "preview", Demo, probeId: section.probeId });
    if (section.code) items.push({ type: "part", part: {
      code: section.code ? { id: section.id, source: section.code, language: section.codeLanguage ?? "tsx" } : undefined,
    } });
    if (section.link || section.links || section.api) items.push({ type: "part", part: {
      source: [section.link ? link(section.link) : undefined,
        ...(section.links?.map((item) => `- ${link(item)}`) ?? [])].filter(Boolean).join("\n\n"),
      api: section.api,
    } });
  }
  return items;
};

const groupItems = (items: readonly ArticleItem[], prefix: string): ArticleGroup[] => {
  const groups: ArticleGroup[] = [];
  let parts: ArticlePart[] = [];
  const flush = () => {
    if (parts.length) groups.push({ id: `${prefix}-${groups.length}`, parts });
    parts = [];
  };
  for (const item of items) {
    if (item.type === "part") parts.push(item.part);
    else { flush(); groups.push(item); }
  }
  flush();
  return groups;
};

const syntaxLines = (source: string, mode: "light" | "dark"): readonly (readonly MarkdownCodeToken[])[] | undefined => {
  const tokens = highlightedCode[source];
  if (!tokens) return undefined;
  const lines: MarkdownCodeToken[][] = [[]];
  for (const token of tokens) {
    for (const [index, content] of token.content.split("\n").entries()) {
      if (index) lines.push([]);
      if (!content) continue;
      const muted = token.color?.includes("string") || token.color?.includes("comment");
      const color = muted ? mode === "light" ? "#555555" : "#aaaaaa" : undefined;
      lines.at(-1)!.push({ content, color });
    }
  }
  return lines;
};

const codeBlock = (
  id: string, code: string, language: string, scroll: CellPoint, copyState: CopyState,
  expanded: boolean, mode: "light" | "dark",
) => {
  const collapsible = shouldCollapseCode(code);
  const visible = collapsible && !expanded ? code.split("\n").slice(0, CODE_BLOCK_PREVIEW_LINES).join("\n") : code;
  const rows = visible.split("\n").length;
  const source = fence(visible, language);
  const gutterWidth = String(code.split("\n").length).length + 2;
  const tokens = language === "tsx" ? syntaxLines(code, mode) : undefined;
  const icon = copyState === "Copied" ? "✓" : copyState === "Copy failed" ? "!" : "⧉";
  return <Box id={`${id}-code`} style={{ width: "100%", gap: 1 }}>
    <Box variant="surface" style={{ direction: "row", width: "100%" }}>
      {rows > 1 ? <Box id={`${id}-numbers`} style={{ width: gutterWidth, paddingTop: 1, flexShrink: 0 }}>
        {Array.from({ length: rows }, (_, index) => <Text key={index}
          textStyle={{ color: mode === "light" ? "#555555" : "#aaaaaa" }}>
          {String(index + 1).padStart(gutterWidth - 1)}
        </Text>)}
      </Box> : null}
      <ScrollArea id={`${id}-scroll`} scrollX={scroll.x} scrollY={scroll.y}
        style={{ flexGrow: 1, flexShrink: 1 }}>
        <Markdown source={source} highlightCodeLine={(line, index) => tokens?.[index]} />
      </ScrollArea>
      <Button id={`${id}-copy`} label={copyState === "Copy" ? "Copy code" : copyState}
        variant="surface" style={{ position: "absolute", top: 0, right: 1 }}><Text>{icon}</Text></Button>
    </Box>
    {collapsible ? <Button id={`${id}-toggle`} variant="ghost">
      <Text>{expanded ? "Show less" : "Show more"}</Text>
    </Button> : null}
  </Box>;
};

const packageManagers = Object.keys(installationCommands) as (keyof typeof installationCommands)[];
const renderPart = (
  part: ArticlePart, prefix: string, manager: keyof typeof installationCommands,
  scroll: CellScrollState, copies: Readonly<Record<string, CopyState>>,
  expanded: Readonly<Record<string, boolean>>, mode: "light" | "dark",
) => {
  const code = part.installation
    ? { id: "installation-command", source: installationCommands[manager], language: "text" as const }
    : part.code;
  const codeId = code ? `${prefix}-${code.id}` : "";
  const tableId = `${prefix}-api-table`;
  const tableSource = part.api ? apiSource(part.api) : null;
  const tableOffset = scroll.offset(`${tableId}-scroll`);
  return <Box key={part.id ?? part.code?.id ?? part.source} id={part.id ? `${prefix}-${part.id}` : undefined}
    style={{ width: "100%", gap: 1 }}>
    {part.source ? <Markdown source={part.source} /> : null}
    {part.installation ? <Tabs id={`${prefix}-package-tabs`} label="Package manager" orientation="horizontal">
      {packageManagers.map((name) => <Tab id={`${prefix}-package-${name}`} key={name}
        controlsId={`${prefix}-package-panel`} selected={manager === name}><Text>{name}</Text></Tab>)}
    </Tabs> : null}
    {code ? part.installation
      ? <TabPanel id={`${prefix}-package-panel`} label={`${manager} installation command`}
        labelledById={`${prefix}-package-${manager}`} style={{ width: "100%" }}>
        {codeBlock(codeId, code.source, code.language, scroll.offset(`${codeId}-scroll`),
          copies[codeId] ?? "Copy", expanded[codeId] ?? false, mode)}
      </TabPanel>
      : codeBlock(codeId, code.source, code.language, scroll.offset(`${codeId}-scroll`),
        copies[codeId] ?? "Copy", expanded[codeId] ?? false, mode) : null}
    {part.installation ? <Markdown source="[Configure the registry](#/guides/installation?section=configure)" /> : null}
    {tableSource ? <ScrollArea id={`${tableId}-scroll`}
      scrollX={tableOffset.x} scrollY={tableOffset.y}
      style={{ width: "100%" }}>
      <Markdown source={tableSource} />
    </ScrollArea> : null}
  </Box>;
};

function ArticleSegmentSurface({ segment, manager, scroll, copies, expanded, mode, focusedId, onCommand }: Readonly<{
  segment: ArticleSegment;
  manager: keyof typeof installationCommands;
  scroll: CellScrollState;
  copies: Readonly<Record<string, CopyState>>;
  expanded: Readonly<Record<string, boolean>>;
  mode: "light" | "dark";
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
}>) {
  const content = useMemo(() => <Root><Box id={`${segment.id}-content`} style={{ width: "100%", gap: 3 }}>
    {segment.parts.map((part) => renderPart(part, segment.id, manager, scroll, copies, expanded, mode))}
  </Box></Root>, [segment, manager, scroll, copies, expanded, mode]);
  const anchorIds = useMemo(() => segment.parts.flatMap((part) => part.id ? [part.id] : []), [segment]);
  return <CellArticleSurface label="Documentation article" probeId={segment.id} content={content}
    anchorIds={anchorIds} focusedId={focusedId} onCommand={onCommand} />;
}

function PreviewCopy({ probeId, state, focusedId, onCommand }: Readonly<{
  probeId: string;
  state: CopyState;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
}>) {
  const id = `preview-copy-${probeId}`;
  const label = state === "Copy" ? "Copy preview" : state;
  const icon = state === "Copied" ? "✓" : state === "Copy failed" ? "!" : "⧉";
  return <div className="docs-preview__copy"><GallerySurface label="Preview actions"
    probeId={`${probeId}-copy`} viewport={{ width: 3, height: 1 }}
    focusedId={focusedId} onCommand={onCommand}>
    <Root><Button id={id} label={label} variant="surface"><Text>{icon}</Text></Button></Root>
  </GallerySurface></div>;
}

export function CellDocumentPage({ document, guide }: Readonly<{ document?: ComponentDocument; guide?: GuideContent }>) {
  const { mode } = useGalleryAppearance();
  const prefix = `article-${guide?.slug ?? document!.slug}`;
  const groups = useMemo(() => groupItems(guide ? guideItems(guide) : componentItems(document!), prefix), [guide, document, prefix]);
  const [manager, setManager] = useState<keyof typeof installationCommands>("npm");
  const scroll = useCellScrollState();
  const [copies, setCopies] = useState<Readonly<Record<string, CopyState>>>({});
  const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const resetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingCopies = useRef(new Set<string>());
  useLayoutEffect(() => () => {
    for (const timer of resetTimers.current.values()) clearTimeout(timer);
    resetTimers.current.clear();
  }, []);
  const copyTargets = useMemo(() => {
    const targets = new Map<string, string>();
    for (const group of groups) if ("parts" in group) for (const part of group.parts) {
      const code = part.installation
        ? { id: "installation-command", source: installationCommands[manager] }
        : part.code;
      if (code) targets.set(`${group.id}-${code.id}`, code.source);
    }
    return targets;
  }, [groups, manager]);
  const selectManager = (selected: keyof typeof installationCommands) => {
    setManager(selected);
    setCopies((current) => Object.fromEntries(Object.entries(current)
      .filter(([id]) => !id.endsWith("-installation-command"))));
  };
  const copyText = (id: string, value: string) => {
    if (pendingCopies.current.has(id)) return;
    pendingCopies.current.add(id);
    void navigator.clipboard.writeText(value).then(() => {
      setCopies((current) => ({ ...current, [id]: "Copied" }));
      clearTimeout(resetTimers.current.get(id));
      resetTimers.current.set(id, setTimeout(() => {
        setCopies((current) => ({ ...current, [id]: "Copy" }));
      }, 2000));
    }).catch(() => setCopies((current) => ({ ...current, [id]: "Copy failed" })))
      .finally(() => pendingCopies.current.delete(id));
  };
  const onCommand = (command: WidgetCommand) => {
    scroll.dispatch(command);
    if (command.type === "focus") setFocusedId(command.targetId);
    else if (command.type === "open-link") window.location.assign(command.href);
    else if (command.type === "set-active") {
      const selected = packageManagers.find((name) => command.targetId.endsWith(`-package-${name}`));
      if (selected) selectManager(selected);
    } else if (command.type === "activate") {
      const selected = packageManagers.find((name) => command.targetId.endsWith(`-package-${name}`));
      if (selected) { selectManager(selected); return; }
      const codeId = command.targetId.replace(/-(copy|toggle)$/u, "");
      if (command.targetId.endsWith("-toggle")) {
        setExpanded((current) => ({ ...current, [codeId]: !current[codeId] }));
      } else if (command.targetId.endsWith("-copy")) {
        const source = copyTargets.get(codeId);
        if (!source) return;
        copyText(codeId, source);
      } else if (command.targetId.startsWith("preview-copy-")) {
        const probeId = command.targetId.slice("preview-copy-".length);
        const surface = window.document.querySelector(`[data-cell-probe="${probeId}"]`);
        const snapshot = surface ? readCellSurfaceProbe(surface) : null;
        const id = command.targetId;
        if (snapshot) copyText(id, formatCellProbe(snapshot, { header: true }));
        else setCopies((current) => ({ ...current, [id]: "Copy failed" }));
      }
    }
  };
  return <main className="docs-page cell-article-page">
    {groups.map((group) => "parts" in group
      ? <ArticleSegmentSurface key={group.id} segment={group} manager={manager} scroll={scroll}
        copies={copies} expanded={expanded} mode={mode} focusedId={focusedId} onCommand={onCommand} />
      : <div key={`preview-${group.probeId ?? groups.indexOf(group)}`} className="docs-preview">
        <group.Demo />
        {group.probeId ? <PreviewCopy probeId={group.probeId}
          state={copies[`preview-copy-${group.probeId}`] ?? "Copy"}
          focusedId={focusedId} onCommand={onCommand} /> : null}
      </div>)}
  </main>;
}
