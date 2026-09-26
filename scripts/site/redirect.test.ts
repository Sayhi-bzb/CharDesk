import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../../apps/site/site.js", import.meta.url), "utf8");

const destination = (pathname: string, search = "", hash = "") => {
  let redirected: string | null = null;
  const location = {
    pathname,
    search,
    hash,
    replace(value: string) { redirected = value; },
  };
  new Function("window", script)({ location });
  return redirected;
};

describe("legacy Canvas links on the product home", () => {
  it("keeps the home page for ordinary visits", () => {
    expect(destination("/")).toBeNull();
    expect(destination("/", "?utm_source=example")).toBeNull();
  });

  it("preserves Blackboard and Reader routes", () => {
    expect(destination("/blackboard", "?workspace=gpu", "#section=1"))
      .toBe("https://canvas.chardesk.com/blackboard?workspace=gpu#section=1");
    expect(destination("/s/abcdefghijklmnopqrstuv"))
      .toBe("https://canvas.chardesk.com/s/abcdefghijklmnopqrstuv");
  });

  it("preserves legacy collaboration fragments", () => {
    expect(destination("/", "", "#r=secret"))
      .toBe("https://canvas.chardesk.com/#r=secret");
    expect(destination("/", "?room=secret"))
      .toBe("https://canvas.chardesk.com/?room=secret");
  });
});
