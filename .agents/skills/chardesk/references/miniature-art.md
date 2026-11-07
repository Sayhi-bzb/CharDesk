# How to make a readable miniature scene in Cells

Use this case when the requested picture depends on spatial objects and
occlusion: a street corner, station, workshop, room or similar scene.
For direct character art, flat patterns or imported frames, use the other
[procedural art paths](procedural-art.md#choose-the-path).

**Scene geometry + materials** → **color frame + depth + coverage**  
　　　　　　　　　　　　　　　　　　　　↓  
　　　　　　　　　　　　　　**half-block ANSI → Canvas Cells**

## What made the street-corner case work

The reference composition is a cream cafe with a tiled roof, awning, terrace,
trees and a small car. It was generated in Code Mode without an image or model
asset. Its useful decisions transfer to other subjects:

| Decision in the cafe | Transfer to another scene |
| --- | --- |
| Roof and walls establish the silhouette before small props. | Give the scene one legible subject and keep its outline distinct from the surroundings. |
| A pedestrian, furniture and car share a world scale. | Pick familiar scale cues before choosing geometry dimensions. |
| Roof seams, awning stripes and window frames sit on their actual surfaces. | Put detail in object coordinates so it follows projection and occlusion; avoid screen-wide texture noise. |
| Cream, terracotta and sage repeat across objects, with darker window recesses. | Assign materials and face tones intentionally; the cafe colors are an example palette. |
| A short street and raised paving frame the building. | Choose a footprint and negative space that support the subject. A tile base is optional. |
| Large forms, secondary props and sparse small details remain readable together. | Inspect at the intended Cell scale; enlarge, simplify or remove details that collapse into noise. |

Do not require every scene to have a cafe, pastel colors, a base or this camera.
Choose a different renderer when the task needs perspective, arbitrary camera
rotation, imported models, accurate lighting or a large mesh.

## Reusable source and complete example

- [miniature-raster.js](../assets/miniature-raster.js) owns the small software
  rasterizer: fixed orthographic projection, explicit sample coverage,
  depth, convex polygons, boxes, disks, faceted spheres and depth-tested lines.
- [miniature-cafe.js](../assets/miniature-cafe.js) owns the reference geometry and
  material choices. Replace this function for another subject; keep the renderer
  and encoder unchanged.
- [procedural-frame.js](../assets/procedural-frame.js) owns RGB validation and
  half-block ANSI encoding. Targeting and apply/readback follow
  [procedural art](procedural-art.md#compose-with-the-current-tool-contract).

Load these definitions as text into the same script, in that order with
`procedural-frame.js` first, then append a caller. They do not select a Canvas or
write anything by themselves. The following caller reproduces the reference's
framing on a page whose Code Mode supports patch. The
[projection workflow](procedural-art.md#compose-with-the-current-tool-contract)
owns the capability check and single-artifact fallback.

```js
const raster = createMiniatureRaster({
  width: 220, height: 180, scale: 10, origin: [110, 112],
  background: null,
});
const frame = drawMiniatureCafe(raster);
const material = encodeHalfBlocks(frame);
const result = await canvas.render({
  at: chosenAt, source: material.source, format: material.format, writeMode: "patch",
});
if (result.ok === false) return { code: result.code, message: result.message };
return {
  bounds: result.bounds, writtenCells: result.writtenCells,
  skippedWhitespaceCells: result.skippedWhitespaceCells,
  operationId: result.operationId, persistence: result.persistence,
};
```

`chosenAt` comes from the inspected target. Patch projects the full frame in one
call while skipping uncovered Cells. The sample dimensions, origin and
scale describe this composition, not recommended defaults for all pictures.
To adapt it, specify subject, spatial layout, scale cues, materials, mood and
output Cell bounds; then fit the projected silhouette before adding details.

The raster now defaults to uncovered samples (`background:null`), so the cafe
and other objects sit directly on the Canvas. Its paving and street tile are
scene geometry and remain visible. A backdrop is an explicit choice: supply a
color or `(x,y)=>RGB` function as `background` when the task needs one. An old
full-frame RGB image needs its original geometry coverage or another reliable
mask; removing a guessed color can remove real object pixels. The encoder's
[background and coverage contract](procedural-art.md#background-and-coverage)
owns the transparent half-block rules.

## Renderer limits that affect authoring

World coordinates use `+y` upward; the view looks from `+x,+y,+z`. `box` emits
the three faces visible from that view. `project` returns sample-space x/y and
world depth; larger depth is nearer. `scale` and `origin` control image framing,
not Cell metrics. Half-block packing determines the final Cell dimensions.

Use planar convex polygons or explicit triangles. This helper has no general
transparency sorter, shadow solver or material lighting model. Its alpha option
is for ordered compositing onto existing opaque samples, such as the cafe's
ground shadow disks drawn after the ground and before objects. Partial alpha
over an uncovered sample is rejected; alpha zero draws nothing. Overlapping translucent surfaces require another
approach. Equal-depth surfaces are submission-order dependent.

Line radius is measured in image samples; `depthBias` is measured in world-depth
units. Default bias is zero. The cafe supplies a small local bias for surface
details; excessive bias makes hidden lines show through foreground objects.
Do not apply it as a global occlusion fix.

## Inspect before delivery

Read back the full returned image bounds. Check silhouette, aspect, occlusion,
tiny props, palette and accidental cropping at the actual viewing size. An
accepted render only proves projection succeeded. For renderer changes, also
check that separated opaque surfaces occlude correctly regardless of submission
order, empty samples stay uncovered, clipped geometry stays in bounds, and a second scene works without
changing the rasterizer or encoder.
