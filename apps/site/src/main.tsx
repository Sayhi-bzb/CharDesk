import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box, Link, Root, Text, resolveCellUiTheme, type WidgetCommand } from "@chardesk/cell-ui";
import {
  CELL_SURFACE_GUARD_CELLS,
  CellSurface,
  DEFAULT_CELL_UI_METRICS,
} from "@chardesk/cell-ui/browser";
import { FUSION_FONT_PROFILE } from "@chardesk/font-fusion";
import "@chardesk/font-fusion/fonts.css";
import "../site.css";

const products = [
  {
    id: "canvas",
    number: "01 / WORKSPACE",
    name: "Canvas ↗",
    href: "https://canvas.chardesk.com/",
    description: ["Draw and share", "editable visual work."],
  },
  {
    id: "cell-ui",
    number: "02 / INTERFACE",
    name: "Cell UI ↗",
    href: "https://ui.chardesk.com/",
    description: ["Character-grid UI", "with source you own."],
  },
] as const;
const secondaryStyle = resolveCellUiTheme(undefined).secondaryStyle;

export function Product({ product, width }: { product: typeof products[number]; width: number }) {
  return <Box key={product.id} id={`site-${product.id}`} variant="surface" frame="bordered" borderShape="square"
    style={{ width, height: 12, padding: 1, gap: 1 }}>
    <Text textStyle={secondaryStyle}>{product.number}</Text>
    <Link id={`site-${product.id}-link`} href={product.href} label={`Open ${product.id === "canvas" ? "Canvas" : "Cell UI"}`}
      textStyle={{ bold: true }}>{product.name}</Link>
    {product.description.map((line) => <Text key={line}>{line}</Text>)}
  </Box>;
}

export function Site() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(36);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setWidth(Math.max(26, Math.min(88,
      Math.floor(host.clientWidth / DEFAULT_CELL_UI_METRICS.cellWidth) - 2 * CELL_SURFACE_GUARD_CELLS)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const wide = width >= 72;
  const cardWidth = wide ? Math.floor((width - 2) / 2) : width;
  const height = wide ? 34 : 52;
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "open-link") {
      if (command.target === "_blank") window.open(command.href, "_blank", "noopener,noreferrer");
      else window.location.assign(command.href);
    }
  };

  return <div ref={hostRef} style={{ width: "100%", display: "grid", justifyItems: "center" }}>
    <CellSurface className="site-surface" label="CharDesk product navigation" probeId="site-home"
      viewport={{ width, height }} focusedId={focusedId} onCommand={onCommand}
      fontProfile={FUSION_FONT_PROFILE}>
      <Root id="site-root" style={{ width: "100%", height, gap: 1 }}>
        <Text textStyle={{ bold: true }}>CharDesk</Text>
        <Box style={{ height: wide ? 3 : 2 }} />
        <Text textStyle={secondaryStyle}>A SHARED VISUAL MEDIUM</Text>
        <Text textStyle={{ bold: true }}>{wide ? "Text you can see. Space you can edit." : "Text you can see."}</Text>
        {wide ? null : <Text textStyle={{ bold: true }}>Space you can edit.</Text>}
        <Text>{wide ? "Visual work for people and agents." : "Visual work for people"}</Text>
        {wide ? null : <Text>and agents.</Text>}
        <Box style={{ height: wide ? 2 : 1 }} />
        <Box id="site-products" style={{ direction: wide ? "row" : "column", width: "100%", gap: 2 }}>
          {products.map((product) => Product({ product, width: cardWidth }))}
        </Box>
        <Box style={{ height: 1 }} />
        <Box style={{ direction: width < 36 ? "column" : "row", gap: width < 36 ? 0 : 3 }}>
          <Link id="site-docs" href="/docs/">Documentation ↗</Link>
          <Link id="site-github" href="https://github.com/Sayhi-bzb/CharDesk" target="_blank">GitHub ↗</Link>
        </Box>
      </Root>
    </CellSurface>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Site />);
