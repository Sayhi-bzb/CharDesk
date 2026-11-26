import type { CanvasFrameScheduler } from "./FrameScheduler";

export function bindCanvasFrameLifecycle(
  scheduler: Pick<CanvasFrameScheduler, "setPaused">,
  page: Document = document,
  view: EventTarget = window
): () => void {
  let frozen = false;
  let pageHidden = false;
  const sync = () => scheduler.setPaused(page.hidden || frozen || pageHidden);
  const onFreeze = () => { frozen = true; sync(); };
  const onResume = () => { frozen = false; sync(); };
  const onPageHide = () => { pageHidden = true; sync(); };
  const onPageShow = () => { pageHidden = false; frozen = false; sync(); };

  page.addEventListener("visibilitychange", sync);
  page.addEventListener("freeze", onFreeze);
  page.addEventListener("resume", onResume);
  view.addEventListener("pagehide", onPageHide);
  view.addEventListener("pageshow", onPageShow);
  sync();

  return () => {
    page.removeEventListener("visibilitychange", sync);
    page.removeEventListener("freeze", onFreeze);
    page.removeEventListener("resume", onResume);
    view.removeEventListener("pagehide", onPageHide);
    view.removeEventListener("pageshow", onPageShow);
  };
}
