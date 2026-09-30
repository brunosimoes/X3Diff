# Extending X3Diff

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

Use a unique lowercase ID. Keep `available()` cheap and side-effect-free: prepare module data during the comparison lifecycle, then call `analysisTabs.refresh()` after the workspace is visible. A new registered tab automatically appears in Customize when data is available. `required: true` prevents hiding a baseline view. Registration is local source-code composition, not a remote plugin loader.

`activate()` may be synchronous or return a Promise. An activation failure displays an error without disabling the other tabs. Stale activation errors are ignored after navigation. Modules remain responsible for cancelling their own asynchronous work and releasing resources. The linked view allocates its WebGL renderer on first activation, renders on interaction/resize, and disposes replaced geometry on comparison changes; switching tabs preserves its ruler and camera.
