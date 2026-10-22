import { expect, test, type Locator, type Page } from "@playwright/test";
import { CHARDESK_LIGHT_RENDER_THEME } from "@chardesk/chargraph/theme";
import { CHARGRAPH_EXAMPLES } from "../src/examples";

const firstCaseTitle = (kind: string) => {
  const title = CHARGRAPH_EXAMPLES.find((example) => example.kind === kind)?.title;
  if (!title) throw new RangeError(`Unknown CharGraph example kind: ${kind}`);
  return title;
};

const exampleById = (id: string) => {
  const example = CHARGRAPH_EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) throw new RangeError(`Unknown CharGraph example: ${id}`);
  return example;
};

const readViewerColors = (viewer: Locator) => viewer.evaluate((element) => [
  ...new Set(
    (element as unknown as {
      parsedDocument?: { cells: { color?: string }[] };
    }).parsedDocument?.cells
      .map((cell) => cell.color)
      .filter((color): color is string => typeof color === "string") ?? []
  ),
]);

const expectViewerColors = async (
  viewer: Locator,
  expectedColors: readonly string[]
) => {
  await expect.poll(() => readViewerColors(viewer)).toEqual(
    expect.arrayContaining([...new Set(expectedColors)])
  );
};

test("renders emoji through the vendored monochrome Canvas font", async ({ page }) => {
  await page.goto("./#type-flowchart");

  const result = await page.evaluate(async () => {
    const faces = await document.fonts.load("15px 'Noto Emoji'", "👋🚀");
    const viewer = document.createElement("chardesk-viewer") as HTMLElement & {
      source: string;
      controls: boolean;
    };
    viewer.source = "👋 🚀";
    viewer.controls = false;
    viewer.setAttribute("fit", "none");
    viewer.setAttribute("zoom", "1.25");
    viewer.style.setProperty("--chardesk-color", "#000000");
    viewer.style.setProperty("--chardesk-background", "#ffffff");
    document.body.append(viewer);
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())
    ));
    const canvas = viewer.shadowRoot?.querySelector("canvas");
    const context = canvas?.getContext("2d");
    const pixels = context && canvas
      ? context.getImageData(0, 0, canvas.width, canvas.height).data
      : new Uint8ClampedArray();
    let visible = 0;
    let colored = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if ((pixels[offset + 3] ?? 0) === 0) continue;
      visible += 1;
      if (pixels[offset] !== pixels[offset + 1] ||
          pixels[offset + 1] !== pixels[offset + 2]) {
        colored += 1;
      }
    }
    const missing = canvas?.hasAttribute("data-emoji-font-missing") ?? true;
    const cssWidth = Number.parseFloat(canvas?.style.width ?? "0");
    const backingRatio = canvas && cssWidth > 0 ? canvas.width / cssWidth : 0;
    const surfaceTransform = (
      viewer.shadowRoot?.querySelector<HTMLElement>("[part='surface']")
    )?.style.transform ?? "missing";
    viewer.remove();
    return {
      faceCount: faces.length,
      visible,
      colored,
      missing,
      backingRatio,
      dpr: window.devicePixelRatio,
      surfaceTransform,
    };
  });

  expect(result.faceCount).toBeGreaterThan(0);
  expect(result.visible).toBeGreaterThan(0);
  expect(result.colored).toBe(0);
  expect(result.missing).toBe(false);
  expect(result.backingRatio).toBeCloseTo(result.dpr, 1);
  expect(result.surfaceTransform).toBe("");
});

const expectUnicodeViewersToFit = async (page: Page) => {
  const viewers = page.locator("chardesk-viewer");
  await expect(viewers).toHaveCount(3);

  await expect.poll(async () => {
    const overflow = await viewers.evaluateAll((elements) =>
      elements.map((element) => {
        const viewport = element.shadowRoot?.querySelector<HTMLElement>(
          '[part="viewport"]'
        );
        if (!viewport) return Number.POSITIVE_INFINITY;
        return Math.max(
          viewport.scrollWidth - viewport.clientWidth,
          viewport.scrollHeight - viewport.clientHeight
        );
      })
    );
    return Math.max(...overflow);
  }).toBeLessThanOrEqual(1);
};

