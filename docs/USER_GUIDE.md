# X3Diff user guide

## Try it

Requires Node.js 24. From this directory, run `npm ci` once, then `npm run dev`. Open the URL printed by Vite.

1. The workbench opens on the Dolphin example. Choose **Examples → Fit Lab** or another example, or load your own pair with the load icons inside **Before** and **After**, or by dragging files onto the 3D stage. While an example is on screen, your file is never compared with the example: a file chosen with either load icon clears the example, shows your file, and the stage asks for the other side ("Before is loaded (part-v1.x3d). Next, choose the After file, or drop it here") with a button for it. One dropped file does the same, as Before. Once both sides are your own files, a load icon replaces just its side and the comparison reruns. With your own files loaded, one dropped file fills the empty side, or replaces After when both are loaded. Two files dropped together fill both sides: a name containing "before", "original" or "old" goes to Before and one containing "after", "revised", "edited" or "new" goes to After; otherwise the pair is taken in file-name order, so `part-v1.x3d` is Before and `part-v2.x3d` is After. The status line confirms which file went where. Dropped files pass the same checks as picked ones (`.x3d` or `.xml`, UTF-8, at most 20 MiB). Comparisons start automatically when both files are loaded, and rerun when either is replaced.
2. Open **Slice & measure**. The tab appears only when supported changed geometry is available.
3. Choose an object and XY, XZ, or ZY. Move **Position** to sweep a shared plane through both revisions. The 3D plane and both 2D outlines update together.
4. Click a surface in the linked 3D view to move the slice there. Drag to orbit; scroll to zoom.
5. Click two outline locations in 2D. Both views show the ruler endpoints and line. A third click starts a new ruler; changing the plane clears it.
6. Select a supported geometry/transform difference in the register to inspect that object's pair. The object selector also allows changing the inspected pair directly.

Every example, and every pair of your own, opens side by side: the scene on the left and the difference register beside it, in view without scrolling on a 1440×900 screen. **Focus** in the scene toolbar gives the scene the full width and moves the register below it; **Split view** brings it back. The choice is remembered and then applies to every comparison.

The workbench opens in the theme of the landing page: light, or dark when your system is set to dark. **Dark mode** / **Light mode** in the header switches it, and that choice is remembered and takes precedence over the system setting.

**Customize** lets you hide optional tabs and change their order. Tab choices are remembered. On a phone (up to 540 px wide) every button, menu and field is at least 40 px in its smaller dimension, and the Before / Differences / After switch takes a toolbar row of its own. Switching tabs preserves the slice and ruler. See [extension documentation](EXTENDING.md) for the extension API.

Before is dashed pink; after is solid cyan. The 2D view preserves aspect ratio and uses the same world-coordinate plane for both revisions. Its framing stays fixed while sweeping, so apparent changes are not caused by independently fitting each outline. Section extents and the ruler use scene-coordinate units.

## Incomplete comparisons

X3Diff compares the 50 node types in its catalog. The line under the **File differences** heading says so next to the status badge ("Compares 50 X3D node types — see the list"); the link opens the list, and what each status means, in a new tab, so the comparison stays open. Many real files also contain others, such as fog, sensors or prototypes. When either file has content the tool cannot compare, the result is **incomplete**, and the workbench says so in four places:

- an amber notice above the analysis tabs, **"Incomplete comparison: some content was not compared"**, which stays at the top of the screen while you scroll the register. It lists, per file, how many elements were skipped and of which type, any settings or invalid values it could not read, and how many objects could not be matched with confidence. On a phone the list is folded; tap **What was not compared** to open it;
- the red status line under the header;
- the **Incomplete** badge next to Export;
- the word **partial** after the number of differences, and "Partial counts" above the summary figures.

What an incomplete result tells you:

- Every difference in the register is real. It was found in content the tool understands, and you can select it, slice it and measure it as usual.
- Grey objects in the Differences view are labelled "No difference found" instead of "Unchanged", because some of them may contain content that was skipped.

