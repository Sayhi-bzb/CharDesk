import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
import {
  Box, Button, Markdown, Root, ScrollArea, Tab, TabPanel, Tabs, Text, createWidgetDescriptor,
  type CellPoint, type CellRect, type RootProps, type WidgetCommand, type WidgetDescriptor,
} from "@chardesk/cell-ui";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe, useCellScrollState, type CellScrollState } from "@chardesk/cell-ui/browser";
import { useGalleryAppearance } from "./appearance";
import { CellArticleSurface } from "./cell-article-surface";
import { DocumentSceneContext, type DocumentSceneFragment } from "./document-scene";
import { sourceLinksForComponent, type ComponentDocument } from "./component-catalog";
import { installationCommands, publicUsage, type GuideContent } from "./docs-content";
import { CODE_BLOCK_PREVIEW_LINES, shouldCollapseCode } from "./code-block-lines";
import { ClassicMacintoshDemo, MarkdownIntroductionDemo, NotesIntroductionDemo, ProgressIntroductionDemo, SettingsIntroductionDemo } from "./introduction-demos";
import { OverlayHostDemo } from "./sections/overlay-host";

type ApiRow = Readonly<{ name: string; type: string; description: string }>;
type ArticlePart = Readonly<{
  id?: string;
  source?: string;
  code?: Readonly<{ id: string; source: string; language: "tsx" | "bash" | "text" }>;
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
  "host-overlays": OverlayHostDemo,
} satisfies Record<NonNullable<GuideContent["sections"][number]["demo"]>, ComponentType>;
const guideDemoProbeIds = {
  settings: "intro-settings", progress: "intro-progress", notes: "intro-notes",
  macintosh: "classic-macintosh-example", markdown: "markdown-example",
  "host-overlays": "host-top-surface",
} satisfies Record<keyof typeof guideDemos, string>;
const MountedDemo = memo(function MountedDemo({ Demo }: Readonly<{ Demo: ComponentType }>) {
  return <Demo />;
});

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
    if (Demo) items.push({ type: "preview", Demo,
      probeId: section.probeId ?? guideDemoProbeIds[section.demo!] });
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

const codeBlock = (
  id: string, code: string, language: string, scroll: CellPoint, copyState: CopyState,
  expanded: boolean, mode: "light" | "dark",
) => {
  const collapsible = shouldCollapseCode(code);
  const visible = collapsible && !expanded ? code.split("\n").slice(0, CODE_BLOCK_PREVIEW_LINES).join("\n") : code;
  const rows = visible.split("\n").length;
  const source = fence(visible, language);
  const gutterWidth = String(code.split("\n").length).length + 2;
  const icon = copyState === "Copied" ? "✓" : copyState === "Copy failed" ? "!" : "󰆏";
  return <Box id={`${id}-code`} variant="surface" style={{ width: "100%", gap: 0 }}>
    <Box style={{ direction: "row", width: "100%" }}>
      {rows > 1 ? <Box id={`${id}-numbers`} style={{ width: gutterWidth, paddingTop: 1, flexShrink: 0 }}>
        {Array.from({ length: rows }, (_, index) => <Text key={index}
          textStyle={{ color: mode === "light" ? "#555555" : "#aaaaaa" }}>
          {String(index + 1).padStart(gutterWidth - 1)}
        </Text>)}
      </Box> : null}
      <ScrollArea id={`${id}-scroll`} scrollX={scroll.x} scrollY={scroll.y}
        style={{ flexGrow: 1, flexShrink: 1 }}>
        <Markdown source={source} />
      </ScrollArea>
      <Button id={`${id}-copy`} label={copyState === "Copy" ? "Copy code" : copyState}
        variant="surface" style={{ position: "absolute", top: 0, right: 1 }}><Text>{icon}</Text></Button>
    </Box>
    {collapsible ? <Box id={`${id}-footer`} style={{ direction: "row", width: "100%" }}>
      <Box style={{ flexGrow: 1 }} />
      <Button id={`${id}-toggle`} variant="ghost">
        <Text>{expanded ? "Show less" : "Show more"}</Text>
      </Button>
      <Box style={{ flexGrow: 1 }} />
    </Box> : null}
  </Box>;
};

