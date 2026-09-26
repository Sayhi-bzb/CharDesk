type DockShortcutPlatform = "mac" | "other";

const getDockShortcutPlatform = (): DockShortcutPlatform => {
  if (typeof navigator === "undefined") return "other";
  const platform = navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other";
};

export const getDockShortcutAriaLabel = (
  index: number,
  platform = getDockShortcutPlatform()
) => `${platform === "mac" ? "Control" : "Alt"}+${index + 1}`;

export const getDockShortcutLabel = (
  index: number,
  platform = getDockShortcutPlatform()
) =>
  platform === "mac"
    ? `⌃${index + 1}`
    : getDockShortcutAriaLabel(index, platform);

export const getDockShortcutBinding = (
  index: number,
  platform = getDockShortcutPlatform()
) => `${platform === "mac" ? "ctrl" : "alt"}+${index + 1}`;
