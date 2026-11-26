import { writeFileSync } from 'node:fs';

export const iconSize = 16;

function containsContourCell(x, y) {
  const dx = Math.abs(x - 5);
  const dy = Math.abs(y - 5);
  const distance = Math.max(dx, dy, (dx + dy) / 1.5);
  return distance >= 3.1 && distance <= 5 && !(x >= 7 && y >= 7);
}

export function isIconCell(x, y) {
  const opposite = iconSize - 1;
  const shared = x >= 6 && x <= 9 && y >= 6 && y <= 9 && Math.abs(x - y) <= 1;
  return containsContourCell(x, y) || containsContourCell(opposite - x, opposite - y) || shared;
}

export function renderIcon() {
  const rows = [];
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize;) {
      if (!isIconCell(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < iconSize && isIconCell(x, y)) x++;
      const width = x - start;
      rows.push(`M${start} ${y}h${width}v1h-${width}Z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 ${iconSize} ${iconSize}" shape-rendering="crispEdges">
  <style>
    :root { color: #000; }
    @media (prefers-color-scheme: dark) { :root { color: #fff; } }
  </style>
  <path d="${rows.join('')}"/>
</svg>
`;
}

if (import.meta.main) {
  const icon = renderIcon();
  writeFileSync(new URL('./icon.svg', import.meta.url), icon);
  for (const app of ['site', 'canvas', 'cell-ui', 'docs', 'chargraph']) {
    writeFileSync(new URL(`../../apps/${app}/public/icon.svg`, import.meta.url), icon);
  }
}
