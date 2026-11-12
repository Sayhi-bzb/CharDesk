import { Moon } from "pixelarticons/react/Moon";
import { Sun } from "pixelarticons/react/Sun";
import type { CellSvgIcons } from "@chardesk/cell-ui/browser";

// Restore the Gallery's original 48 × 48 pixel GitHub mark.
const github = <svg width={16} viewBox="0 0 48 48" fill="none"
  shapeRendering="crispEdges" style={{ position: "absolute", left: 1, top: 2 }}>
  <path d="M46 18V30H44V34H42V38H40V40H38V42H36V44H32V46H30V36H28V34H30V32H34V30H36V28H38V18H36V12H32V14H30V16H28V14H20V16H18V14H16V12H12V18H10V28H12V30H14V32H18V36H14V34H12V32H8V34H10V38H12V40H18V46H16V44H12V42H10V40H8V38H6V34H4V30H2V18H4V14H6V10H8V8H10V6H14V4H18V2H30V4H34V6H38V8H40V10H42V14H44V18H46Z"
    fill="currentColor" />
</svg>;

export const galleryHeaderPixelIcons = (mode: "light" | "dark"): CellSvgIcons => ({
  "gallery-header-github": github,
  "gallery-header-theme-icon": mode === "light"
    ? <Moon width={16} shapeRendering="crispEdges" />
    : <Sun width={16} shapeRendering="crispEdges" />,
});
