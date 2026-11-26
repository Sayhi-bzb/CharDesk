import { expect, it, vi } from "vitest";
import { bindCanvasFrameLifecycle } from "./canvasFrameLifecycle";
import { CanvasFrameScheduler } from "./FrameScheduler";

it("resumes only when the document is visible, unfrozen and shown", () => {
  const page = document.implementation.createHTMLDocument();
  const pageView = new EventTarget();
  let hidden = true;
  Object.defineProperty(page, "hidden", { get: () => hidden });
  const scheduler = new CanvasFrameScheduler({
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn(),
    now: () => 0,
  });
  const resume = vi.fn();
  scheduler.subscribeResume(resume);
  const unbind = bindCanvasFrameLifecycle(scheduler, page, pageView);

  page.dispatchEvent(new Event("freeze"));
  hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  expect(resume).not.toHaveBeenCalled();
  page.dispatchEvent(new Event("resume"));
  expect(resume).toHaveBeenCalledOnce();

  pageView.dispatchEvent(new Event("pagehide"));
  page.dispatchEvent(new Event("visibilitychange"));
  expect(resume).toHaveBeenCalledOnce();
  pageView.dispatchEvent(new Event("pageshow"));
  expect(resume).toHaveBeenCalledTimes(2);

  unbind();
  page.dispatchEvent(new Event("freeze"));
  page.dispatchEvent(new Event("resume"));
  pageView.dispatchEvent(new Event("pagehide"));
  pageView.dispatchEvent(new Event("pageshow"));
  expect(resume).toHaveBeenCalledTimes(2);
});
