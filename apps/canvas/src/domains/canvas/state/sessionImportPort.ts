import type { CanvasImportSnapshot } from "@/domains/sessions/public";

export type CanvasSessionSourceParser = (
  raw: string | unknown,
  options?: { sourceName?: string }
) => Promise<CanvasImportSnapshot>;