What it does **not** tell you:

- Whether the skipped elements changed. If only a fog setting differs between two files, the register is empty and reads "No differences found in the content that was compared. This is not a full check".
- That objects flagged as uncertain matches really are the same object.
- That the two files are otherwise identical. Treat an incomplete result as "at least these differences", never as "only these differences".

**Export → Report (HTML)** repeats the status and the list of what was skipped at the top of the page. **Export → Data (JSON)** writes the same status into the JSON report: `summary.status` is `"incomplete"`, and `diagnostics` contains one entry for every skipped element or setting, with the file it is in (`side`) and where (`path`).

Files may declare X3D 3.0, 3.1, 3.2, 3.3 or 4.0, and the two files need not declare the same version. A file that is not 3.3 adds a note ("read with the X3D 3.3 catalog") and the badge reads **With notes**; settings that exist only in 4.0 are listed as not compared.

If a file cannot be read at all (not well-formed XML, or a version outside 3.0 to 4.0), nothing is compared: the status line names the file and the reason, both revisions are still shown where possible, and there is no register.

## What the numbers mean

Each analysis view ends with one short line, the single most important limit of that measurement, and a closed **Limits of this measurement** disclosure with the full text. Open it with a click, or focus it and press Enter. The printable report repeats the full limits beside the numbers it quotes.

- **Before/after extents:** width and height of the intersection along the two displayed world axes. These can change because of placement, orientation, or deformation.
- **Ruler:** Euclidean straight-line distance between two manually selected points, snapped to the closest displayed outline. It is not an automatic corresponding-feature gap, shortest surface distance, or geodesic.
- The analysis uses authored static geometry in world coordinates. It neither plays animation (see Motion paths for that) nor automatically removes placement/rotation/scale differences. It does not convert unit metadata to millimetres or other physical units; use scene units consistently.
- Sphere and cylinder outlines come from tessellated triangles, so curved measurements are approximate. Coplanar triangles are omitted; adjacent crossing faces still contribute boundary segments. An open sheet lying entirely in the slice can show no intersection.

## Deliberate boundaries

Direct Box, Sphere, closed Cylinder, and convex IndexedFaceSet geometry under Group/Transform placement. The existing bounded mesh reader allows up to 3,000 coordinates and 10,000 triangles. Concave polygons, USE geometry, non-positive scales, unsupported placement, and ambiguous/missing pairs are excluded. If no supported pair remains, the Slice & measure tab is absent. An unsupported register selection keeps the previously named valid object with an explicit notice. Matching relies on the existing report plus DEF/path identity; remeshed semantic correspondence is not inferred.

Geometry measurements are exploratory and remain separate from the semantic JSON export. The HTML report quotes their key numbers (see Export below). Surface deviation provides sampled distance measurements. Volume differences measures enclosed Boolean regions or estimates occupied grid cells for a selected supported pair. Automatic registration, continuous whole-surface flattening, and universal invariance are not implemented.

## Surface deviation

Open **Surface deviation** to colour one selected object's triangles by unsigned nearest-surface distance. **Before → after** and **After → before** use the same colour scale for the pair; inspect both directions to catch asymmetric additions/removals. The mean and RMS are weighted by triangle area. The maximum is over sampled triangle centres, not the continuous surface. Each face uses its centre sample, so a thin feature or a within-face extreme can be missed. Curved primitives are tessellated; units are scene units; there is no automatic alignment. Selecting a face displays its sampled gap and a line to the nearest point on the other surface.

Sampling is computed on demand, yields periodically so the interface can respond, and is cancelled when its inputs change. Surface deviation uses one measured-pair cache and one renderer. Only the current pair is cached.

## Volume differences

