import type { DisplayFontOption } from "./catalog";

const stylesheetLoads = new Map<string, Promise<void>>();

export function resetDisplayFontStylesheet(option: DisplayFontOption) {
  stylesheetLoads.delete(option.id);
  document.querySelector(`link[data-display-font-source="${option.id}"]`)?.remove();
}

function loadStylesheet(option: DisplayFontOption): Promise<void> {
  if (!option.stylesheet) return Promise.resolve();
  const previous = document.querySelector<HTMLLinkElement>(`link[data-display-font-source="${option.id}"]`);
  if (previous?.dataset.displayFontLoad === "ready") return Promise.resolve();
  if (previous && stylesheetLoads.has(option.id)) return stylesheetLoads.get(option.id)!;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = option.stylesheet;
  link.crossOrigin = "anonymous";
  link.dataset.displayFontSource = option.id;
  link.dataset.displayFontLoad = "loading";
  const load = new Promise<void>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timeout);
      link.remove();
      reject(new Error(`Unable to load ${option.label}.`));
    };
    const timeout = setTimeout(fail, 15_000);
    link.addEventListener("load", () => {
      clearTimeout(timeout);
      link.dataset.displayFontLoad = "ready";
      resolve();
    }, { once: true });
    link.addEventListener("error", fail, { once: true });
    document.head.append(link);
  }).catch((error: unknown) => {
    stylesheetLoads.delete(option.id);
    throw error;
  });
  stylesheetLoads.set(option.id, load);
  return load;
}

export async function loadDisplayFont(option: DisplayFontOption): Promise<void> {
  try {
    await loadStylesheet(option);
    if (option.fontSpec) {
      const loaded = await Promise.all((option.loadSamples ?? ["AgWi09"]).map(
        (sample) => document.fonts.load(option.fontSpec!, sample),
      ));
      if (loaded.some((faces) => faces.length === 0)) throw new Error(`Missing ${option.label}.`);
    }
  } catch (error) {
    resetDisplayFontStylesheet(option);
    throw error;
  }
}
