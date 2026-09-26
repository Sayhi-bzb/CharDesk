import { describe, expect, it } from "vitest";
import { createEntityId } from "./id";

describe("createEntityId", () => {
  it("creates prefixed UUID identifiers", () => {
    const first = createEntityId("node");
    const second = createEntityId("node");

    expect(first).toMatch(
      /^node-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(second).not.toBe(first);
  });
});
