import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box, Button, Link, Root, Text, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME, type CellUiTheme, type WidgetCommand } from "@chardesk/cell-ui";
import {
  CELL_SURFACE_GUARD_CELLS,
  CellSurface,
  DEFAULT_CELL_UI_METRICS,
} from "@chardesk/cell-ui/browser";
import { FUSION_FONT_PROFILE } from "@chardesk/font-fusion";
import { wordmark } from "./wordmark";
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-fusion/fonts.css";

const products = [
  {
    id: "canvas",
    number: "01 / WORKSPACE",
    name: "Canvas ↗",
    href: "https://canvas.chardesk.com/",
    description: "Visual work people see and agents can revise.",
    compactDescription: "Shared visual work.",
  },
  {
    id: "cell-ui",
    number: "02 / INTERFACE",
    name: "Cell UI ↗",
    href: "https://ui.chardesk.com/",
    description: "Interfaces people use and agents can inspect.",
    compactDescription: "Agent-readable UI.",
  },
] as const;
type SiteTheme = "light" | "dark";
const themePreferenceKey = "chardesk-site-theme";
const readTheme = (): SiteTheme => document.documentElement.dataset.siteTheme === "dark" ? "dark" : "light";

export function Product({ product, wide, theme }: { product: typeof products[number]; wide: boolean; theme: CellUiTheme }) {
  return <Box key={product.id} id={`site-${product.id}`}
    style={{ direction: wide ? "row" : "column", width: "100%", gap: wide ? 2 : 0 }}>
    <Text textStyle={theme.secondaryStyle}>{product.number}</Text>
    <Box style={{ gap: 0 }}>
      <Link id={`site-${product.id}-link`} href={product.href} label={`Open ${product.id === "canvas" ? "Canvas" : "Cell UI"}`}
        textStyle={{ bold: true }}>{product.name}</Link>
      <Text textStyle={theme.secondaryStyle}>{wide ? product.description : product.compactDescription}</Text>
    </Box>
  </Box>;
}

export function Site() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(36);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [mode, setMode] = useState<SiteTheme>(readTheme);
  const theme = mode === "dark" ? CLASSIC_MAC_DARK_THEME : CLASSIC_MAC_LIGHT_THEME;

  useLayoutEffect(() => {
    document.documentElement.dataset.siteTheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.background);
  }, [mode, theme.background]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setWidth(Math.max(26, Math.min(72,
      Math.floor(host.clientWidth / DEFAULT_CELL_UI_METRICS.cellWidth) - 2 * CELL_SURFACE_GUARD_CELLS)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const wide = width >= 72;
  const height = wide ? 28 : 25;
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "site-theme") {
      const next = mode === "light" ? "dark" : "light";
      setMode(next);
      try { localStorage.setItem(themePreferenceKey, next); } catch { /* Keep in-memory switching. */ }
    }
    if (command.type === "open-link") {
      if (command.target === "_blank") window.open(command.href, "_blank", "noopener,noreferrer");
      else window.location.assign(command.href);
    }
  };

  return <div ref={hostRef} style={{ width: "100%", display: "grid", justifyItems: "center" }}>
    <CellSurface className="site-surface" label="CharDesk product navigation" probeId="site-home"
      viewport={{ width, height }} focusedId={focusedId} onCommand={onCommand} linearSelection
      fontProfile={FUSION_FONT_PROFILE} theme={theme}>
      <Root id="site-root" style={{ width: "100%", height }}>
        <Box id="site-window" variant="ghost"
          style={{ width: "100%", height: "100%", padding: 1, gap: 1 }}>
          <Box style={{ direction: "row", width: "100%", gap: 1 }}>
            <Text textStyle={theme.secondaryStyle}>Welcome to CharDesk</Text>
            <Box style={{ flexGrow: 1 }} />
            <Button id="site-theme" label={`Switch to ${mode === "light" ? "dark" : "light"} theme`}
              variant="ghost" style={{ width: 3 }}>
              <Text>{mode === "light" ? "" : ""}</Text>
            </Button>
          </Box>
          {wide
            ? <Box id="site-wordmark" style={{ gap: 0 }}>
                {wordmark.map((line, index) => <Text key={index}>{line}</Text>)}
              </Box>
            : <Text id="site-wordmark-compact" textStyle={{ bold: true }}>CHARDESK</Text>}
          <Text>{wide ? "Visual text for people and agents." : "Visual text for"}</Text>
          {wide ? null : <Text>people and agents.</Text>}
          <Box style={{ height: wide ? 1 : 0 }} />
          <Box id="site-products" style={{ width: "100%", gap: wide ? 2 : 1 }}>
            {products.map((product) => Product({ product, wide, theme }))}
          </Box>
          <Box style={{ height: wide ? 1 : 0 }} />
          <Box style={{ direction: width < 36 ? "column" : "row", gap: width < 36 ? 0 : 3 }}>
            <Link id="site-docs" href="/docs/">Documentation ↗</Link>
            <Link id="site-github" href="https://github.com/Sayhi-bzb/CharDesk" target="_blank">GitHub ↗</Link>
          </Box>
        </Box>
      </Root>
    </CellSurface>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Site />);
