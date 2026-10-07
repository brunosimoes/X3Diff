# X3Diff user guide

## Try it

Requires Node.js 24. From this directory, run `npm ci` once, then `npm run dev`. Open the URL printed by Vite.

1. Choose **Examples → Dolphin** or **Fit Lab**, or use the load icons inside **Before** and **After**. Comparisons start automatically when both files are loaded, and rerun when either is replaced.
2. Open **Slice & measure**. The tab appears only when supported changed geometry is available.
3. Choose an object and XY, XZ, or ZY. Move **Position** to sweep a shared plane through both revisions. The 3D plane and both 2D outlines update together.
4. Click a surface in the linked 3D view to move the slice there. Drag to orbit; scroll to zoom.
5. Click two outline locations in 2D. Both views show the ruler endpoints and line. A third click starts a new ruler; changing the plane clears it.
6. Select a supported geometry/transform difference in the register to inspect that object's pair. The object selector also allows changing the inspected pair directly.

**Customize** lets you hide optional tabs and change their order. Tab choices are remembered. Switching tabs preserves the slice and ruler. See [extension documentation](EXTENDING.md) for the extension API and current coverage of the judging criteria.

Before is dashed pink; after is solid cyan. The 2D view preserves aspect ratio and uses the same world-coordinate plane for both revisions. Its framing stays fixed while sweeping, so apparent changes are not caused by independently fitting each outline. Section extents and the ruler use scene-coordinate units.

## What the numbers mean

- **Before/after extents:** width and height of the intersection along the two displayed world axes. These can change because of placement, orientation, or deformation.
- **Ruler:** Euclidean straight-line distance between two manually selected points, snapped to the closest displayed outline. It is not an automatic corresponding-feature gap, shortest surface distance, or geodesic.
- The analysis uses authored static geometry in world coordinates. It neither plays animation nor automatically removes placement/rotation/scale differences. It does not convert unit metadata to millimetres or other physical units; use scene units consistently.
- Sphere and cylinder outlines come from tessellated triangles, so curved measurements are approximate. Coplanar triangles are omitted; adjacent crossing faces still contribute boundary segments. An open sheet lying entirely in the slice can show no intersection.

## Deliberate boundaries

Direct Box, Sphere, closed Cylinder, and convex IndexedFaceSet geometry under Group/Transform placement. The existing bounded mesh reader allows up to 3,000 coordinates and 10,000 triangles. Concave polygons, USE geometry, non-positive scales, unsupported placement, and ambiguous/missing pairs are excluded. If no supported pair remains, the Slice & measure tab is absent. An unsupported register selection keeps the previously named valid object with an explicit notice. Matching relies on the existing report plus DEF/path identity; remeshed semantic correspondence is not inferred.

Geometry measurements are exploratory and remain separate from the semantic JSON export. Surface deviation provides sampled distance measurements. Volume differences measures enclosed Boolean regions or estimates occupied grid cells for a selected supported pair. Automatic registration, continuous whole-surface flattening, and universal invariance are not implemented.

## Surface deviation

Open **Surface deviation** to colour one selected object's triangles by unsigned nearest-surface distance. **Before → after** and **After → before** use the same colour scale for the pair; inspect both directions to catch asymmetric additions/removals. The mean and RMS are weighted by triangle area. The maximum is over sampled triangle centres, not the continuous surface. Each face uses its centre sample, so a thin feature or a within-face extreme can be missed. Curved primitives are tessellated; units are scene units; there is no automatic alignment. Selecting a face displays its sampled gap and a line to the nearest point on the other surface.

Sampling is computed on demand, yields periodically so the interface can respond, and is cancelled when its inputs change. Surface deviation uses one measured-pair cache and one renderer. Only the current pair is cached.

## Volume differences

The main scene shows the revision overlay. Volume differences has its own preview for a selected matched object pair. Its Object selector follows supported File differences selections and the other geometry views. A file selection without a supported pair keeps the previously selected volume object with an explicit notice. Other scene objects are omitted.

**Combined** shows before-only space in pink, after-only space in cyan, and shared space in subdued grey. Choose a region or click its metric to isolate it. **Show transparent object context** keeps both original outlines visible while inspecting a region. An empty region shows an explicit message; it is a valid result.

The three region metrics use scene units³. Before volume is before-only + shared; after volume is shared + after-only. **Net** is after-only − before-only; **Changed space** is before-only + after-only. **Original volume retained** is shared / before volume, as a percentage. For example, 20 before-only, 80 shared and 30 after-only means before 100, after 110, net +10, changed space 50, and 80% retained. A translated object can have zero net change while losing and gaining occupied space. These measurements describe spatial occupancy, not a manufacturing process or whole-assembly collision.

Primitive region volumes are measured from oriented triangles of the closed Boolean surfaces. Curved primitives use tessellation and are approximate. Mesh metrics count occupied cells times cell volume; the occupancy method fills between paired ray intersections, so open meshes can affect the estimate. The method and mesh cell size are shown below the preview. Tiny Boolean residuals below one part per million of the larger volume display as **≈0**.

**Resolution** in this tab and Settings → Volume resolution control the same saved setting: curved-primitive tessellation and the mesh volume sampling grid (48, 85, or 170 cells along the longest bound). High halves the cell size relative to Medium. Mesh volume remains an approximation with visible grid steps; the main overlay retains the original mesh. A calculation failure is shown in this tab without replacing the main comparison.

## File differences

**● Present** and **○ Absent** consistently describe each revision; the action appears once beside each declaration as **+ Added** or **− Removed**. Numeric properties include a delta, and translation/scale/dimensions label X/Y/Z while emphasizing changed components. Long arrays open under **Inspect values**, with 100 entries per page. Colours retain their swatches and numeric values.

Click an object name or property row to highlight its scene geometry. The separate chevron expands or collapses a group's differences without changing selection. **Focus selected** explicitly frames supported static geometry; ordinary selection preserves the camera. Unsupported geometry remains highlighted with an explanatory notice when it cannot be framed.