The main scene shows the revision overlay. Volume differences has its own preview for a selected matched object pair. An object without a name of its own is identified by its geometry type and where it sits, for example "IndexedFaceSet in Bracket" or "IndexedFaceSet · shape 2 of 3 in Rack" (shapes are counted in file order); the same labels are used in the object selectors of all three geometry views. Its Object selector follows supported File differences selections and the other geometry views. A file selection without a supported pair keeps the previously selected volume object with an explicit notice. Other scene objects are omitted.

**Combined** shows before-only space in pink, after-only space in cyan, and shared space in subdued grey. Choose a region or click its metric to isolate it. **Show transparent object context** keeps both original outlines visible while inspecting a region. An empty region shows an explicit message; it is a valid result.

The three region metrics use scene units³. Before volume is before-only + shared; after volume is shared + after-only. **Net** is after-only − before-only; **Changed space** is before-only + after-only. **Original volume retained** is shared / before volume, as a percentage. For example, 20 before-only, 80 shared and 30 after-only means before 100, after 110, net +10, changed space 50, and 80% retained. A translated object can have zero net change while losing and gaining occupied space. These measurements describe spatial occupancy, not a manufacturing process or whole-assembly collision.

Primitive region volumes are measured from oriented triangles of the closed Boolean surfaces. Curved primitives use tessellation and are approximate. Mesh metrics count occupied cells times cell volume; the occupancy method fills between paired ray intersections, so open meshes can affect the estimate. The method and mesh cell size are given under **Limits of this measurement**, below the preview. Tiny Boolean residuals below one part per million of the larger volume display as **≈0**.

**Resolution** in this tab and Settings → Volume resolution control the same saved setting: curved-primitive tessellation and the mesh volume sampling grid (48, 85, or 170 cells along the longest bound). High halves the cell size relative to Medium. Mesh volume remains an approximation with visible grid steps; the main overlay retains the original mesh. A calculation failure is shown in this tab without replacing the main comparison.

## Motion paths

To open an example straight on this view, add `&view=motion` to its link: `app.html?example=brickhaven&view=motion`. The same works for `sections`, `volume`, `deviation` and `differences`.

The Before and After views play each revision's animation, but two animations are hard to compare by watching them. **Motion paths** draws where an animated object travels in each revision and measures how far apart the two are. The tab appears only when the motion of at least one object differs.

- **Animated object** lists the objects whose motion differs (matched by DEF name).
- The 3D view shows the **Before path** as a dashed pink line and the **After path** as a solid line coloured by the gap between the two revisions: blue where they coincide, through green and yellow, to red where they are furthest apart. The scale under the view gives the largest gap. Pink and cyan boxes show the object's bounds in each revision at the chosen moment, joined by a white line; faint grey boxes are the rest of the revised scene.
- Drag the slider, or press **Play**, to move through the animation. The readout gives the moment and the gap at that moment, and the chart underneath shows the gap over the whole period in the same colours.
- **Compare** changes what "at the same time" means. **At the same moment** compares the two revisions second by second, which is what you would see if both ran side by side; a change of speed alone opens a gap. **At the same point of the cycle** compares the routes regardless of speed; if the gap is then zero, only the timing changed, and the summary says so.
- The table gives each revision's cycle duration, the length of its path over one cycle, and the largest and average gap.

What it follows and what it does not: one point of the object, normally the centre of its geometry, or a bounds corner that exposes a rotation or scale difference (the summary says which). It reads animation declared as an enabled TimeSensor driving a PositionInterpolator or OrientationInterpolator routed to a Transform's translation, rotation or scale under Group/Transform placement, and includes the motion of the Transforms above the object. Disabled clocks stay disabled. Every enabled clock is taken to start at 0 s and run for one cycle or repeat; declared start, stop, pause and resume times are not evaluated. Paths use 240 intervals, so motion between samples can be missed. When several clocks contribute, each revision uses the longest clock interval, which need not be a full combined period. More than 128 animated objects skips motion analysis with a notice, while File differences remains available. Unsupported geometry uses a unit box as a tracking reference. Sensors, scripts, prototypes and other triggers are not evaluated, and other animated properties (colour, coordinates, scalar values) are not drawn. Distances are in scene units. It reads the two files directly, so it also works on an incomplete comparison.

