// Definitions only: combine with procedural-frame.js and a scene-specific caller.
// Orthographic view from +x,+y,+z; +y is up, larger x+y+z is nearer.
function createMiniatureRaster({ width, height, scale, origin, background = null }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 || !Number.isFinite(scale) || scale <= 0) throw new RangeError("Expected positive dimensions and scale");
  if (!origin || origin.length !== 2 || !origin.every(Number.isFinite)) throw new TypeError("Expected a finite screen origin");
  const data = new Uint8Array(width * height * 3), mask = new Uint8Array(width * height), depth = new Float64Array(width * height);
  depth.fill(-Infinity);
  if (background !== null) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(frameColor(typeof background === "function" ? background(x, y) : background), (y * width + x) * 3);
    mask[y * width + x] = 1;
  }
  const color = value => typeof value === "string" ? (() => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError("Expected #rrggbb");
    return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  })() : frameColor(value);
  const shade = (value, amount) => color(value).map(v => Math.round(Math.max(0, Math.min(255, v * amount))));
  const project = p => [origin[0] + (p[0] - p[2]) * scale * Math.sqrt(3) / 2,
    origin[1] + (p[0] + p[2]) * scale / 2 - p[1] * scale, p[0] + p[1] + p[2]];
  function triangle(a, b, c, value, alpha = 1) {
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("Expected alpha in 0..1");
    if (alpha === 0) return;
    const A = project(a), B = project(b), C = project(c), rgb = color(value);
    const den = (B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1]);
    if (Math.abs(den) < 1e-7) return;
    const left = Math.max(0, Math.floor(Math.min(A[0],B[0],C[0]))), right = Math.min(width-1, Math.ceil(Math.max(A[0],B[0],C[0])));
    const top = Math.max(0, Math.floor(Math.min(A[1],B[1],C[1]))), bottom = Math.min(height-1, Math.ceil(Math.max(A[1],B[1],C[1])));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const u = ((B[1]-C[1])*(x+.5-C[0])+(C[0]-B[0])*(y+.5-C[1]))/den;
      const v = ((C[1]-A[1])*(x+.5-C[0])+(A[0]-C[0])*(y+.5-C[1]))/den, w = 1-u-v;
      if (u < 0 || v < 0 || w < 0) continue;
      const d = u*A[2]+v*B[2]+w*C[2], i = y*width+x;
      if (d < depth[i]) continue;
      if (alpha < 1 && !mask[i]) throw new Error("Translucent fragments require an opaque surface or explicit background");
      depth[i] = d;
      for (let k = 0; k < 3; k++) data[i*3+k] = Math.round(data[i*3+k]*(1-alpha)+rgb[k]*alpha);
      mask[i] = 1;
    }
  }
  // Convex planar polygons only; triangulate other meshes explicitly.
  function poly(points, value, alpha = 1) {
    for (let i = 1; i < points.length-1; i++) triangle(points[0], points[i], points[i+1], value, alpha);
  }
  function box(x, y, z, w, h, d, value, tones = [1.12, .73, .92]) {
    poly([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]], shade(value, tones[0]));
    poly([[x+w,y,z],[x+w,y,z+d],[x+w,y+h,z+d],[x+w,y+h,z]], shade(value, tones[1]));
    poly([[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]], shade(value, tones[2]));
  }
  function disk(x, y, z, radius, value, alpha = 1) {
    const points = [];
    for (let i = 0; i < 20; i++) { const a = i*Math.PI/10; points.push([x+radius*Math.cos(a),y,z+radius*Math.sin(a)]); }
    poly(points, value, alpha);
  }
  function line(a, b, value, radius = .7, depthBias = 0) {
    const A = project(a), B = project(b), rgb = color(value);
    const steps = Math.max(1, Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])*2)), reach = Math.ceil(radius);
    for (let i = 0; i <= steps; i++) {
      const t = i/steps, xx = A[0]+(B[0]-A[0])*t, yy = A[1]+(B[1]-A[1])*t, zz = A[2]+(B[2]-A[2])*t+depthBias;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.round(xx-.5)+dx, y = Math.round(yy-.5)+dy;
        if (x < 0 || x >= width || y < 0 || y >= height || Math.hypot(x+.5-xx,y+.5-yy) > radius) continue;
        const k = y*width+x;
        if (zz >= depth[k]) { depth[k] = zz; data.set(rgb, k*3); mask[k] = 1; }
      }
    }
  }
  function sphere(x, y, z, radius, value) {
    const p = (lat, lon) => [x+radius*Math.sin(lat)*Math.cos(lon), y+radius*Math.cos(lat), z+radius*Math.sin(lat)*Math.sin(lon)];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 10; i++) {
      const a = j*Math.PI/6, b = (j+1)*Math.PI/6, t = i*Math.PI/5, u = (i+1)*Math.PI/5;
      poly([p(a,t),p(a,u),p(b,u),p(b,t)], shade(value,.72+.32*Math.cos((a+b)/2)+.12*Math.sin((t+u)/2)));
    }
  }
  return { frame: { width, height, data, mask }, project, triangle, poly, box, disk, line, sphere, color, shade };
}
