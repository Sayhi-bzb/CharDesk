export type BrowserFontLoadTarget = Readonly<{
  id: string;
  label: string;
  stylesheet?: string;
  fontSpec?: string;
  loadSamples?: readonly string[];
}>;

const stylesheetLoads = new Map<string, Promise<void>>();

export function resetBrowserFont(target: BrowserFontLoadTarget) {
  stylesheetLoads.delete(target.id);
  document.querySelector(`link[data-display-font-source="${target.id}"]`)?.remove();
}

function loadStylesheet(target: BrowserFontLoadTarget): Promise<void> {
  if (!target.stylesheet) return Promise.resolve();
  const previous = document.querySelector<HTMLLinkElement>(`link[data-display-font-source="${target.id}"]`);
  if (previous?.dataset.displayFontLoad === "ready") return Promise.resolve();
  if (previous && stylesheetLoads.has(target.id)) return stylesheetLoads.get(target.id)!;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = target.stylesheet;
  link.crossOrigin = "anonymous";
  link.dataset.displayFontSource = target.id;
  link.dataset.displayFontLoad = "loading";
  const load = new Promise<void>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timeout);
      link.remove();
      reject(new Error(`Unable to load ${target.label}.`));
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
    stylesheetLoads.delete(target.id);
    throw error;
  });
  stylesheetLoads.set(target.id, load);
  return load;
}

export async function loadBrowserFont(target: BrowserFontLoadTarget): Promise<void> {
  try {
    await loadStylesheet(target);
    if (target.fontSpec) {
      const loaded = await Promise.all((target.loadSamples ?? ["AgWi09"]).map(
        (sample) => document.fonts.load(target.fontSpec!, sample),
      ));
      if (loaded.some((faces) => faces.length === 0)) throw new Error(`Missing ${target.label}.`);
    }
  } catch (error) {
    resetBrowserFont(target);
    throw error;
  }
}
