/* eslint-disable react-refresh/only-export-components */
import "./index.css";
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-maple/fonts.css";

import {
  StrictMode,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Check, Copy, X } from "lucide-react";
import {
  type CharDeskViewerElement,
  defineCharDeskViewer,
} from "@chardesk/viewer";
import {
  Button,
  FloatingSurface,
  IconButton,
  PageFrame,
  PageShell,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  StripeDivider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
  useInPlaceFeedback,
} from "@chardesk/ui";
import { LineNav } from "./components/line-nav";
import {
  CHARGRAPH_EXAMPLES,
  getExampleClipboardSource,
  type CharGraphExampleKind,
  type CharGraphExampleRenderer,
  renderExample,
} from "./examples";

if (!document.querySelector("link[data-chardesk-fonts]")) {
  const fontStylesheet = document.createElement("link");
  fontStylesheet.rel = "stylesheet";
  fontStylesheet.href = "/fonts/fonts.css";
  fontStylesheet.dataset.chardeskFonts = "";
  document.head.append(fontStylesheet);
}

defineCharDeskViewer();

interface RenderedExample {
  readonly id: string;
  readonly kind: CharGraphExampleKind;
  readonly renderer: CharGraphExampleRenderer;
  readonly title: string;
  readonly source: string;
  readonly outputProtocol: string;
  readonly outputText: string;
}

const EXAMPLE_CATEGORIES: readonly {
  kind: CharGraphExampleKind;
  label: string;
}[] = [
  { kind: "block-layout", label: "二维布局" },
  { kind: "flowchart", label: "流程图" },
  { kind: "state", label: "状态图" },
  { kind: "sequence", label: "时序图" },
  { kind: "class", label: "类图" },
  { kind: "er", label: "实体关系图" },
  { kind: "xychart", label: "XY 图表" },
  { kind: "markdown-basics", label: "Markdown 基础排版" },
  { kind: "markdown-structure", label: "列表与表格" },
  { kind: "markdown-code", label: "代码与 Diff" },
  { kind: "markdown-alert", label: "GitHub Alert" },
  { kind: "markdown-math", label: "数学表达" },
];

const RENDERER_LABELS: Record<CharGraphExampleRenderer, string> = {
  "block-layout": "Layout",
  markdown: "Markdown",
  mermaid: "Mermaid",
};

const DEFAULT_CATEGORY: CharGraphExampleKind = "flowchart";
const CATEGORY_HASH_PREFIX = "#type-";
const renderedExampleCache = new Map<string, Promise<RenderedExample>>();

const isExampleKind = (value: string): value is CharGraphExampleKind =>
  EXAMPLE_CATEGORIES.some((category) => category.kind === value);

const categoryHref = (kind: CharGraphExampleKind) =>
  `${CATEGORY_HASH_PREFIX}${kind}`;

const exampleHref = (id: string) => `#${id}`;

const getExamplesForKind = (kind: CharGraphExampleKind) =>
  CHARGRAPH_EXAMPLES.filter((example) => example.kind === kind);

const getFirstExampleId = (kind: CharGraphExampleKind) =>
  getExamplesForKind(kind)[0]?.id ?? CHARGRAPH_EXAMPLES[0]?.id ?? "flowchart";

const readShowcaseLocation = (): {
  kind: CharGraphExampleKind;
  exampleId?: string;
} => {
  if (typeof window === "undefined") return { kind: DEFAULT_CATEGORY };
  const hash = window.location.hash;
  if (hash.startsWith(CATEGORY_HASH_PREFIX)) {
    const kind = hash.slice(CATEGORY_HASH_PREFIX.length);
    return { kind: isExampleKind(kind) ? kind : DEFAULT_CATEGORY };
  }

  const exampleId = hash.startsWith("#") ? hash.slice(1) : "";
  const example = CHARGRAPH_EXAMPLES.find((candidate) => candidate.id === exampleId);
  return example
    ? { kind: example.kind, exampleId: example.id }
    : { kind: DEFAULT_CATEGORY };
};

