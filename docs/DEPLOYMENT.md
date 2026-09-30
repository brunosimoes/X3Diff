# GitHub Pages deployment

The landing page is at `/X3Diff/`; the interactive workbench is at `/X3Diff/app.html`. Both are built by Vite. Example links support `?example=example`, `dolphin`, `fitlab`, `brickhaven`, and `forgeworks`.

## Publish

1. Put this project at the root of `brunosimoes/X3Diff`.
2. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
3. Push to `main`, or run **Publish X3Diff** from Actions.

The workflow runs type checking, unit tests, browser tests, and a production build before deploying. The Pages environment exposes the final URL. Repository settings may require an administrator to enable Pages or approve the environment.

## Build paths

The workflow reads `base_path` from `actions/configure-pages` and passes it as `PAGES_BASE_PATH`, with a trailing slash. This handles repository URLs and custom domains. Local development defaults to `/`.

For a local project-path check in PowerShell:

```powershell
$env:PAGES_BASE_PATH = '/X3Diff/'
npm run build
npm run preview -- --port 4176
# Open http://localhost:4176/X3Diff/
Remove-Item Env:PAGES_BASE_PATH
```

The website uses no client-side route fallback: `index.html` and `app.html` are real entry files. All renderer assets, workers, and examples must be served from the same built directory. Never publish `node_modules`, test output, or local credentials.

GitHub Pages serves static files and does not honor the `_headers` convention used by some other hosts. The HTML includes a meta CSP; stronger response-header controls require a host that supports them.
