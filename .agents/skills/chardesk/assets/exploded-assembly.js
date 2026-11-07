// Definitions only. Translation-based assembly views on a miniature-raster.
function offsetAssemblyRaster(raster, offset) {
  const point = p => p.map((value, i) => value + offset[i]);
  return {
    frame: raster.frame, color: raster.color, shade: raster.shade,
    project: p => raster.project(point(p)),
    triangle: (a,b,c,...style) => raster.triangle(point(a),point(b),point(c),...style),
    poly: (points,...style) => raster.poly(points.map(point),...style),
    line: (a,b,...style) => raster.line(point(a),point(b),...style),
    box: (x,y,z,...shape) => raster.box(x+offset[0],y+offset[1],z+offset[2],...shape),
    disk: (x,y,z,...shape) => raster.disk(x+offset[0],y+offset[1],z+offset[2],...shape),
    sphere: (x,y,z,...shape) => raster.sphere(x+offset[0],y+offset[1],z+offset[2],...shape),
  };
}
function renderExplodedAssembly(raster, parts, { amount = 1 } = {}) {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw new RangeError("Expected explosion amount in 0..1");
  if (!Array.isArray(parts)) throw new TypeError("Expected parts");
  const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const ids = new Set();
  // Validate metadata before drawing so malformed later parts do not leave a partial frame.
  const planned = parts.map(part => {
    if (!part || typeof part.id !== "string" || !part.id || ids.has(part.id) || typeof part.draw !== "function") throw new TypeError("Expected unique part IDs and draw callbacks");
    ids.add(part.id);
    const origin = part.origin ?? [0,0,0], at = part.at ?? [0,0,0], explodeBy = part.explodeBy ?? [0,0,0], anchor = part.anchor ?? origin;
    if (![origin,at,explodeBy,anchor].every(vector)) throw new TypeError("Expected finite 3D part vectors");
    const offset = at.map((value, i) => value + amount*explodeBy[i] - origin[i]);
    const worldAnchor = anchor.map((value, i) => value + offset[i]);
    return { part, offset, worldAnchor };
  });
  const placed = planned.map(({part,offset,worldAnchor}) => {
    part.draw(offsetAssemblyRaster(raster,offset));
    return { id: part.id, label: part.label ?? part.id, worldAnchor, screenAnchor: raster.project(worldAnchor) };
  });
  return { frame: raster.frame, parts: placed };
}
