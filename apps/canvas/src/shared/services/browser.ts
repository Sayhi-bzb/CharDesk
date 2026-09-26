export const browser = {
  openExternal(url: string, target: "_blank" | "_self" = "_blank") {
    if (typeof window === "undefined") return null;
    return window.open(url, target, "noopener,noreferrer");
  },
};
