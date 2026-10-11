# GitHub Pages deployment

The landing page is at `/X3Diff/`; the interactive workbench is at `/X3Diff/app.html`; the list of compared node types is at `/X3Diff/coverage.html`. All three are built by Vite, and `vite.config.ts` writes the node list and its count into `coverage.html` from the catalog. Example links support `?example=example`, `dolphin`, `fitlab`, `brickhaven`, and `forgeworks`; an unknown name opens the Dolphin. Add `&view=` with `differences`, `sections`, `volume`, `deviation` or `motion` to open that analysis view, for example `app.html?example=brickhaven&view=motion`; a view that is unknown or not available for the pair leaves the usual tab open. The link-preview tags in `index.html` (`og:url`, `og:image`) hold the absolute address of the published site: change them if the site moves.

## Publish

1. Put this project at the root of `brunosimoes/X3Diff`.
2. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
3. Push to `main`, or run **Publish X3Diff** from Actions.

The workflow first calls the CI workflow (`ci.yml`: type checking, unit tests, browser tests, the production-build preview test and `npm audit --omit=dev`) and builds for publishing only if it passes, so each push to `main` runs the tests once. Other branches and pull requests run `ci.yml` on its own. The Pages environment exposes the final URL. Repository settings may require an administrator to enable Pages or approve the environment.

## Build paths

The workflow reads `base_path` from `actions/configure-pages` and passes it as `PAGES_BASE_PATH`, with a trailing slash. This handles repository URLs and custom domains. Local development defaults to `/`.

`npm run test:preview` builds and tests `/X3Diff/` by default, including the worker, renderer, examples, video playback and the report downloads. Set `PAGES_BASE_PATH` to another path with a trailing slash to test a different deployment location. The production suite runs every UI spec except the two that import development source modules; those remain in `npm run test:browser`.

For a local project-path check in PowerShell:

```powershell
$env:PAGES_BASE_PATH = '/X3Diff/'
npm run build
npm run preview -- --port 4176
# Open http://localhost:4176/X3Diff/
Remove-Item Env:PAGES_BASE_PATH
```

The website uses no client-side route fallback: `index.html`, `app.html` and `coverage.html` are real entry files. All renderer assets, workers, and examples must be served from the same built directory. Never publish `node_modules`, test output, or local credentials.

GitHub Pages serves static files and does not honor the `_headers` convention used by some other hosts. The HTML includes a meta CSP; stronger response-header controls require a host that supports them.