const expectStructuralChrome = async (page: Page) => {
  const separators = page.locator('[data-slot="separator"]:visible');
  await expect(separators.first()).toBeVisible();
  await expect.poll(async () =>
    separators.evaluateAll((elements) =>
      elements.every((element) => {
        const style = getComputedStyle(element);
        return style.height === "1px" && style.borderRadius === "0px";
      })
    )
  ).toBe(true);

  const frames = page.locator('[data-slot="page-frame"]');
  await expect(frames).toHaveCount(3);
  await expect.poll(async () =>
    frames.evaluateAll((elements) => {
      const edges = elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return `${Math.round(rect.left)}:${Math.round(rect.right)}`;
      });
      return new Set(edges).size;
    })
  ).toBe(1);

  const dividers = page.locator('[data-slot="stripe-divider"]');
  await expect(dividers).toHaveCount(4);
  await expect.poll(async () =>
    dividers.evaluateAll((elements) =>
      elements.every((element) => {
        const pattern = element.querySelector<HTMLElement>(
          '[data-slot="stripe-divider-pattern"]'
        );
        const boundaries = Array.from(
          element.querySelectorAll<HTMLElement>('[data-boundary]')
        );
        if (!pattern || boundaries.length !== 2) return false;

        const coversViewport = (layer: HTMLElement) => {
          const rect = layer.getBoundingClientRect();
          return rect.left <= 0 && rect.right >= window.innerWidth;
        };
        return (
          element.getAttribute("data-bleed") === "true" &&
          element.getBoundingClientRect().height === 32 &&
          getComputedStyle(pattern).backgroundImage.includes(
            "repeating-linear-gradient"
          ) &&
          coversViewport(pattern) &&
          boundaries.every(
            (boundary) =>
              coversViewport(boundary) &&
              getComputedStyle(boundary).height === "1px"
          )
        );
      })
    )
  ).toBe(true);
};

const expectCompactPageHeader = async (page: Page) => {
  const header = page.locator('[data-frame="header"]');
  const categories = page.locator('[data-slot="category-tabs"]');
  const topDivider = page.locator(
    '[data-frame="header"] + [data-slot="stripe-divider"]'
  );

  await expect(page.getByRole("heading", { level: 1, name: "CharGraph" })).toHaveCount(1);
  await expect(page.getByText("Mermaid + Markdown → Unicode")).toHaveCount(0);
  await expect(topDivider).toBeVisible();
  await expect.poll(async () =>
    topDivider.evaluate(
      (element) =>
        element.nextElementSibling?.getAttribute("data-frame") === "content"
    )
  ).toBe(true);
  await expect.poll(async () =>
    header.evaluate((element) => element.getBoundingClientRect().height)
  ).toBe(48);
  await expect.poll(async () =>
    categories.evaluate((element) => element.getBoundingClientRect().height)
  ).toBeLessThanOrEqual(52);
};

const expectLineNav = async (page: Page, activeLabel: string) => {
  const navigation = page.getByRole("navigation", { name: "案例" });
  await expect(navigation).toHaveAttribute("data-slot", "line-nav");

  const activeLink = navigation.getByRole("link", { name: activeLabel });
  await expect(activeLink).toHaveAttribute("aria-current", "location");
  await expect.poll(async () =>
    activeLink.locator('[data-slot="line-nav-marker"]').evaluate((element) =>
      Math.round(element.getBoundingClientRect().width)
    )
  ).toBe(40);

  const fits = await navigation.evaluate(
    (element) => element.scrollWidth <= element.clientWidth
  );
  expect(fits).toBe(true);
};

