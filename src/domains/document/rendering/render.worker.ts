/// <reference lib="webworker" />

import { createTextRenderingRuntime } from "./runtime";
import type { TextRenderContext, TextRenderProfile } from "./types";

type RenderRequest = {
  id: number;
  source: string;
  defaultColor: string;
  profile: TextRenderProfile;
  context: TextRenderContext;
};

const runtime = createTextRenderingRuntime({ storage: false });

self.addEventListener("message", async (event: MessageEvent<RenderRequest>) => {
  const { id, source, defaultColor, profile, context } = event.data;
  try {
    runtime.setProfile(profile);
    const result = await runtime.renderCompact(source, defaultColor, context);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Text rendering failed.",
    });
  }
});