const loadExample = (
  example: (typeof CHARGRAPH_EXAMPLES)[number]
): Promise<RenderedExample> => {
  const cached = renderedExampleCache.get(example.id);
  if (cached) return cached;

  const pending = renderExample(example)
    .then((output) => ({
      ...example,
      outputProtocol: output.protocolText,
      outputText: output.text,
    }))
    .catch((error: unknown) => {
      renderedExampleCache.delete(example.id);
      throw error;
    });
  renderedExampleCache.set(example.id, pending);
  return pending;
};

function UnicodeViewer({
  source,
  label,
}: {
  source: string;
  label: string;
}) {
  const viewerRef = useRef<CharDeskViewerElement>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.source = source;
    viewer.syntax = "ansi";
    viewer.controls = false;
  }, [source]);

  return (
    <chardesk-viewer
      ref={viewerRef}
      className="block w-full"
      style={
        {
          "--chardesk-background": "var(--background)",
          "--chardesk-border-color": "transparent",
          "--chardesk-radius": 0,
        } as CSSProperties
      }
      aria-label={label}
      controls="false"
      fit="width"
      syntax="ansi"
    />
  );
}

function PageDivider() {
  return (
    <StripeDivider
      bleed
      className="mx-auto w-full max-w-6xl border-x border-separator"
    />
  );
}

function ExampleDivider() {
  return <StripeDivider bleed />;
}

function CopyButton({
  label,
  value,
  target,
}: {
  label: string;
  value: string;
  target: "source" | "unicode";
}) {
  const { feedback, run } = useInPlaceFeedback<"copy">();
  const status = feedback?.target === "copy" ? feedback.status : undefined;
  const actionLabel =
    status === "success"
      ? `${label} copied`
      : status === "error"
        ? `Could not copy ${label}`
        : `Copy ${label}`;
  const FeedbackIcon = status === "success" ? Check : status === "error" ? X : Copy;

  const copy = () =>
    run("copy", () => {
      if (!navigator.clipboard?.writeText) return false;
      return navigator.clipboard.writeText(value).then(() => true);
    });

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              type="button"
              size="xs"
              feedback={status}
              aria-label={actionLabel}
              data-copy-target={target}
              data-copy-feedback={status}
              className="absolute top-3 right-3 z-10 shrink-0"
              onClick={() => void copy()}
            />
          }
        >
          <FeedbackIcon data-icon="inline-start" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="top">{actionLabel}</TooltipPopup>
      </Tooltip>
      <span role="status" className="sr-only">
        {status ? actionLabel : ""}
      </span>
    </>
  );
}

function ExamplePanel({
  label,
  copyValue,
  copyTarget,
  children,
}: {
  label: string;
  copyValue: string;
  copyTarget: "source" | "unicode";
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      data-slot="example-panel"
      className="relative flex min-w-0 flex-col"
    >
      <CopyButton label={label} value={copyValue} target={copyTarget} />
      {children}
    </section>
  );
}

function Example({
  categoryLabel,
  example,
}: {
  categoryLabel: string;
  example: RenderedExample;
}) {
  return (
    <article id={example.id} aria-label={`${categoryLabel} · ${example.title}`}>
      <header className="px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium">{example.title}</h2>
      </header>
      <Separator variant="structural" />
      <div data-slot="example-grid" className="grid min-w-0 lg:grid-cols-2">
        <ExamplePanel
          label={RENDERER_LABELS[example.renderer]}
          copyValue={getExampleClipboardSource(example)}
          copyTarget="source"
        >
          <pre
            data-slot="example-source"
            className="min-h-72 overflow-auto p-4 pr-14 font-mono text-sm leading-relaxed whitespace-pre sm:p-6 sm:pr-16"
          >
            {example.source}
          </pre>
        </ExamplePanel>
        <div
          data-slot="example-output"
          className="border-separator border-t lg:border-t-0 lg:border-l"
        >
          <ExamplePanel
            label="Unicode"
            copyValue={example.outputProtocol}
            copyTarget="unicode"
          >
            <UnicodeViewer
              source={example.outputProtocol}
              label={`${categoryLabel} · ${example.title} · Unicode 输出`}
            />
          </ExamplePanel>
        </div>
      </div>
    </article>
  );
}