const packageManagers = Object.keys(installationCommands) as (keyof typeof installationCommands)[];
const renderPart = (
  part: ArticlePart, prefix: string, manager: keyof typeof installationCommands,
  scroll: CellScrollState, copies: Readonly<Record<string, CopyState>>,
  expanded: Readonly<Record<string, boolean>>, mode: "light" | "dark",
) => {
  const code = part.installation
    ? { id: "installation-command", source: installationCommands[manager], language: "bash" as const }
    : part.code;
  const codeId = code ? `${prefix}-${code.id}` : "";
  const tableId = `${prefix}-api-table`;
  const tableSource = part.api ? apiSource(part.api) : null;
  const tableOffset = scroll.offset(`${tableId}-scroll`);
  return <Box key={part.id ?? part.code?.id ?? part.source} id={part.id ? `${prefix}-${part.id}` : undefined}
    style={{ width: "100%", gap: 0 }}>
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

const explicitIds = (node: WidgetDescriptor): string[] => [
  ...(node.explicitId ? [node.explicitId] : []), ...node.children.flatMap(explicitIds),
];

function previewScene(probeId: string, fragment: DocumentSceneFragment | undefined, copyState: CopyState,
  scroll: CellScrollState, layout: "center" | "fill") {
  const previewId = `article-preview-${probeId}`;
  const icon = copyState === "Copied" ? "✓" : copyState === "Copy failed" ? "!" : "󰆏";
  const previewHeight = fragment
    ? Math.max(fragment.viewport.height, fragment.overlayViewport.height) : 1;
  return <Box id={previewId} key={previewId} style={{ width: "100%", paddingTop: 1, paddingBottom: 1 }}>
    {fragment ? <ScrollArea id={`${previewId}-scroll`} variant="ghost"
      scrollX={scroll.offset(`${previewId}-scroll`).x}
      scrollY={scroll.offset(`${previewId}-scroll`).y}
      style={{ width: "100%", height: previewHeight }}>
      <Box style={{ direction: "row", width: layout === "center" ? "100%" : Math.max(fragment.viewport.width, 1),
        minWidth: layout === "center" ? fragment.viewport.width : undefined }}>
        {layout === "center" ? <Box style={{ flexGrow: 1 }} /> : null}
        <Box id={`${previewId}-scope`} overlayScope
          style={{ width: fragment.viewport.width, height: previewHeight, flexShrink: 0 }}>
          <Box id={`${previewId}-content`} probeId={probeId} probeLabel={fragment.label}
            presentation={fragment.presentation}
            style={{ ...fragment.root.props.style, width: fragment.viewport.width,
              height: fragment.viewport.height }}>
            {fragment.root.props.children}
          </Box>
        </Box>
        {layout === "center" ? <Box style={{ flexGrow: 1 }} /> : null}
      </Box>
    </ScrollArea> : <Box style={{ width: "100%", height: 1 }} />}
    <Button id={`preview-copy-${probeId}`} label={copyState === "Copy" ? "Copy preview" : copyState}
      variant="surface" style={{ position: "absolute", top: 1, right: 1 }}><Text>{icon}</Text></Button>
  </Box>;
}

export function CellDocumentPage({ document, guide }: Readonly<{ document?: ComponentDocument; guide?: GuideContent }>) {
  const { mode } = useGalleryAppearance();
  const prefix = `article-${guide?.slug ?? document!.slug}`;
  const groups = useMemo(() => groupItems(guide ? guideItems(guide) : componentItems(document!), prefix), [guide, document, prefix]);
  const [sceneWidth, setSceneWidth] = useState(72);
  const [fragments, setFragments] = useState<Readonly<Record<string, DocumentSceneFragment>>>({});
  const regionsRef = useRef<Readonly<Record<string, CellRect>>>({});
  const register = useCallback((id: string, fragment: DocumentSceneFragment | null) => {
    setFragments((current) => {
      if (!fragment && !current[id]) return current;
      if (!fragment) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: fragment };
    });
  }, []);
  const sceneContext = useMemo(() => ({ width: sceneWidth, register }), [sceneWidth, register]);
  const previews = useMemo(() => groups.filter((group): group is Extract<ArticleItem, { type: "preview" }> =>
    "Demo" in group), [groups]);
  const previewRegionIds = useMemo(() => previews.map(({ probeId }) => `article-preview-${probeId}-content`), [previews]);
  const anchorTargets = useMemo(() => Object.fromEntries(groups.flatMap((group) => "parts" in group
    ? group.parts.flatMap((part) => part.id ? [[part.id, `${group.id}-${part.id}`]] : []) : [])), [groups]);
  const anchorIds = useMemo(() => Object.keys(anchorTargets), [anchorTargets]);
  const fragmentOwners = useMemo(() => new Map(Object.entries(fragments).flatMap(([probeId, fragment]) =>
    explicitIds(createWidgetDescriptor(fragment.root, {}, fragment.presentation)!).map((id) => [id, probeId] as const))), [fragments]);
  const [manager, setManager] = useState<keyof typeof installationCommands>("npm");
  const scroll = useCellScrollState();
  const [copies, setCopies] = useState<Readonly<Record<string, CopyState>>>({});
  const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeFragmentId, setActiveFragmentId] = useState<string | null>(null);
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
    let owner = [...previews].reverse().find(({ probeId }) =>
      command.targetId === probeId || command.targetId.startsWith(`${probeId}-`))?.probeId
      ?? fragmentOwners.get(command.targetId);
    let ancestorEnd = command.targetId.lastIndexOf("/");
    while (!owner && ancestorEnd > 0) {
      owner = fragmentOwners.get(command.targetId.slice(0, ancestorEnd));
      ancestorEnd = command.targetId.lastIndexOf("/", ancestorEnd - 1);
    }
    if (owner) {
      setActiveFragmentId(owner);
      fragments[owner]?.onCommand(command);
      return;
    }
    if (command.type === "focus") setActiveFragmentId(null);
    if (command.type === "open-link") window.location.assign(command.href);
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
        const surface = window.document.querySelector(`[data-cell-probe="${prefix}"]`);
        const region = regionsRef.current[`article-preview-${probeId}-content`];
        const snapshot = surface && region ? readCellSurfaceProbe(surface, { region, probeId }) : null;
        const id = command.targetId;
        if (snapshot) copyText(id, formatCellProbe(snapshot, { header: true }));
        else setCopies((current) => ({ ...current, [id]: "Copy failed" }));
      }
    }
  };
  const content = <Root><Box id={`${prefix}-content`} style={{ width: "100%", gap: 1 }}>
    {groups.map((group) => "parts" in group
      ? <Box key={group.id} style={{ width: "100%", gap: 1 }}>
        {group.parts.map((part) => renderPart(part, group.id, manager, scroll, copies, expanded, mode))}
      </Box>
      : previewScene(group.probeId!, fragments[group.probeId!],
        copies[`preview-copy-${group.probeId}`] ?? "Copy", scroll, guide ? "center" : "fill"))}
  </Box></Root>;
  return <>
    <main className="docs-page cell-article-page">
      <CellArticleSurface label="Documentation article" probeId={prefix} content={content}
        anchorIds={anchorIds} anchorTargets={anchorTargets} regionIds={previewRegionIds}
        regionsRef={regionsRef} onWidthChange={setSceneWidth}
        focusedId={activeFragmentId ? fragments[activeFragmentId]?.focusedId ?? null : focusedId}
        onCommand={onCommand} />
    </main>
    <DocumentSceneContext.Provider value={sceneContext}>
      {previews.map(({ probeId, Demo }) => <MountedDemo key={probeId} Demo={Demo} />)}
    </DocumentSceneContext.Provider>
  </>;
}
