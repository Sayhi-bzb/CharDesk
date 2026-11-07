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
function sampleColorFrame({ width, height, sample, time = 0, seed = 0, parameters = {} }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) throw new RangeError("Expected positive integer sample dimensions");
  if (!Number.isFinite(time) || !Number.isSafeInteger(seed) || typeof sample !== "function") throw new TypeError("Expected a sampler, finite time and integer seed");
  const data = new Uint8Array(width * height * 3);
  const context = { width, height, time, seed, parameters };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(frameColor(sample((x + 0.5) / width, (y + 0.5) / height, context)), (y * width + x) * 3);
  }
  return { width, height, data };
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
function mixFrameColor(a, b, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return a.map((value, index) => value + (b[index] - value) * t);
}
// Two independent examples sharing the encoder. Replace either sampler with a task's own generator.
const colorFields = {
  waves(u, v, { time, seed, parameters }) {
    const level = (Math.sin(u * 19 + time + seed * 0.17) + Math.cos(v * 23 - time * 0.7) + 2) / 4;
    return mixFrameColor(parameters.low, parameters.high, level);
  },
  contours(u, v, { width, height, time, seed, parameters }) {
    const radius = Math.hypot((u - 0.5) * width / height, v - 0.5);
    const level = (Math.sin(radius * 36 - time * 2 + seed * 0.17) + 1) / 2;
    return mixFrameColor(parameters.low, parameters.high, level);
  },
};