const expectFloatingLineNav = async (page: Page) => {
  const floatingNav = page.locator('[data-slot="case-floating-nav"]');
  const contentFrame = page.locator('[data-frame="content"]');

  await expect(floatingNav).toBeVisible();
  await expect.poll(async () =>
    floatingNav.evaluate((element) => getComputedStyle(element).position)
  ).toBe("fixed");

  const placement = await floatingNav.evaluate((element) => {
    const frame = document.querySelector<HTMLElement>('[data-frame="content"]');
    if (!frame) throw new Error("Content frame is missing");

    const navRect = element.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      gap: frameRect.left - navRect.right,
      verticalOffset:
        navRect.top + navRect.height / 2 - window.innerHeight / 2,
    };
  });
  expect(placement.gap).toBeGreaterThanOrEqual(15);
  expect(placement.gap).toBeLessThanOrEqual(17);
  expect(Math.abs(placement.verticalOffset)).toBeLessThanOrEqual(1);

  const hoverLink = page
    .getByRole("navigation", { name: "案例" })
    .getByRole("link")
    .nth(1);
  const hoverMarker = hoverLink.locator('[data-slot="line-nav-marker"]');
  const hoverLabel = hoverLink.locator("span").last();
  const readHoverGeometry = async () => {
    const [surface, labelLeft, content] = await Promise.all([
      floatingNav.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
      hoverLabel.evaluate((element) => element.getBoundingClientRect().left),
      contentFrame.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    ]);
    return {
      surfaceLeft: surface.left,
      surfaceRight: surface.right,
      surfaceWidth: surface.width,
      labelLeft,
      contentLeft: content.left,
      contentRight: content.right,
    };
  };

  await expect.poll(async () =>
    hoverMarker.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width)
    )
  ).toBe(24);
  const geometryBeforeHover = await readHoverGeometry();

  await hoverLink.hover();
  await expect.poll(async () =>
    hoverMarker.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width)
    )
  ).toBe(40);
  const geometryDuringHover = await readHoverGeometry();

  for (const key of Object.keys(geometryBeforeHover) as Array<
    keyof typeof geometryBeforeHover
  >) {
    expect(geometryDuringHover[key]).toBeCloseTo(geometryBeforeHover[key], 0);
  }

  await page.mouse.move(0, 0);
  await expect.poll(async () =>
    hoverMarker.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width)
    )
  ).toBe(24);
  const geometryAfterHover = await readHoverGeometry();
  for (const key of Object.keys(geometryBeforeHover) as Array<
    keyof typeof geometryBeforeHover
  >) {
    expect(geometryAfterHover[key]).toBeCloseTo(geometryBeforeHover[key], 0);
  }

  const topBeforeScroll = await floatingNav.evaluate(
    (element) => element.getBoundingClientRect().top
  );
  await contentFrame.evaluate((element) =>
    element.scrollIntoView({ block: "end" })
  );
  await expect.poll(async () =>
    floatingNav.evaluate((element) => element.getBoundingClientRect().top)
  ).toBeCloseTo(topBeforeScroll, 0);
};

const expectExamplesToFillContentFrame = async (page: Page) => {
  const edges = await page
    .locator('[data-slot="example-grid"]')
    .first()
    .evaluate((element) => {
      const frame = document.querySelector<HTMLElement>('[data-frame="content"]');
      if (!frame) throw new Error("Content frame is missing");

      const gridRect = element.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        left: gridRect.left - frameRect.left,
        right: frameRect.right - gridRect.right,
      };
    });
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.left).toBeLessThanOrEqual(1);
  expect(edges.right).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(1);
};

const openDesktopCategory = async (
  page: Page,
  label: string,
  kind: string
) => {
  const tab = page.getByRole("tab", { name: label });
  await tab.click();
  await expect(page).toHaveURL(new RegExp(`#type-${kind}$`));
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { level: 2, name: label, exact: true })
  ).toHaveCount(0);
  await expect(page.locator("main article")).toHaveCount(3);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: firstCaseTitle(kind),
      exact: true,
    })
  ).toBeVisible();
  await expectLineNav(page, firstCaseTitle(kind));
};

