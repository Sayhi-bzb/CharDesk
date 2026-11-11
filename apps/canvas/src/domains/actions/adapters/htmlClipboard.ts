/** Import external formatting as semantics; document colors come from the text renderer. */
export async function htmlClipboardToMarkdown(html: string, plainText: string): Promise<string | null> {
  if (!html || html.length > 16_777_216 || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style, noscript, iframe, object, template").forEach(node => node.remove());

  // Editors also encode bold as inline font-weight. Normalize it before using
  // the standard HTML converter, including Google Docs' normal-weight <b> wrapper.
  for (const node of document.querySelectorAll<HTMLElement>("[style]")) {
    const weight = node.style.fontWeight;
    if ((node.tagName === "B" || node.tagName === "STRONG") &&
        (weight === "normal" || (weight && Number(weight) < 600))) {
      const span = document.createElement("span");
      span.append(...node.childNodes);
      node.replaceWith(span);
    } else if (node.tagName !== "B" && node.tagName !== "STRONG" &&
        (weight === "bold" || Number(weight) >= 600)) {
      const strong = document.createElement("strong");
      strong.append(...node.childNodes);
      node.append(strong);
    }
  }

  // A plain HTML wrapper must not escape Markdown from a text editor.
  if (plainText && !document.body.querySelector("strong, b, em, i, a[href], code, pre, h1, h2, h3, h4, h5, h6, blockquote, ul, ol")) {
    return null;
  }
  const { default: TurndownService } = await import("turndown");
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  return converter.turndown(document.body) || null;
}