## Export

**Export**, next to the status badge, opens a menu with two choices. It works with the mouse or the keyboard (Enter opens it, the arrow keys move, Escape closes).

- **Report (HTML)** downloads one page you can read, print (A4 or Letter) or attach to a review. It lists both file names with their sizes and X3D versions, when the report was written, the X3Diff version, the tolerances used, the status (Complete, With notes or Incomplete) with exactly what was skipped, every difference grouped by object with its before and after values, and a **Measurements** section. That section gives the key numbers of each analysis view available for the pair, followed by the limits of that measurement: overall extents, surface deviation in both directions and the volume regions for the object selected in the workbench, and the cycle, path length and gaps of the animated objects whose motion differs. The page has a light background, contains no script and needs no network. Long value lists are summarised by their length.
- **Data (JSON)** downloads the complete semantic report for other tools; see [Report format](REPORT_SCHEMA.md). It is unchanged by the HTML report.

Both files are named after the two inputs, for example `part-v1__part-v2.x3diff.html`. Characters that are unsafe in a file name are replaced by hyphens. Names and text taken from the files are shown as text, never interpreted.

## File differences

A sentence above the register says what happened in plain words, for example "1 object resized, 1 recoloured, 1 moved, 1 added." It counts objects, so one object can appear under several words; changes that are not about an object (lights, animation, titles) follow after a semicolon. The four figures under it (Geometry, Appearance, Structure, Other) add up to the number of differences in the heading.

An object with a DEF name is listed under that name. One without is named by what it contains and where it sits, in the same words as the object selectors of the geometry views: "IndexedFaceSet in Bracket", "Cylinder · shape 43 of 129 in Station" (shapes are counted in file order).

When three or more objects changed in exactly the same way, value for value, they are folded into one line: "28 materials changed the same way · 56 differences", with the change itself underneath. Open the line (click it, or focus it and press Enter) to see the shared values once and then every object; select an object to highlight it in the scene. Nothing is dropped: the heading count, the category filter and both exports still count and contain every individual change.

The same happens inside one object. When three or more of its parts changed the same setting from the same value to the same value (24 shapes of a rack recoloured alike), the object lists one closed line, "24 materials changed the same way · 24 differences", instead of 24 rows. Open it to get every change as its own row, named by the shape it sits in ("Box · shape 3 of 24 in Rack"), selectable as usual. The printable report lists each of these rows in full.

**● Present** and **○ Absent** consistently describe each revision; the action appears once beside each declaration as **+ Added** or **− Removed**. Numeric properties include a delta, and translation/scale/dimensions label X/Y/Z while emphasizing changed components. Numbers are written with five significant digits, or with as many as it takes for the two values to differ: a change of 0.000004 reported at a tight tolerance reads "X 2 → X 2.000004 (+0.000004)", in the register and in the printable report. Long arrays open under **Inspect values**, with 100 entries per page. Colours retain their swatches and numeric values.

A changed light (`DirectionalLight`, `PointLight`, `SpotLight`) is listed under **Lighting**, one row per setting: "Light intensity 1 → 0.6", colour with swatches, location and direction per axis, "Switched on: on → off". A direction is compared as a direction, so a longer vector pointing the same way is not a change. A light has no shape of its own, so selecting its row highlights nothing and the note under the register says so; open **Before** and **After** to see the lighting itself. Those two views use the lights of the file (and switch the headlight off when the file does and has a light that is on). **Differences** always uses the same neutral lighting, so its colours mean the same for every pair.

Click an object name or property row to highlight its scene geometry. The separate chevron expands or collapses a group's differences without changing selection. **Focus selected** explicitly frames supported static geometry; ordinary selection preserves the camera. Unsupported geometry remains highlighted with an explanatory notice when it cannot be framed.
