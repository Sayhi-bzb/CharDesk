import {
  StyledText,
  TextBuffer,
  TextBufferView,
  type CliRenderer,
  type OptimizedBuffer,
  type TextChunk,
} from '@opentui/core';

export type LinkedGlyph = { x: number; y: number; width: number; chunk: TextChunk };

/** Native styled text owns URL allocation and OSC 8 encoding. Resources follow visible runs. */
export class TerminalLinkText {
  #runs = new Map<string, { text: TextBuffer; view: TextBufferView }>();
  #visible = new Set<string>();
  constructor(private renderer: CliRenderer) {}

  beginFrame() {
    this.#visible.clear();
  }

  draw(buffer: OptimizedBuffer, glyphs: LinkedGlyph[], layer: 'document' | 'placement') {
    glyphs.sort((a, b) => a.y - b.y || a.x - b.x);
    let x = 0,
      y = 0,
      end = 0;
    let chunks: TextChunk[] = [];
    const flush = () => {
      if (!chunks.length) return;
      const key = `${layer}:${x}:${y}`;
      let run = this.#runs.get(key);
      if (!run) {
        const text = TextBuffer.create(this.renderer.widthMethod, this.renderer.nativeScene);
        const view = TextBufferView.create(text);
        view.setWrapMode('none');
        run = { text, view };
        this.#runs.set(key, run);
      }
      this.#visible.add(key);
      run.text.setStyledText(new StyledText(chunks));
      run.view.setViewportSize(end - x, 1);
      buffer.drawTextBuffer(run.view, x, y);
    };
    for (const glyph of glyphs) {
      if (!chunks.length || glyph.y !== y || glyph.x !== end) {
        flush();
        x = glyph.x;
        y = glyph.y;
        chunks = [];
      }
      chunks.push(glyph.chunk);
      end = glyph.x + glyph.width;
    }
    flush();
  }

  endFrame() {
    for (const [key, run] of this.#runs) {
      if (this.#visible.has(key)) continue;
      run.view.destroy();
      run.text.destroy();
      this.#runs.delete(key);
    }
  }

  destroy() {
    for (const run of this.#runs.values()) {
      run.view.destroy();
      run.text.destroy();
    }
    this.#runs.clear();
    this.#visible.clear();
  }
}