function CategoryNavigation({
  activeKind,
  onSelect,
}: {
  activeKind: CharGraphExampleKind;
  onSelect: (kind: CharGraphExampleKind) => void;
}) {
  return (
    <>
      <div data-slot="category-tabs" className="px-3 py-2 sm:px-4">
        <TabsList
          variant="line"
          aria-label="案例分类"
          className="hidden h-8 w-full flex-row gap-1 p-0 lg:flex"
        >
          {EXAMPLE_CATEGORIES.map((category) => (
            <TabsTrigger key={category.kind} value={category.kind}>
              {category.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="lg:hidden">
          <Select
            value={activeKind}
            onValueChange={(kind) => {
              if (isExampleKind(kind)) onSelect(kind);
            }}
          >
            <SelectTrigger className="w-full" aria-label="案例分类">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" position="popper">
              <SelectGroup>
                {EXAMPLE_CATEGORIES.map((category) => (
                  <SelectItem key={category.kind} value={category.kind}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Separator variant="structural" />
    </>
  );
}

function CaseNavigation({
  examples,
  activeExampleId,
  onSelect,
}: {
  examples: readonly (typeof CHARGRAPH_EXAMPLES)[number][];
  activeExampleId: string;
  onSelect: (id: string) => void;
}) {
  const items = examples.map((example) => ({
    title: example.title,
    href: exampleHref(example.id),
  }));

  return (
    <>
      <div data-slot="case-select" className="p-3 2xl:hidden">
        <Select value={activeExampleId} onValueChange={onSelect}>
          <SelectTrigger className="w-full" aria-label="案例">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            <SelectGroup>
              {examples.map((example) => (
                <SelectItem key={example.id} value={example.id}>
                  {example.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Separator variant="structural" className="2xl:hidden" />

      <aside
        data-slot="case-floating-nav"
        className="fixed top-1/2 right-[calc(50%+37rem)] hidden -translate-y-1/2 2xl:block"
      >
        <FloatingSurface variant="panel">
          <LineNav
            aria-label="案例"
            className="px-4"
            items={items}
            activeHref={exampleHref(activeExampleId)}
            activeAriaCurrent="location"
            scrollActiveIntoView={false}
            onItemClick={(item, event) => {
              event.preventDefault();
              onSelect(item.href.slice(1));
            }}
          />
        </FloatingSurface>
      </aside>
    </>
  );
}

function ShowcaseApp() {
  const [activeKind, setActiveKind] = useState(
    () => readShowcaseLocation().kind
  );
  const [activeExampleId, setActiveExampleId] = useState(() => {
    const location = readShowcaseLocation();
    return location.exampleId ?? getFirstExampleId(location.kind);
  });
  const [renderedCategory, setRenderedCategory] = useState<{
    kind: CharGraphExampleKind;
    examples: readonly RenderedExample[];
  }>(() => ({ kind: activeKind, examples: [] }));
  const categoryExamples = useMemo(
    () => getExamplesForKind(activeKind),
    [activeKind]
  );
  const examples = useMemo(
    () =>
      renderedCategory.kind === activeKind ? renderedCategory.examples : [],
    [activeKind, renderedCategory]
  );

  useEffect(() => {
    const syncLocation = () => {
      const location = readShowcaseLocation();
      setActiveKind(location.kind);
      setActiveExampleId(
        location.exampleId ?? getFirstExampleId(location.kind)
      );
    };
    window.addEventListener("hashchange", syncLocation);
    return () => window.removeEventListener("hashchange", syncLocation);
  }, []);

  useEffect(() => {
    let active = true;

    const selected = CHARGRAPH_EXAMPLES.filter(
      (example) => example.kind === activeKind
    );
    void Promise.all(selected.map(loadExample)).then(
      (rendered) => {
        if (active) setRenderedCategory({ kind: activeKind, examples: rendered });
      },
      () => {
        if (active) setRenderedCategory({ kind: activeKind, examples: [] });
      }
    );

    return () => {
      active = false;
    };
  }, [activeKind]);

  useEffect(() => {
    const location = readShowcaseLocation();
    if (
      !location.exampleId ||
      location.kind !== activeKind ||
      !examples.some((example) => example.id === location.exampleId)
    ) {
      return;
    }

    const exampleId = location.exampleId;
    const frame = requestAnimationFrame(() => {
      document.getElementById(exampleId)?.scrollIntoView({
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeKind, examples]);

  useEffect(() => {
    if (examples.length === 0) return;
    let frame = 0;

    const updateActiveExample = () => {
      frame = 0;
      const threshold = Math.min(240, window.innerHeight * 0.35);
      let nextId = examples[0]?.id ?? "";
      for (const example of examples) {
        const element = document.getElementById(example.id);
        if (element && element.getBoundingClientRect().top <= threshold) {
          nextId = example.id;
        }
      }
      if (
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
      ) {
        nextId = examples.at(-1)?.id ?? nextId;
      }
      setActiveExampleId((current) => (current === nextId ? current : nextId));
    };

    const scheduleUpdate = () => {
      if (frame === 0) frame = requestAnimationFrame(updateActiveExample);
    };
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [examples]);

  const selectCategory = (kind: CharGraphExampleKind) => {
    setActiveKind(kind);
    setActiveExampleId(getFirstExampleId(kind));
    window.location.hash = categoryHref(kind);
  };

  const selectExample = (id: string) => {
    if (!categoryExamples.some((example) => example.id === id)) return;
    setActiveExampleId(id);
    const href = exampleHref(id);
    if (window.location.hash === href) {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
      return;
    }
    window.location.hash = href;
  };

  const activeLabel =
    EXAMPLE_CATEGORIES.find((category) => category.kind === activeKind)?.label ??
    "流程图";

  return (
    <PageShell>
      <main className="flex flex-1 flex-col">
        <PageFrame
          as="header"
          bleed
          boundaries="start"
          data-frame="header"
          className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 px-4 sm:px-6"
        >
          <h1 className="text-sm font-medium">
            <a href="/">CharGraph</a>
          </h1>
          <nav aria-label="Primary" className="ml-auto flex items-center gap-1">
            <Button asChild tone="subtle" size="sm">
              <a href="/">CharDesk</a>
            </Button>
            <Button asChild tone="subtle" size="sm">
              <a href="https://github.com/Sayhi-bzb/CharDesk">GitHub</a>
            </Button>
          </nav>
        </PageFrame>
        <PageDivider />

        <PageFrame
          as="section"
          boundaries="none"
          data-frame="content"
          className="mx-auto w-full max-w-6xl flex-1"
        >
          <Tabs
            value={activeKind}
            onValueChange={(kind) => {
              if (isExampleKind(kind)) selectCategory(kind);
            }}
            className="gap-0"
          >
            <CategoryNavigation
              activeKind={activeKind}
              onSelect={selectCategory}
            />
            {EXAMPLE_CATEGORIES.map((category) => (
              <TabsContent
                key={category.kind}
                value={category.kind}
                className="min-w-0"
              >
                {category.kind === activeKind ? (
                  <>
                    <CaseNavigation
                      examples={categoryExamples}
                      activeExampleId={activeExampleId}
                      onSelect={selectExample}
                    />
                    <div className="min-w-0">
                      {examples.map((example, index) => (
                        <div key={example.id}>
                          <Example
                            categoryLabel={activeLabel}
                            example={example}
                          />
                          {index < examples.length - 1 ? (
                            <ExampleDivider />
                          ) : null}
                        </div>
                      ))}
                      {examples.length > 0 ? (
                        <Separator
                          variant="structural"
                          data-boundary="examples-end"
                        />
                      ) : null}
                    </div>
                  </>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        </PageFrame>
      </main>

      <PageDivider />
      <PageFrame
        as="footer"
        bleed
        boundaries="end"
        data-frame="footer"
        className="mx-auto flex h-14 w-full max-w-6xl shrink-0 items-center gap-2 px-4 text-sm text-muted-foreground sm:px-6"
      >
        <p>CharGraph · CharDesk</p>
        <Button asChild tone="link" size="sm" className="ml-auto">
          <a href="https://github.com/Sayhi-bzb/CharDesk">GitHub</a>
        </Button>
      </PageFrame>
    </PageShell>
  );
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("CharGraph app root is missing.");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <ShowcaseApp />
    </TooltipProvider>
  </StrictMode>
);
