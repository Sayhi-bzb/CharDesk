# How to explain an assembly with an exploded Cell view

Use this case for a product teardown, mechanical study, layered construction or
assembly explanation whose parts need readable spatial relationships. The
accepted reference is a conceptual mechanical watch with case, plate, wheels,
bridge, dial and bezel. Other subjects choose their own decomposition, materials,
camera and separation directions.

**Part geometry** + **assembled placement** + **explosion offset**  
　　　　　　　　　　　　　　↓  
　　　　　　　　**one shared projection and depth buffer**  
　　　　　　　　　　　　　　↓  
　　　　　　　　**Cell picture + native text annotations**

## Decisions to carry into another subject

| Watch decision | Transferable method |
| --- | --- |
| Six named functional groups rather than unrelated floating shapes. | Choose parts that answer the explanation: what contains, supports, connects or covers what? Use source evidence for a factual assembly. |
| Coaxial case, plate, dial and bezel keep their shared alignment. | Preserve assembly relationships while expanding along selected axes; avoid scattering parts merely to fill the page. |
| The same geometry is used at assembled and expanded positions. | Separate modeling from placement. Adjust explosion amount without editing shape dimensions. |
| Open bezel, visible bearings and distinct face tones expose the structure. | Leave explanatory openings, preserve silhouettes and distinguish material roles before adding surface detail. |
| Sparse guides and a separate annotation gutter clarify layers. | Derive anchors from transformed parts. Keep labels legible and clear of the geometry. |

A straight stack is useful for a coaxial assembly. A camera module may separate
lenses along its optical axis, a keyboard may separate plates vertically, and a
gearbox may use different offsets for shafts and covers. Do not impose the watch's
six groups, gold palette, circular parts or vertical stack on these subjects.

The watch is an illustration: tooth contacts, shafts, clearances and operation
were not mechanically validated. For a real device, derive parts and attachment
relationships from supplied drawings, CAD or another identified source. Keep
invented details identified as conceptual.

## Reusable assets

- [exploded-assembly.js](../assets/exploded-assembly.js) owns translation-based
  part placement and annotation anchors. It uses the existing
  [miniature rasterizer](miniature-art.md#renderer-limits-that-affect-authoring).
- [exploded-watch.js](../assets/exploded-watch.js) owns the complete watch study,
  including its illustrative rings, toothed wheels, materials and guides.
  These details are examples, not a general mechanical modeling API.
- [procedural art](procedural-art.md) owns encoding, tool selection, targeting,
  projection budgets and readback. Reuse its encoder and delivery workflow.

Load definitions in this order: `procedural-frame.js`, `miniature-raster.js`,
`exploded-assembly.js`, then the chosen composition. None selects a Canvas or
writes to it.

## Part placement contract

`renderExplodedAssembly(raster, parts, {amount})` draws the parts and returns
`{frame, parts}`. Each returned part has `id`, `label`, `worldAnchor` and
`screenAnchor`. Input parts supply:

| Field | Meaning |
| --- | --- |
| `id`, `label` | Unique stable ID and optional annotation text. |
| `draw(local)` | Draw authored geometry using the translated raster interface. |
| `origin` | Authoring pivot, default `[0,0,0]`. |
| `at` | Assembled position of that pivot, default `[0,0,0]`. |
| `explodeBy` | Full expansion displacement in world units, default zero. |
| `anchor` | Annotation point in authored coordinates, default `origin`. |

**World point** = `authored point − origin + at + amount × explodeBy`

`amount: 0` uses assembled positions; `1` uses the full offsets. Intermediate
values produce static intermediate views. All parts share one depth buffer.
The helper supports translations; rotations, collision checks, assembly solving
and animation playback require an appropriate separate implementation.

For a small non-watch example, create a fresh raster and draw a three-part module:

```js
const result = renderExplodedAssembly(raster, [
  { id: "housing", at: [0,0,0], anchor: [1,.15,1],
    draw(r) { r.box(-1,0,-1,2,.3,2,"#69858a"); } },
  { id: "board", at: [0,.3,0], explodeBy: [0,1,0], anchor: [.8,0,.8],
    draw(r) { r.box(-.8,0,-.8,1.6,.12,1.6,"#89a384"); } },
  { id: "cover", at: [0,.42,0], explodeBy: [.5,2,0], anchor: [1,0,1],
    draw(r) { r.box(-1,0,-1,2,.2,2,"#c5b58c"); } },
], { amount: chosenAmount });
const material = encodeHalfBlocks(result.frame);
```

Supply `raster` and `chosenAmount` from the task. To reproduce the watch's accepted
framing, use `width:260`, `height:284`, `scale:13`, `origin:[112,232]` and call
`drawExplodedWatch(raster,{amount:1})`. The raster's default background is transparent,
including the spaces between parts. Add a backdrop only when requested, following
the [coverage contract](procedural-art.md#background-and-coverage).
Use one full-frame patch projection for placement, as in the
[miniature caller](miniature-art.md#reusable-source-and-complete-example).
The same frame can be generated outside Code Mode and submitted as one ANSI
artifact when that execution path is needed; follow the
[shared projection workflow](procedural-art.md#compose-with-the-current-tool-contract).
The reference parts retain their authored study coordinates and
declare a pivot for each group, so placement can change without rewriting them.

`screenAnchor` is in color-sample coordinates. With the linked half-block encoder,
a sample anchor `(x,y)` maps to relative Cell position `(floor(x),floor(y/2))`;
add the inspected Canvas placement once. Lay out labels in a gutter with enough
row separation and connect them to their anchors when needed. Recompute these
positions after changing the camera, scale or explosion amount.

## Check the explanation and the projection

- Compare amount `0`, an intermediate value and `1`. Geometry dimensions and part
  IDs should remain stable; only placement changes. Use a fresh raster per frame.
- Check shared axes, part ordering, occlusion and small openings at the intended
  Cell scale. Expand gaps or simplify detail when neighboring layers merge.
- Check that labels identify the right transformed part and avoid collisions.
- Inspect the actual projected picture and strip boundaries using the
  [procedural art verification workflow](procedural-art.md#verify-the-result).
  A large-image read can be inspected as adjacent bounded regions when necessary.

For reusable placement changes, verify the transform and anchor formula with a
different assembly as well as the watch. Rendering success does not validate a
mechanical design.
