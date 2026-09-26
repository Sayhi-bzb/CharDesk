import { describe, expect, it } from "vitest";
import { createBlackboardArchive } from "./archive";

describe("createBlackboardArchive", () => {
  it("writes a UTF-8 store-only ZIP containing the source paths", async () => {
    const blob = createBlackboardArchive({
      workspace: { id: "board", title: "Board", revision: 1, createdAt: 0, updatedAt: 0 },
      files: [
        { path: "blackboard.yaml", content: "title: 示例" },
        { path: "panels/main.panel", content: "Hello" },
      ],
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("blackboard.yaml");
    expect(text).toContain("panels/main.panel");
  });
});
