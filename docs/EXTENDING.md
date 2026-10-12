# Extending X3Diff

## Add a node type

The catalog in `src/x3d/catalog.ts` is generated; do not edit it by hand.

1. Add the node name to `selected` in `scripts/build-catalog.ts` and run `npm run catalog`. The generator reads official X3DUOM 3.3, X3D 3.3 XSD and X3DUOM 4.0 sources pinned by SHA-256. Pass `--model`, `--schema` and `--model40` for offline copies. Version-specific defaults and fields are recorded explicitly.
2. Give the node a category and change kind in `src/diff/compare.ts`, and reader-facing category and field names in `src/report/presentation.ts`.
3. Check preview sanitization in `src/viewer/sanitize.ts`, overlay classification in `src/app/calmScene.ts`, and whether geometry or motion analysis supports the node.
4. Add tests for defaults, tolerances and DEF/USE. Update catalog counts and golden report fixtures, then align the public coverage documentation and abstract. `coverage.html` gets its node list and count from the catalog during serving and building.

## Add an analysis view

`src/app/ui.ts` defines `Tab` and `Workbench`. Every module draws on one stage and uses the shared side panel, controls, selection and settings. Add the module to the tab list in `src/app/main.ts`.

```ts
export function validationTab(wb: Workbench): Tab {
  return {
    id: 'validation',
    label: 'Validation',
    available: () => wb.report.diagnostics.length > 0,
    async show(alive) {
      wb.side.replaceChildren(make('h2', '', 'Validation'));
      const result = await prepareValidation(wb.report);
      if (!alive()) return;
      wb.side.append(renderValidation(result));
    },
  };
}
```

Use a unique lowercase ID and a cheap, side-effect-free `available()`. `show(alive)` receives a predicate that becomes false when navigation, theme or comparison changes supersede it. Check it before applying asynchronous results. View errors appear on the stage without disabling other tabs.

Use `hide()` to stop playback and `dispose()` to release resources when the comparison is replaced. Allocate expensive renderers on demand and dispose replaced geometry. `facts()` optionally returns printable measurements with their scope and limits. The geometry and motion modules provide examples.

`wb.selection` carries declaration records, supported pair paths and an optional animated-object name. Preserve an existing analysis object when a selection is ambiguous or unsupported, and explain that choice in the panel. `wb.volumeResolution` and `wb.setVolumeResolution()` share the saved setting with Settings. All input-derived names and strings must be rendered as text, not HTML.
