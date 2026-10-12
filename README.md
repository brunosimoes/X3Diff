# X3Diff

**Understand the change. Decide with evidence.**

X3Diff is a browser-based workbench for comparing XML-encoded X3D scenes (versions 3.0 to 4.0, read with an X3D 3.3 catalog). It connects a deterministic semantic report to interactive geometry and motion inspection, helping reviewers understand human-authored or AI-assisted edits before accepting them. It supports review decisions; it does not implement an automatic approval or merge gate.

[Website and abstract](https://brunosimoes.github.io/X3Diff/) · [Open the workbench](https://brunosimoes.github.io/X3Diff/app.html) · [Project abstract](docs/ABSTRACT.md) · [User guide](docs/USER_GUIDE.md)

## Review a revision

The workbench opens on the Brickhaven example. Load your own files with the **A** and **B** buttons, drag one or two `.x3d` files onto the stage, or choose another example. Loading your own file clears the example and prompts for the other revision. Comparison starts automatically when both inputs are available. Select a difference to highlight the corresponding object in the overlay.

| Analysis view      | Question it helps answer                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| File differences   | Which supported declarations and values changed?                          |
| Slice & measure    | How do the cross-sections differ at this position?                        |
| Surface deviation  | Where are sampled distances between the surfaces larger?                  |
| Volume differences | How much occupied space changed, and where, for a selected pair?          |
| Motion paths       | Where does an animated object travel in each revision, and how far apart? |

Geometry views appear when supported changed pairs are available; Motion paths appears when supported animation differs. **Settings** controls point tolerance and volume resolution. Settings, theme and side-panel width are remembered in the browser. Each measurement includes a disclosure explaining its limits.

File differences summarizes changes in plain language and groups them by object. Objects without a DEF name are identified by their geometry and location. Repeated identical changes appear as a shared card with their object count; every semantic difference remains present in the exports. **Zoom to selection** frames supported static geometry. Object selection is linked across the geometry views. Volume differences reports before-only, shared and after-only space, net change and original-volume retention in scene units³.

**Export → Report (HTML)** downloads a printable, offline page containing input details, tolerances, status, skipped content, every semantic difference and available analysis measurements with their limits. **Export → Data (JSON)** downloads the deterministic semantic report for other tools; exploratory geometry measurements belong to the HTML report. Both files are named after the inputs, for example `part-v1__part-v2.x3diff.html` and `.json`. See the [report format](docs/REPORT_SCHEMA.md) and [user guide](docs/USER_GUIDE.md).

## Run and validate

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

The root URL is the project website. Open `/app.html` for the workbench.

```sh
npm run check         # TypeScript, unit/regression tests, production build
npm run test:browser  # Interactive browser checks (dev server)
npm run test:preview  # UI browser checks against the production build at /X3Diff/
npm run preview      # Serve the generated dist directory
npm run benchmark    # Local comparison timings
```

Browser tests use Edge on Windows. On Linux, install Chromium with `npx playwright install --with-deps chromium`. Tests cover typed parsing and comparison, version handling, golden reports, geometry, motion paths, input limits, hostile-input handling, cancellation, linked selection, settings, responsive layout, and example scenes.

`npm run build` creates a static multipage site in `dist/`. Renderer assets and license notices are copied from pinned dependencies during dev/build; `public/vendor/` is generated and ignored. No application server, AI service, account, or model-upload endpoint is required. A modern browser with WebGL is needed for interactive views.

## Supported scope

The semantic catalog is generated from official X3DUOM 3.3 and X3D 3.3 XSD sources with pinned hashes. It covers 50 common nodes and supported typed fields, defaults, parent relationships, DEF/USE, ROUTE declarations, metadata, profile context and component requirements. Lights, viewpoints, `NavigationInfo`, `Background` and `WorldInfo` are included. Each report contains the exact supported node and field types. The header links to a coverage page whose node list and count are generated from the catalog. See [X3D coverage](docs/X3D_COVERAGE.md) for the full analysis boundary.

Files declaring X3D 3.0, 3.1, 3.2, 3.3 or 4.0 are compared, and the two revisions may declare different versions. The version change is listed as a document difference. Each file is read with the 3.3 catalog, and versions other than 3.3 carry a note saying so. The X3D 4.0 default containment of metadata nodes inside a `MetadataSet` is applied, the light fields that 4.0 added (`shadows`, `shadowIntensity`) are compared, and a `SpotLight` without a `beamWidth` gets the default of its own version (π/4 up to 3.3, 3π/16 in 4.0; the generator checks every catalogued default against the official 4.0 model). Fields outside the catalog are diagnosed as not compared and make the result incomplete. Other declared versions are not compared.

Default tolerances are absolute/relative floats `1e-6`, vector distance `1e-5`, rotation angle `1e-5` radians, and color-channel difference `1e-4`. Coordinate points are compared by index when arrays have equal length. A light `direction` is compared as a direction, so `0 0 -2` equals `0 0 -1`. Point tolerance is configurable in Settings. Unknown nodes, unsupported fields, invalid declarations, ambiguous matches, and version boundaries produce diagnostics or incomplete results. No-change results are meaningful only within the declared supported scope.

### Incomplete results

Content outside the catalog, including fog, prototypes and unsupported sensors, makes the comparison **incomplete**. Unsupported document-header elements, including unit declarations, also make the result incomplete. The workbench displays the supported differences with a persistent notice identifying what was skipped in each file. Counts describe only the compared content; grey geometry is not proof that unsupported content is unchanged.

- **It establishes:** changes found in supported declarations, with object-match confidence recorded in the report.
- **It does not vouch for:** anything inside the skipped elements or settings (a changed fog range is not reported), a correct match for objects flagged as uncertain, or the absence of further differences. "Nothing found" in an incomplete result is not "the files are the same".

The exported JSON carries the same information in schema 1.0 fields: `summary.status` is `"incomplete"`, `summary.unsupportedCount` counts the skipped declarations, and `diagnostics` holds one entry per skipped element or setting with its file (`side`) and location (`path`). A comparison that failed outright (a file that is not well-formed XML, or a version outside 3.0 to 4.0) compares nothing and shows no register.

A changed light is a **Lighting** entry in File differences (intensity, colour, location, direction, on/off and the other light fields, with before and after values). It is declaration evidence: a light has no shape, so selecting it highlights nothing and the geometry views do not measure it. Before and After render each revision with its own lights, and with the headlight off when the file turns it off and has a light switched on; the Differences overlay always uses neutral lighting so its colour code reads the same for every pair. Illumination itself is not measured.

Geometric inspection supports direct Box, Sphere, closed Cylinder, and bounded convex IndexedFaceSet geometry under supported Group/Transform placement. Sections and distances use static world coordinates without registration or physical-unit conversion. Surface distances sample triangle centres and can miss extremes; Volume differences examines one matched pair: tessellated CSG for supported primitives or a bounded occupancy-grid approximation for supported meshes. It is not whole-assembly collision analysis or certified metrology.

Before/After views show each authored revision with animation paused; Motion paths provides controlled playback of sampled motion. The comparison describes declarations, not runtime motion. Motion paths bridges the two for position and rotation animation: it follows an enabled TimeSensor driving a PositionInterpolator or OrientationInterpolator routed to a Transform under Group/Transform placement (including animated parents), samples both revisions from time zero, and reports the gap between them at the same moment or at the same point of the cycle. It follows the centre or a bounds corner that exposes a rotation or scale difference. Disabled clocks stay disabled. Paths use 240 sampling intervals and can miss motion between samples; each revision's comparison window is its longest contributing clock interval, rather than a full combined period of multiple clocks. More than 128 animated objects skips motion analysis with a notice; the semantic report remains available. Start, stop, pause and resume times, sensors, scripts and other triggers are not evaluated, and colour, scalar and coordinate animation is not drawn. PROTO/EXTERNPROTO, scene scripts, external Inline/media resources, arbitrary shaders, and the full X3D standard are outside the supported analysis boundary.

## Privacy and input handling

User files are read in the browser. Parsing rejects entity declarations and internal DTD subsets; external DOCTYPE declarations are not resolved. Limits include 20 MiB, 50,000 parsed node elements, five million numeric tokens in interpreted fields, and 256 XML nesting levels per side. Preview sanitization removes scripts, prototypes, external scenes, and URL-bearing media. Both exports contain input-derived data: share them deliberately. In the HTML report every name and string from the files is escaped, and the page carries its own policy that allows no script and no network access.

The site includes a meta CSP in each page. `public/_headers` repeats the same policy per page (plus `frame-ancestors`, which only works as a response header) for hosts that support that format; GitHub Pages does not apply this file as custom headers. `tests/csp.test.ts` fails if the two drift apart. No full standard conformance or security certification is claimed.

## Deployment

The repository includes CI and a GitHub Pages workflow. See [Deployment](docs/DEPLOYMENT.md). The workflow publishes the landing page, abstract, examples, and workbench together. Project paths are derived from GitHub Pages configuration; local development uses `/`.

## Project structure and extension

- `src/x3d`, `src/diff`, `src/report`: parsing, comparison, report schema and export.
- `src/viewer`: X3D preview, geometry analysis and motion sampling.
- `src/app`: shared stage, difference cards, selection, settings and analysis controls.
- `src/site`: public landing-page styles.
- `public/examples`, `fixtures`, `tests`: demonstrations and validation inputs.
- `docs`: user guide, [X3D coverage](docs/X3D_COVERAGE.md) (the documented analysis boundary), report format, extension and deployment notes.
- `scripts`: asset preparation, catalog regeneration, scene generators, and benchmarking.

See [Extending X3Diff](docs/EXTENDING.md). To regenerate the catalog, run `npm run catalog`; offline source paths are supported by `scripts/build-catalog.ts`. The Brickhaven and industrial example generators are in `scripts/`. Keep generators and validation fixtures with source releases.

## License

MIT. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md), and [Web3D license](licenses/Web3D-license.txt). Dependency and example license texts are bundled in the built site under `vendor/licenses/`.
