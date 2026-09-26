import { describe, expect, it, vi } from "vitest";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  Box, CellUiRuntime, Markdown, Root, ScrollArea, Text, createWidgetDescriptor,
  reconcileWidgetTree } from "./index.js";
import { createRuntimeWidgetDescriptor, MarkdownDescriptorCache, type WidgetDescriptor } from "./react.js";

const view = (source: string, scrollY = 0, style?: { padding?: number }) => <Root>
  <ScrollArea id="scroll" scrollY={scrollY} style={{ width: 24, height: 4 }}>
    <Markdown id="document" source={source} style={style} />
  </ScrollArea>
</Root>;

const markdownChild = (descriptor: NonNullable<ReturnType<typeof createWidgetDescriptor>>) =>
  descriptor.children[0]!.children[0]!;

describe("runtime Markdown preparation", () => {
  it("reuses a stable subtree and its validated nodes across scroll commits", () => {
    const source = "# Notes\n\nA [link](https://example.com).\n\nSecond paragraph.";
    const cache = new MarkdownDescriptorCache();
    const first = createRuntimeWidgetDescriptor(view(source), {}, "rich", cache)!;
    const second = createRuntimeWidgetDescriptor(view(source, 1), {}, "rich", cache)!;
    expect(markdownChild(second)).toBe(markdownChild(first));
    const initial = reconcileWidgetTree(undefined, first);
    const next = reconcileWidgetTree(initial.tree, second);
    expect(next.tree.nodes.get("document")).toBe(initial.tree.nodes.get("document"));
    expect(next.mutations).toEqual([{ type: "update", id: "scroll" }]);
    expect([...next.tree.nodes.values()].find((node) => node.href === "https://example.com")?.text).toBe("link");
    expect(markdownChild(createWidgetDescriptor(view(source))!))
      .not.toBe(markdownChild(createWidgetDescriptor(view(source))!));
  });

  it("invalidates on source, style, identity, recipe, presentation, and scroll context", () => {
    const cache = new MarkdownDescriptorCache();
    const base = createRuntimeWidgetDescriptor(view("First"), {}, "rich", cache)!;
    const changedSource = createRuntimeWidgetDescriptor(view("Second"), {}, "rich", cache)!;
    const changedStyle = createRuntimeWidgetDescriptor(view("First", 0, { padding: 1 }), {}, "rich", cache)!;
    const changedRecipe = createRuntimeWidgetDescriptor(view("First"), { defaultControlVariant: "ghost" }, "rich", cache)!;
    const changedPresentation = createRuntimeWidgetDescriptor(view("First"), {}, "text", cache)!;
    const changedId = createRuntimeWidgetDescriptor(<Root><Markdown id="other" source="First" /></Root>, {}, "rich", cache)!;
    const outsideScroll = createRuntimeWidgetDescriptor(<Root><Markdown id="document" source="First" /></Root>, {}, "rich", cache)!;
    for (const candidate of [changedSource, changedStyle, changedRecipe, changedPresentation]) {
      expect(markdownChild(candidate)).not.toBe(markdownChild(base));
    }
    expect(changedId.children[0]).not.toBe(markdownChild(base));
    expect(outsideScroll.children[0]).not.toBe(markdownChild(base));
    const returned = createRuntimeWidgetDescriptor(view("First"), {}, "rich", cache)!;
    expect(markdownChild(returned)).toBe(markdownChild(base));
    cache.clear();
    expect(markdownChild(createRuntimeWidgetDescriptor(view("First"), {}, "rich", cache)!))
      .not.toBe(markdownChild(base));
  });

  it("never caches callback-produced code or syntax output", () => {
    const cache = new MarkdownDescriptorCache();
    const renderCodeBlock = vi.fn(() => <Box><Text>dynamic</Text></Box>);
    const callback = <Root><Markdown source={"```ts\nconst x = 1\n```"} renderCodeBlock={renderCodeBlock} /></Root>;
    const first = createRuntimeWidgetDescriptor(callback, {}, "rich", cache)!;
    const second = createRuntimeWidgetDescriptor(callback, {}, "rich", cache)!;
    expect(first.children[0]).not.toBe(second.children[0]);
    expect(renderCodeBlock).toHaveBeenCalledTimes(2);

    const highlightCodeLine = vi.fn((line: string) => [{ content: line, color: "#123456" }]);
    const highlighted = <Root><Markdown source={"```ts\nconst x = 1\n```"} highlightCodeLine={highlightCodeLine} /></Root>;
    createRuntimeWidgetDescriptor(highlighted, {}, "rich", cache);
    const calls = highlightCodeLine.mock.calls.length;
    createRuntimeWidgetDescriptor(highlighted, {}, "rich", cache);
    expect(highlightCodeLine.mock.calls.length).toBeGreaterThan(calls);
  });

  it("rebuilds cached nodes when inherited disabled state or parent location changes", () => {
    const cache = new MarkdownDescriptorCache();
    const accordion = (disabled: boolean) => <Root><Accordion id="accordion">
      <AccordionItem id="item" expanded disabled={disabled}>
        <AccordionTrigger id="trigger"><Text>Open</Text></AccordionTrigger>
        <AccordionContent id="content" label="Content"><Markdown id="document" source="A link." /></AccordionContent>
      </AccordionItem>
    </Accordion></Root>;
    const before = reconcileWidgetTree(undefined,
      createRuntimeWidgetDescriptor(accordion(false), {}, "rich", cache));
    const after = reconcileWidgetTree(before.tree,
      createRuntimeWidgetDescriptor(accordion(true), {}, "rich", cache));
    expect(before.tree.nodes.get("document")?.disabled).toBe(false);
    expect(after.tree.nodes.get("document")?.disabled).toBe(true);
    expect(after.tree.nodes.get("document")).not.toBe(before.tree.nodes.get("document"));

    const moved = reconcileWidgetTree(after.tree, createRuntimeWidgetDescriptor(<Root>
      <Box id="other"><Markdown id="document" source="A link." /></Box>
    </Root>, {}, "rich", cache));
    expect(moved.tree.nodes.get("document")?.parentId).toBe("other");
    expect(moved.tree.nodes.get("document")).not.toBe(after.tree.nodes.get("document"));
  });

  it("evicts old prepared documents when the node budget is exceeded", () => {
    const cache = new MarkdownDescriptorCache();
    const children = Array.from({ length: Math.floor(MarkdownDescriptorCache.MAX_NODES / 2) }, () =>
      ({ children: [] }) as unknown as WidgetDescriptor);
    const descriptor = { children } as unknown as WidgetDescriptor;
    cache.put({ source: "first" }, {}, "rich", false, descriptor);
    cache.put({ source: "second" }, {}, "rich", false, descriptor);
    expect(cache.get({ source: "first" }, {}, "rich", false)).toBeNull();
    expect(cache.get({ source: "second" }, {}, "rich", false)).toBe(descriptor);

    cache.clear();
    const small = { children: [] } as unknown as WidgetDescriptor;
    for (let index = 0; index <= MarkdownDescriptorCache.MAX_ENTRIES; index += 1) {
      cache.put({ source: `entry-${index}` }, {}, "rich", false, small);
    }
    expect(cache.get({ source: "entry-0" }, {}, "rich", false)).toBeNull();
    cache.clear();
    const oversized = "x".repeat(MarkdownDescriptorCache.MAX_SOURCE_LENGTH + 1);
    cache.put({ source: oversized }, {}, "rich", false, small);
    expect(cache.get({ source: oversized }, {}, "rich", false)).toBeNull();
  });

  it("preserves full semantics and text when a cached document scrolls and changes", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 4 } });
    const source = "# Notes\n\nA [link](https://example.com).\n\nSecond paragraph.";
    const first = runtime.render(view(source));
    const links = [...first.semantics.nodes.values()].filter((node) => node.role === "link");
    const scrolled = runtime.render(view(source, 1));
    expect(scrolled.invalidation.work.layout).toBe("reused");
    expect([...scrolled.semantics.nodes.values()].filter((node) => node.role === "link"))
      .toEqual(links.map((link) => ({ ...link, bounds: scrolled.scene.entries.get(link.id)?.layoutBounds ?? null })));
    expect(scrolled.buffer.toText()).not.toBe(first.buffer.toText());
    const changed = runtime.render(view("# Changed\n\nOther text.", 1));
    expect(changed.buffer.toText()).toContain("Changed");
    expect([...changed.semantics.nodes.values()].some((node) => node.role === "link")).toBe(false);
    runtime.dispose();
  });
});
