# Extending X3Diff

## Add a node type to the comparison

The catalog in `src/x3d/catalog.ts` is generated; do not edit it by hand.

1. Add the node name to `selected` in `scripts/build-catalog.ts` and run `npm run catalog`. The generator reads the official X3DUOM 3.3, the X3D 3.3 XSD and the X3DUOM 4.0 (pinned by SHA-256; pass `--model`, `--schema` and `--model40` with local copies to work offline). It takes every field of the node with its type and default, checks each default against 4.0 and records one that changed as `default40`. A field that only X3D 4.0 has is compared only when it is listed in `additions40`; otherwise it is diagnosed as not compared. Correct a known error of the published model in `errata`, with the clause of the specification.
2. Give the node a category and change kind in `category()` in `src/diff/compare.ts`, and the category and its fields reader-facing names in `src/app/changeRegister.ts` (`categoryNames`, `fieldNames`).
3. Check how the previews treat it: `src/viewer/sanitize.ts` passes every catalogued node to the renderer, and `src/viewer/diffScene.ts` lists the nodes left out of the Differences overlay.
4. Add unit tests for defaults, tolerances and DEF/USE (`tests/lights.test.ts` is a model), update the node count in `tests/catalogNodes.test.ts`, regenerate the golden reports in `fixtures/golden/` (their `catalog.supportedNodes` list changes), and update the number of node types in `README.md`, `docs/USER_GUIDE.md`, `docs/ABSTRACT.md`, `docs/X3D_COVERAGE.md` and the abstract in `index.html`.

## Add a view

`src/app/analysisTabs.ts` exports `AnalysisTabs` and `AnalysisTab`. The registry handles navigation, ARIA state, ordering, preferences, availability filtering and activation errors. Each module owns its data, content and computation.

Add a panel inside `.analysis-panel` and register it in `src/app/main.ts`:

```ts
analysisTabs.register({
  id: 'validation',
  label: 'Validation',
  description: 'Explain input diagnostics and supported features.',
  panel: validationElement,
  available: () => validationModel.hasData,
  activate: () => validationView.show(validationModel),
  deactivate: () => validationView.pause(),
});
```

Use a unique lowercase ID. Keep `available()` cheap and side-effect-free: prepare module data during the comparison lifecycle, then call `analysisTabs.refresh()` after the workspace is visible. A new registered tab automatically appears in Customize when data is available. `required: true` prevents hiding a baseline view. Registration is local source-code composition, not a remote plugin loader. `src/app/motionAnalysis.ts` (the Motion paths tab) is an example of a self-contained view: it owns its data, renderer and controls, and is wired in `main.ts` by one `register` call plus `load` and `clear`.

`activate()` may be synchronous or return a Promise. An activation failure displays an error without disabling the other tabs. Stale activation errors are ignored after navigation. Modules remain responsible for cancelling their own asynchronous work and releasing resources. The linked view allocates its WebGL renderer on first activation, renders on interaction/resize, and disposes replaced geometry on comparison changes; switching tabs preserves its ruler and camera.