test("renders directed diagrams through the category navigation", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto("./");

  await expectCompactPageHeader(page);
  await expect(page.getByRole("tab", { name: "流程图" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expectLineNav(page, firstCaseTitle("flowchart"));
  const flowViewer = page.locator("#flowchart chardesk-viewer");
  const flow = flowViewer.locator("canvas");
  await expect(flow).toContainText(exampleById("flowchart").expectedText);
  await expect(flow).toContainText(/Yes[ ─┄━╭╮]*>│\s*Save\s*│/u);
  await expect(flow).toContainText(/>│\s*Error\s*│/u);
  await expect(flow).toContainText("No");
  await expect(flow).not.toContainText(/[─┄━]\^ +│/u);
  await expect(flow).not.toContainText("flowchart LR");
  await expectViewerColors(flowViewer, [
    CHARDESK_LIGHT_RENDER_THEME.accent,
    CHARDESK_LIGHT_RENDER_THEME.foreground,
  ]);
  const deploymentViewer = page.locator(
    "#flowchart-intermediate chardesk-viewer"
  );
  const deployment = deploymentViewer.locator("canvas");
  await expect(deployment).toContainText("持续集成");
  await expect(deployment).toContainText("生产环境");
  await expectViewerColors(deploymentViewer, [
    CHARDESK_LIGHT_RENDER_THEME["border-subtle"],
  ]);
  await expectUnicodeViewersToFit(page);
  await expectStructuralChrome(page);

  await openDesktopCategory(page, "状态图", "state");
  const state = page.locator("#state chardesk-viewer canvas");
  await expect(state).toContainText("草稿");
  await expect(state).toContainText("审核");
  await expect(state).not.toContainText("stateDiagram-v2");
  await expect(
    page.locator("#state-intermediate chardesk-viewer canvas")
  ).toContainText("退回修改");
  await expectUnicodeViewersToFit(page);

  await openDesktopCategory(page, "时序图", "sequence");
  await expect(
    page.locator("#sequence-intermediate chardesk-viewer canvas")
  ).toContainText("重试任务");

  await openDesktopCategory(page, "类图", "class");
  const classModel = page.locator("#class-intermediate chardesk-viewer canvas");
  await expect(classModel).toContainText("内容域");
  await expect(classModel).toContainText("0..*");
  const classDiagram = page.locator("#class-advanced chardesk-viewer canvas");
  await expect(classDiagram).toContainText("<<interface>>");
  await expect(classDiagram).toContainText("渲染器");
  await expect(classDiagram).toContainText(/[△▽◁▷^v]/u);
  await expect(classDiagram).toContainText(/┆|┄/u);
  await expect(classDiagram).not.toContainText("classDiagram");
  await expectUnicodeViewersToFit(page);

  await openDesktopCategory(page, "实体关系图", "er");
  const socialModel = page.locator("#er-intermediate chardesk-viewer canvas");
  await expect(socialModel).toContainText("关注");
  await expect(socialModel).toContainText("推荐");
  const socialText = await socialModel.textContent() ?? "";
  const socialLines = socialText.trimEnd().split("\n");
  expect(socialLines.length).toBeLessThanOrEqual(10);
  expect(socialLines.find((line) => line.includes("推荐"))).toMatch(/[╭╮─┄]/u);
  const erDiagram = page.locator("#er-advanced chardesk-viewer canvas");
  await expect(erDiagram).toContainText("订单项");
  await expect(erDiagram).toContainText("被引用");
  await expect(erDiagram).toContainText(/○[╟╢╥╨]/u);
  await expect(erDiagram).toContainText(/┄|┆/u);
  await expect(erDiagram).not.toContainText("erDiagram");
  await expectUnicodeViewersToFit(page);

  await openDesktopCategory(page, "XY 图表", "xychart");
  const chartViewer = page.locator("#xychart chardesk-viewer");
  await expect(chartViewer.locator("canvas")).toContainText("月度趋势");
  await expectViewerColors(chartViewer, [
    CHARDESK_LIGHT_RENDER_THEME.accent,
    CHARDESK_LIGHT_RENDER_THEME.done,
    CHARDESK_LIGHT_RENDER_THEME["grid-subtle"],
  ]);
  await expectUnicodeViewersToFit(page);

  expect(pageErrors).toEqual([]);
});

test("uses LineNav as a scroll-aware case index", async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto("./#type-flowchart");
  await expect(page.locator("main article")).toHaveCount(3);

  const navigation = page.getByRole("navigation", { name: "案例" });
  await navigation.getByRole("link", { name: "部署流水线" }).click();
  await expect(page).toHaveURL(/#flowchart-intermediate$/);
  await expectLineNav(page, "部署流水线");

  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator("#flowchart-advanced").evaluate((element) =>
    element.scrollIntoView({ block: "start" })
  );
  await expectLineNav(page, "形状与连线");
  await expect(page).toHaveURL(/#flowchart-intermediate$/);
});

test("renders styled Markdown categories through the same showcase", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto("./#type-markdown-basics");

  await expectCompactPageHeader(page);
  await expectLineNav(page, firstCaseTitle("markdown-basics"));
  const basicsArticle = page.locator("#markdown-basics");
  await expect(basicsArticle.locator('[data-slot="example-panel"]').first())
    .toHaveAttribute("aria-label", "Markdown");
  await expect(basicsArticle.locator('[data-slot="example-source"]'))
    .toContainText("**Bold**");

  const basics = page.locator("#markdown-basics chardesk-viewer");
  await expect(basics.locator("canvas"))
    .toContainText(exampleById("markdown-basics").expectedText);
  await expect(basics.locator("canvas")).not.toContainText("**Bold**");
  await expect.poll(() => basics.evaluate((element) => {
    const cells = (element as unknown as {
      parsedDocument?: { cells: { attrs?: { bold?: true }; href?: string }[] };
    }).parsedDocument?.cells ?? [];
    return {
      bold: cells.some((cell) => cell.attrs?.bold),
      link: cells.some((cell) =>
        cell.href === "https://github.com/Sayhi-bzb/CharDesk"
      ),
    };
  })).toEqual({ bold: true, link: true });
  await expect(
    page.locator("#markdown-basics-intermediate chardesk-viewer canvas")
  ).toContainText("v0.2 发布说明");

  await openDesktopCategory(page, "列表与表格", "markdown-structure");
  const checklist = page.locator(
    "#markdown-structure-intermediate chardesk-viewer canvas"
  );
  await expect(checklist).toContainText("回归测试");
  await expect(checklist).toContainText("○");

  await openDesktopCategory(page, "代码与 Diff", "markdown-code");
  const config = page.locator("#markdown-code-intermediate chardesk-viewer");
  await expect(config.locator("canvas"))
    .toContainText(exampleById("markdown-code-intermediate").expectedText);
  await expectViewerColors(config, [
    CHARDESK_LIGHT_RENDER_THEME.accent,
    CHARDESK_LIGHT_RENDER_THEME.success,
    CHARDESK_LIGHT_RENDER_THEME["border-subtle"],
    CHARDESK_LIGHT_RENDER_THEME["muted-foreground"],
  ]);
  const diff = page.locator("#markdown-code-advanced chardesk-viewer");
  await expect(diff.locator("canvas")).toContainText("+  return next(value);");
  await expect.poll(() => diff.evaluate((element) =>
    (element as unknown as {
      parsedDocument?: { cells: { bgColor?: string }[] };
    }).parsedDocument?.cells.some((cell) => !!cell.bgColor) ?? false
  )).toBe(true);

  await openDesktopCategory(page, "GitHub Alert", "markdown-alert");
  await expect(
    page.locator("#markdown-alert-intermediate chardesk-viewer canvas")
  ).toContainText("│ IMPORTANT");
  await expect(
    page.locator("#markdown-alert-advanced chardesk-viewer canvas")
  ).toContainText("│ CAUTION");

  await openDesktopCategory(page, "数学表达", "markdown-math");
  await expect(
    page.locator("#markdown-math-intermediate chardesk-viewer canvas")
  ).toContainText("∑");
  await expect(
    page.locator("#markdown-math-advanced chardesk-viewer canvas")
  ).toContainText("a + b");
  await expectUnicodeViewersToFit(page);
  expect(pageErrors).toEqual([]);
});

test("uses the mobile category select without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#type-sequence");

  await expectCompactPageHeader(page);
  const categorySelect = page.getByRole("combobox", { name: "案例分类" });
  const caseSelect = page.getByRole("combobox", { name: "案例", exact: true });
  await expect(categorySelect).toBeVisible();
  await expect(categorySelect).toContainText("时序图");
  await expect(caseSelect).toBeVisible();
  await expect(caseSelect).toContainText(firstCaseTitle("sequence"));
  await expect(
    page.getByRole("heading", { level: 2, name: "分支与循环" })
  ).toBeVisible();
  await expect(page.locator('[data-slot="line-nav"]')).toBeHidden();
  await expect(page.locator("main article")).toHaveCount(3);
  await expectUnicodeViewersToFit(page);
  await expectStructuralChrome(page);

  await caseSelect.click();
  await page.getByRole("option", { name: "分支与循环" }).click();
  await expect(page).toHaveURL(/#sequence-advanced$/);
  await expect(caseSelect).toContainText("分支与循环");

  await categorySelect.click();
  await page.getByRole("option", { name: "XY 图表" }).click();
  await expect(page).toHaveURL(/#type-xychart$/);
  await expect(categorySelect).toContainText("XY 图表");
  await expect(caseSelect).toContainText(firstCaseTitle("xychart"));
  await expect(
    page.getByRole("heading", { level: 2, name: "横向混合图" })
  ).toBeVisible();
  await expect(
    page.locator("#xychart-intermediate chardesk-viewer canvas")
  ).toContainText("预发布环境");
  await expect(page.locator("main article")).toHaveCount(3);
  await expectUnicodeViewersToFit(page);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasPageOverflow).toBe(false);
});

test("keeps the diagram boundary aligned across layout breakpoints", async ({ page }) => {
  for (const width of [768, 1024, 1440, 1536, 1728]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./#type-er");
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect(page.locator("main article")).toHaveCount(3);

    const categorySelect = page.getByRole("combobox", { name: "案例分类" });
    const categoryTabs = page.getByRole("tablist", { name: "案例分类" });
    const caseSelect = page.getByRole("combobox", { name: "案例", exact: true });
    const lineNav = page.locator('[data-slot="line-nav"]');
    if (width < 1024) {
      await expect(categorySelect).toBeVisible();
      await expect(categoryTabs).toBeHidden();
      await expect(caseSelect).toBeVisible();
      await expect(lineNav).toBeHidden();
    } else if (width < 1536) {
      await expect(categorySelect).toBeHidden();
      await expect(categoryTabs).toBeVisible();
      await expect(caseSelect).toBeVisible();
      await expect(lineNav).toBeHidden();
    } else {
      await expect(categorySelect).toBeHidden();
      await expect(categoryTabs).toBeVisible();
      await expect(caseSelect).toBeHidden();
      await expectLineNav(page, firstCaseTitle("er"));
      await expectFloatingLineNav(page);
    }
    if (width >= 1024) {
      const tabGeometry = await categoryTabs.evaluate((element) => {
        const triggers = Array.from(
          element.querySelectorAll<HTMLElement>('[role="tab"]')
        );
        return {
          fits: element.scrollWidth <= element.clientWidth,
          rowCount: new Set(
            triggers.map((trigger) => Math.round(trigger.getBoundingClientRect().top))
          ).size,
        };
      });
      expect(tabGeometry).toEqual({ fits: true, rowCount: 1 });
    }

    await expectExamplesToFillContentFrame(page);

    const boundary = page.locator('[data-slot="example-output"]').first();
    const borders = await boundary.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopWidth, style.borderLeftWidth];
    });
    expect(borders).toEqual(width < 1024 ? ["1px", "0px"] : ["0px", "1px"]);

    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasPageOverflow).toBe(false);
    await expectStructuralChrome(page);
  }
});

