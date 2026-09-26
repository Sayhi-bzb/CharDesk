import { expect, it, vi } from "vitest";
import { Box, CellUiRuntime, Root, ScrollArea } from "./index.js";
import { CellBuffer } from "./buffer.js";

it("bounds surface fill work by the visible viewport, not virtual content height", () => {
  const writes = vi.spyOn(CellBuffer.prototype, "writeGrapheme");
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
  const view = (scrollY: number) => <Root><ScrollArea id="scroll" scrollY={scrollY}
    style={{ width: 20, height: 6 }}><Box variant="surface"
      style={{ width: 20, height: 100_000 }} /></ScrollArea></Root>;
  try {
    runtime.render(view(0));
    expect(writes.mock.calls.length).toBeLessThan(1_000);
    writes.mockClear();
    runtime.render(view(50_000));
    expect(writes.mock.calls.length).toBeLessThan(1_000);
  } finally {
    writes.mockRestore();
    runtime.dispose();
  }
});
