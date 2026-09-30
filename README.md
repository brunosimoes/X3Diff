# X3Diff

**Understand the change. Decide with evidence.**

X3Diff is a browser-based workbench for comparing XML-encoded X3D 3.3 scenes. It connects a deterministic semantic report to interactive geometry inspection, helping reviewers understand human-authored or AI-assisted edits before accepting them. It supports review decisions; it does not implement an automatic approval or merge gate.

[Website and abstract](https://brunosimoes.github.io/X3Diff/) · [Open the workbench](https://brunosimoes.github.io/X3Diff/app.html) · [Project abstract](docs/ABSTRACT.md) · [User guide](docs/USER_GUIDE.md)

## Review a revision

Load files through the icons inside **Before** and **After**, or choose an example. Comparison starts automatically when both inputs exist. Select a difference to highlight the corresponding object in the main overlay.

| Analysis view      | Question it helps answer                                       |
| ------------------ | -------------------------------------------------------------- |
| File differences        | Which supported declarations and values changed?               |
| Slice & measure    | How do the cross-sections differ at this position?             |
| Surface deviation  | Where are sampled distances between the surfaces larger?       |
| Volume differences | What is before-only, shared, or after-only for a matched pair? |

Geometry views appear only when supported changed pairs are available. **Customize** controls tab order and visibility. The app remembers tab choices, region, resolution, theme, and layout. A single available object is shown as text; multiple objects use a selector. Surface scales and statistics are embedded in their interactive views. **Export** downloads the semantic JSON report; exploratory geometry measurements are separate.

## Run and validate

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

The root URL is the project website. Open `/app.html` for the workbench.

```sh
npm run check         # TypeScript, unit/regression tests, production build
npm run test:browser  # Interactive browser checks
npm run preview      # Serve the generated dist directory
npm run benchmark    # Local comparison timings
```

Browser tests use Edge on Windows. On Linux, install Chromium with `npx playwright install --with-deps chromium`. Tests cover typed parsing and comparison, golden reports, geometry, input limits, hostile-input handling, cancellation, linked selection, tab customization, and example scenes.

`npm run build` creates a static multipage site in `dist/`. Renderer assets and license notices are copied from pinned dependencies during dev/build; `public/vendor/` is generated and ignored. No application server, AI service, account, or model-upload endpoint is required. A modern browser with WebGL is needed for interactive views.

## Supported scope

The semantic catalog is generated from official X3DUOM 3.3 and X3D 3.3 XSD sources with pinned hashes. It covers 34 common nodes and supported typed fields, defaults, DEF/USE, ROUTE declarations, metadata, and profile context. The exact catalog and supported field types are included in each report. Catalog membership does not imply evaluation of external content or runtime behavior.

Default tolerances are absolute/relative floats `1e-6`, vector distance `1e-5`, rotation angle `1e-5` radians, and color-channel difference `1e-4`. Coordinate points are compared by index when arrays have equal length. Point tolerance is configurable in Settings. Unknown nodes, unsupported fields, ambiguous matches, and version boundaries produce diagnostics or incomplete results. No-change results are meaningful only within the declared supported scope.

Geometric inspection supports direct Box, Sphere, closed Cylinder, and bounded convex IndexedFaceSet geometry under supported Group/Transform placement. Sections and distances use static world coordinates without registration or physical-unit conversion. Surface distances sample triangle centres and can miss extremes; Volume differences examines one matched pair: tessellated CSG for supported primitives or a bounded occupancy-grid approximation for supported meshes. It is not whole-assembly collision analysis or certified metrology.

Before/After views demonstrate native TimeSensor, interpolator, and ROUTE animation. The comparison describes declarations, not runtime motion. PROTO/EXTERNPROTO, scene scripts, external Inline/media resources, arbitrary shaders, and the full X3D standard are outside the supported analysis boundary.

## Privacy and input handling

User files are read in the browser. Parsing rejects entity declarations and internal DTD subsets; external DOCTYPE declarations are not resolved. Limits include 20 MiB, 50,000 node elements, five million numeric tokens, and 256 XML nesting levels per side. Preview sanitization removes scripts, prototypes, external scenes, and URL-bearing media. The exported report contains input-derived data: share it deliberately.

The site includes a meta CSP. `public/_headers` also supplies response headers for hosts that support that format; GitHub Pages does not apply this file as custom headers. No full standard conformance or security certification is claimed.

## Deployment

The repository includes CI and a GitHub Pages workflow. See [Deployment](docs/DEPLOYMENT.md). The workflow publishes the landing page, abstract, examples, and workbench together. Project paths are derived from GitHub Pages configuration; local development uses `/`.

## Project structure and extension

- `src/x3d`, `src/diff`, `src/report`: parsing, comparison, report schema and export.
- `src/viewer`: X3D preview and geometry analysis.
- `src/app`: workbench UI and configurable analysis-tab registry.
- `src/site`: public landing-page styles.
- `public/examples`, `fixtures`, `tests`: demonstrations and validation inputs.
- `scripts`: asset preparation, catalog regeneration, scene generators, and benchmarking.

See [Extending X3Diff](docs/EXTENDING.md). To regenerate the catalog, run `npm run catalog`; offline source paths are supported by `scripts/build-catalog.ts`. The Brickhaven and industrial example generators are in `scripts/`. Keep generators and validation fixtures with source releases.

## License

MIT. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md), and [Web3D license](licenses/Web3D-license.txt). Dependency and example license texts are bundled in the built site under `vendor/licenses/`.