test("closes short and long pages with the framed footer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2000 });
  await page.goto("./#type-flowchart");
  await expect(page.locator("main article")).toHaveCount(3);

  const shortPageGeometry = await page
    .locator('[data-frame="footer"]')
    .evaluate((footer) => {
      const content = document.querySelector<HTMLElement>('[data-frame="content"]');
      const closingDivider = document.querySelector<HTMLElement>(
        'main + [data-slot="stripe-divider"]'
      );
      const examplesBoundary = document.querySelector<HTMLElement>(
        '[data-boundary="examples-end"]'
      );
      const exampleGrids = document.querySelectorAll<HTMLElement>(
        '[data-slot="example-grid"]'
      );
      const lastExampleGrid = exampleGrids.item(exampleGrids.length - 1);
      if (!content || !closingDivider || !examplesBoundary || !lastExampleGrid) {
        throw new Error("Closing page structure is missing");
      }

      const boundaryStyle = getComputedStyle(examplesBoundary);

      return {
        footerBottom: footer.getBoundingClientRect().bottom,
        viewportBottom: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        contentBottom: content.getBoundingClientRect().bottom,
        dividerTop: closingDivider.getBoundingClientRect().top,
        dividerBottom: closingDivider.getBoundingClientRect().bottom,
        footerTop: footer.getBoundingClientRect().top,
        lastExampleBottom: lastExampleGrid.getBoundingClientRect().bottom,
        examplesBoundaryTop: examplesBoundary.getBoundingClientRect().top,
        examplesBoundaryBottom: examplesBoundary.getBoundingClientRect().bottom,
        examplesBoundaryHeight: boundaryStyle.height,
        examplesBoundaryRadius: boundaryStyle.borderRadius,
      };
    });
  expect(shortPageGeometry.footerBottom).toBeCloseTo(
    shortPageGeometry.viewportBottom,
    0
  );
  expect(shortPageGeometry.documentHeight).toBe(2000);
  expect(shortPageGeometry.contentBottom).toBeCloseTo(
    shortPageGeometry.dividerTop,
    0
  );
  expect(shortPageGeometry.dividerBottom).toBeCloseTo(
    shortPageGeometry.footerTop,
    0
  );
  expect(shortPageGeometry.lastExampleBottom).toBeCloseTo(
    shortPageGeometry.examplesBoundaryTop,
    0
  );
  expect(shortPageGeometry.examplesBoundaryHeight).toBe("1px");
  expect(shortPageGeometry.examplesBoundaryRadius).toBe("0px");
  expect(shortPageGeometry.examplesBoundaryBottom).toBeLessThan(
    shortPageGeometry.contentBottom
  );

  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("./#type-sequence");
  await expect(page.locator("main article")).toHaveCount(3);

  const longPageGeometry = await page
    .locator('[data-frame="footer"]')
    .evaluate((footer) => ({
      footerBottom: footer.getBoundingClientRect().bottom + window.scrollY,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
    }));
  expect(longPageGeometry.documentHeight).toBeGreaterThan(
    longPageGeometry.viewportHeight
  );
  expect(longPageGeometry.footerBottom).toBeCloseTo(
    longPageGeometry.documentHeight,
    0
  );
});

test("supports category deep links and browser history", async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 900 });
  await page.goto("./#type-state");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const stateTab = page.getByRole("tab", { name: "状态图" });
  await expect(stateTab).toHaveAttribute("aria-selected", "true");
  await expectLineNav(page, firstCaseTitle("state"));

  await openDesktopCategory(page, "时序图", "sequence");
  await page.goBack();
  await expect(page).toHaveURL(/#type-state$/);
  await expect(stateTab).toHaveAttribute("aria-selected", "true");

  await page.goto("./#sequence-advanced");
  await expect(page.getByRole("tab", { name: "时序图" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expectLineNav(page, "分支与循环");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.goto("./#type-unknown");
  await expect(page.getByRole("tab", { name: "流程图" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.locator("main article")).toHaveCount(3);
});
