// Self-contained JavaScript helpers: paste into canvas_code, then append a task-specific caller.
// Definitions only. No Canvas calls, placement, imports or browser APIs.
function frameByte(value) {
  if (!Number.isFinite(value) || value < 0 || value > 255) throw new RangeError("Expected display-referred RGB channels in 0..255");
  return Math.round(value);
}
function frameColor(color) {
  if (!color || color.length !== 3) throw new TypeError("Expected an RGB triple");
  return Array.from(color, frameByte);
}
function encodeHalfBlocks(frame, { background = null, rowOrder = "top-down" } = {}) {
  const { width, height, data, mask } = frame;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 || data.length !== width * height * 3) throw new RangeError("Expected a complete RGB frame");
  if (mask !== undefined && mask.length !== width * height) throw new RangeError("Expected one coverage value per color sample");
  if (rowOrder !== "top-down" && rowOrder !== "bottom-up") throw new RangeError("Unknown row order");
  const matte = background === null ? null : frameColor(background), escape = String.fromCharCode(27), rows = [], runs = [];
  const color = (x, y) => {
    if (y >= height) return matte;
    const index = (rowOrder === "bottom-up" ? height - 1 - y : y) * width + x;
    if (mask !== undefined && !mask[index]) return matte;
    const k = index * 3;
    return frameColor([data[k], data[k + 1], data[k + 2]]);
  };
  for (let y = 0; y < height; y += 2) {
    let row = escape + "[0m", runStart = -1, runSource = "";
    const flushRun = () => {
      if (runStart < 0) return;
      runs.push({ at: [runStart, y / 2], source: runSource + escape + "[0m", format: "ansi" });
      runStart = -1; runSource = "";
    };
    for (let x = 0; x < width; x++) {
      const upper = color(x, y), lower = color(x, y + 1);
      // Reset between Cells so an opaque neighbor cannot leak its lower color.
      let cell = escape + "[0m";
      if (upper && lower) cell += escape + "[38;2;" + upper.join(";") + ";48;2;" + lower.join(";") + "m▀";
      else if (upper || lower) cell += escape + "[38;2;" + (upper || lower).join(";") + "m" + (upper ? "▀" : "▄");
      else cell += " ";
      row += cell;
      if (upper || lower) { if (runStart < 0) runStart = x; runSource += cell; }
      else flushRun();
    }
    flushRun();
    rows.push(row + escape + "[0m");
  }
  return { source: rows.join("\n"), format: "ansi", width, height: Math.ceil(height / 2), runs };
}
