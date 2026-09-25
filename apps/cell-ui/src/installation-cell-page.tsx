import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box, Button, Markdown, Root, ScrollArea, Text,
  type MarkdownCodeBlock, type WidgetCommand,
} from "@chardesk/cell-ui";
import { useGalleryAppearance } from "./appearance";
import { CellArticleSurface } from "./cell-article-surface";
import type { GuideContent } from "./docs-content";
import installationTokens from "virtual:gallery-installation-code-tokens";

type InstallationSection = GuideContent["sections"][number];
type ScrollOffsets = Readonly<Record<string, number>>;
type CopyLabels = Readonly<Record<string, string>>;
type CodeColors = Readonly<Record<"key" | "value" | "command", string>>;
const codeColors: Readonly<Record<"light" | "dark", CodeColors>> = {
  light: { key: "#0550ae", value: "#116329", command: "#8250df" },
  dark: { key: "#79c0ff", value: "#7ee787", command: "#d2a8ff" },
};

const sectionSource = (section: InstallationSection) => [
  `## ${section.title}`,
  section.body,
  section.code ? `\`\`\`${section.id === "configure" ? "json" : "bash"}\n${section.code}\n\`\`\`` : undefined,
  section.link ? `[${section.link.label}](${section.link.href})` : undefined,
].filter(Boolean).join("\n\n");

const codeBlock = (
  section: InstallationSection,
  block: MarkdownCodeBlock,
  scrollX: number,
  copyLabel: string,
  colors: CodeColors,
) => {
  const id = `installation-${section.id}`;
  const rows = block.code.split("\n").length;
  const icon = copyLabel === "Copied" ? "✓" : copyLabel === "Copy failed" ? "!" : "⧉";
  const syntax = block.code === section.code ? installationTokens[section.id] : undefined;
  return <Box id={`${id}-code-frame`}
    style={{ width: "100%", height: rows + 2 }}>
    <ScrollArea id={`${id}-code-scroll`} scrollX={scrollX}
      style={{ width: "100%", height: "100%" }}>
      <Markdown source={block.raw.trimEnd()}
        highlightCodeLine={(line, index) => {
          const tokens = syntax?.[index];
          return tokens?.map(({ content, role }) => ({ content, color: role ? colors[role] : undefined }));
        }} />
    </ScrollArea>
    <Button id={`${id}-copy`} label={copyLabel === "Copy" ? "Copy code" : copyLabel}
      variant="surface" style={{ position: "absolute", top: 0, right: 1 }}>
      <Text>{icon}</Text>
    </Button>
  </Box>;
};

const articleContent = (guide: GuideContent, scroll: ScrollOffsets, copy: CopyLabels, colors: CodeColors) =>
  <Root><Box id="installation-article-content" style={{ width: "100%", gap: 3 }}>
    <Markdown source={`# ${guide.title}\n\n${guide.description}`} />
    {guide.sections.map((section) => <Box id={`installation-${section.id}`} key={section.id} style={{ width: "100%" }}>
      <Markdown source={sectionSource(section)}
        renderCodeBlock={(block) => codeBlock(section, block, scroll[section.id] ?? 0, copy[section.id] ?? "Copy", colors)} />
    </Box>)}
  </Box></Root>;

export function InstallationCellPage({ guide }: Readonly<{ guide: GuideContent }>) {
  const { mode } = useGalleryAppearance();
  const resetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [scroll, setScroll] = useState<ScrollOffsets>({});
  const [copy, setCopy] = useState<CopyLabels>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useLayoutEffect(() => () => {
    for (const timer of resetTimers.current.values()) clearTimeout(timer);
    resetTimers.current.clear();
  }, []);
  const content = useMemo(() => articleContent(guide, scroll, copy, codeColors[mode]), [guide, scroll, copy, mode]);
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") {
      setFocusedId(command.targetId);
    } else if (command.type === "scroll") {
      const section = guide.sections.find(({ id }) => command.targetId === `installation-${id}-code-scroll`);
      if (section) setScroll((current) => ({ ...current, [section.id]: command.scrollX }));
    } else if (command.type === "activate") {
      const section = guide.sections.find(({ id }) => command.targetId === `installation-${id}-copy`);
      if (section?.code) {
        void navigator.clipboard.writeText(section.code).then(() => {
          setCopy((current) => ({ ...current, [section.id]: "Copied" }));
          clearTimeout(resetTimers.current.get(section.id));
          resetTimers.current.set(section.id, setTimeout(() => {
            setCopy((current) => ({ ...current, [section.id]: "Copy" }));
          }, 2000));
        }).catch(() => setCopy((current) => ({ ...current, [section.id]: "Copy failed" })));
      }
    } else if (command.type === "open-link") {
      window.location.assign(command.href);
    }
  };
  return <main className="docs-page cell-article-page">
    <CellArticleSurface label="Installation article" probeId="installation-article"
      content={content} anchorIds={guide.sections.map(({ id }) => id)}
      focusedId={focusedId} onCommand={onCommand} />
  </main>;
}
