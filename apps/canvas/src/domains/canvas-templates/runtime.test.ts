import { describe, expect, it } from "vitest";
import {
  CHARDESK_DARK_CONTENT_THEME,
  CHARDESK_LIGHT_CONTENT_THEME,
} from "@chardesk/rendering/theme";
import {
  CANVAS_TEMPLATES,
  FIXED_COLOR_CANVAS_TEMPLATE_IDS,
} from "./catalog";
import { getCanvasTemplateMaterialization } from "./runtime";

describe("Canvas template materialization", () => {
  it("keeps adaptive and identity-template color policy explicit", () => {
    const fixedIds = new Set<string>(FIXED_COLOR_CANVAS_TEMPLATE_IDS);

    for (const template of CANVAS_TEMPLATES) {
      for (const row of template.rows) {
        for (const span of row.spans) {
          expect(typeof span.color).toBe(fixedIds.has(template.id) ? "string" : "object");
          if ("bgColor" in span && span.bgColor) {
            expect(typeof span.bgColor).toBe(
              fixedIds.has(template.id) ? "string" : "object"
            );
          }
        }
      }
    }
  });

  it("resolves semantic colors once for rows and projection", () => {
    const materialization = getCanvasTemplateMaterialization(
      "badge",
      CHARDESK_LIGHT_CONTENT_THEME
    );

    expect(getCanvasTemplateMaterialization(
      "badge",
      CHARDESK_LIGHT_CONTENT_THEME
    )).toBe(materialization);
    expect(materialization.viewport).toEqual({ x: 0, y: 0, width: 9, height: 1 });
    expect(materialization.source.get({ x: 0, y: 0 })).toMatchObject({
      char: " ",
      color: CHARDESK_LIGHT_CONTENT_THEME.foreground,
      bgColor: CHARDESK_LIGHT_CONTENT_THEME.surface,
    });
    expect(materialization.source.get({ x: 1, y: 0 })).toMatchObject({
      char: "",
      color: CHARDESK_LIGHT_CONTENT_THEME.info,
      bgColor: CHARDESK_LIGHT_CONTENT_THEME.surface,
    });
    expect(materialization.source.get({ x: 8, y: 0 })).toMatchObject({
      char: " ",
      bgColor: CHARDESK_LIGHT_CONTENT_THEME.surface,
    });
    expect(materialization.rows[0]?.spans[1]).toMatchObject({
      width: 7,
      color: CHARDESK_LIGHT_CONTENT_THEME.info,
      bgColor: CHARDESK_LIGHT_CONTENT_THEME.surface,
    });
  });

  it("materializes separate light and dark artifacts", () => {
    const light = getCanvasTemplateMaterialization(
      "button",
      CHARDESK_LIGHT_CONTENT_THEME
    );
    const dark = getCanvasTemplateMaterialization(
      "button",
      CHARDESK_DARK_CONTENT_THEME
    );

    expect(light.source.get({ x: 0, y: 0 })).toMatchObject({
      color: CHARDESK_LIGHT_CONTENT_THEME.foreground,
      bgColor: CHARDESK_LIGHT_CONTENT_THEME.surface,
    });
    expect(dark.source.get({ x: 0, y: 0 })).toMatchObject({
      color: CHARDESK_DARK_CONTENT_THEME.foreground,
      bgColor: CHARDESK_DARK_CONTENT_THEME.surface,
    });
  });

  it("consumes resolved user overrides without changing the catalog", () => {
    const customized = Object.freeze({
      ...CHARDESK_DARK_CONTENT_THEME,
      foreground: "#abcdef",
      surface: "#123456",
    });
    const materialization = getCanvasTemplateMaterialization(
      "button",
      customized
    );

    expect(materialization.source.get({ x: 0, y: 0 })).toMatchObject({
      color: "#abcdef",
      bgColor: "#123456",
    });
  });

  it("keeps identity templates fixed across content themes", () => {
    const light = getCanvasTemplateMaterialization(
      "amibios",
      CHARDESK_LIGHT_CONTENT_THEME
    );
    const dark = getCanvasTemplateMaterialization(
      "amibios",
      CHARDESK_DARK_CONTENT_THEME
    );

    expect(light.source.get({ x: 0, y: 0 })).toEqual(
      dark.source.get({ x: 0, y: 0 })
    );
    expect(light.source.get({ x: 0, y: 0 })).toMatchObject({
      color: "#c0c0c0",
      bgColor: "#000080",
    });
  });
});
