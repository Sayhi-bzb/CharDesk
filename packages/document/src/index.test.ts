import { describe, expect, it } from "vitest";
import {
  parseCharDeskDocumentEnvelope,
  serializeCharDeskDocumentEnvelope,
} from "./index.js";

describe("CharDesk document envelope", () => {
  it('requires explicit Canvas metadata support before reading version 2', () => {
    const canvas = { version: 1, pages: [] };
    const source = serializeCharDeskDocumentEnvelope({ mode: 'freeform', body: 'A', canvas });
    expect(() => parseCharDeskDocumentEnvelope(source)).toThrow('document/v2');
    expect(parseCharDeskDocumentEnvelope(source, { allowCanvasMetadata: true })).toEqual({
      mode: 'freeform', body: 'A', canvas,
    });
    expect(() => serializeCharDeskDocumentEnvelope({ mode: 'slide', body: '', canvas })).toThrow('Freeform');
    expect(() => parseCharDeskDocumentEnvelope(
      '---\nchardesk: document/v2\nmode: freeform\ncanvas: invalid\n---\nA',
      { allowCanvasMetadata: true },
    )).toThrow('Invalid Canvas document metadata');
  });
  it("round-trips each document mode as readable text", () => {
    for (const mode of ["freeform", "structured", "slide"] as const) {
      const source = serializeCharDeskDocumentEnvelope({
        mode,
        title: "Demo\nDeck",
        body: "first\r\nsecond\rthird\n",
      });

      expect(parseCharDeskDocumentEnvelope(source)).toEqual({
        mode,
        title: "Demo Deck",
        body: "first\nsecond\nthird\n",
      });
    }
  });

  it("normalizes a BOM and accepts a title-less document", () => {
    expect(
      parseCharDeskDocumentEnvelope(
        "\uFEFF---\r\nchardesk: document/v1\r\nmode: freeform\r\n---\r\nA"
      )
    ).toEqual({ mode: "freeform", body: "A" });
  });

  it("returns null for legacy and unrelated text", () => {
    expect(parseCharDeskDocumentEnvelope("A")).toBeNull();
    expect(
      parseCharDeskDocumentEnvelope(
        "---\nchardesk: slides/v1\n---\n## Slide"
      )
    ).toBeNull();
  });

  it("rejects an invalid canonical document mode", () => {
    expect(() =>
      parseCharDeskDocumentEnvelope(
        "---\nchardesk: document/v1\nmode: canvas\n---\nA"
      )
    ).toThrow("mode must be freeform, structured, or slide");
  });

  it("rejects unsupported and incomplete canonical headers", () => {
    expect(() =>
      parseCharDeskDocumentEnvelope(
        "---\nchardesk: document/v2\nmode: freeform\n---\nA"
      )
    ).toThrow("Unsupported CharDesk document version: document/v2");
    expect(() =>
      parseCharDeskDocumentEnvelope(
        "---\nchardesk: document/v1\nmode: freeform\nA"
      )
    ).toThrow("Invalid CharDesk document header");
  });
});
