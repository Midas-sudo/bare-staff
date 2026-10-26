# AGENTS.md — Bare Staff

Instructions for AI agents working in this repository. Read this before editing code. This file is auto-loaded into agent sessions, so treat it as the authoritative project brief and keep it accurate.

## What this project is

**Bare Staff** is a Node/Express web app that takes a Songsterr tab URL and returns a **temporary** (60 min), chrome-free page showing just the tablature. It is a personal side project, not a scraping service.

- Tech stack: Node.js ≥18, ESM (`"type": "module"`), Express 4, Playwright (Chromium). No database, no framework, no build step.
- Human docs live in [`README.md`](./README.md). This file is the agent-facing brief.

## ⚠️ Standing rule: keep docs in sync

**Every code change must be reflected in the documentation.** When you add, move, rename, delete, or change behavior of any file, API, env var, selector, or dependency:

1. Update the relevant section of [`README.md`](./README.md) (architecture, project layout, API table, config table, limitations — whichever changed).
2. If this brief's facts changed, update this file too.
3. Prefer the `/docs-update` command after your changes: it walks the source and refreshes both docs.

If you are unsure whether a doc section is affected, update it. Stale docs are a bug here.

## Architecture

Request flow (all in `src/`):

```
POST /extract  ─▶ parseUrl.js   validate URL, extract songId + instrumentHint
                ─▶ extractPage.js  Playwright renders page, harvests staff-line SVGs
                ─▶ store.js      save sheet in-memory, get UUID
                ─▶ 302 /sheet/<id>

GET  /sheet/:id ─▶ store.js      look up by id (404 if gone/expired)
                ─▶ render/sheetHtml.js  inject into clean template

GET  /, /styles.css, /sheet.js  ─▶ express.static(public/)
```

### Modules

| File | Role | Edit here when… |
|---|---|---|
| `src/server.js` | Express app, routes, static serving, `PORT`/`HOST` | Adding routes, changing redirect/error behavior |
| `src/store.js` | In-memory `Map` store, UUID ids, 60-min TTL, `prune()` | Changing TTL, storage backend, cleanup policy |
| `src/songsterr/parseUrl.js` | URL validation, `songId` + `instrumentHint` extraction | Changing supported URL formats or instrument detection |
| `src/songsterr/extractPage.js` | Playwright lifecycle + DOM harvesting, error mapping | Changing selectors, browser launch, extraction logic |
| `src/songsterr/client.js` | **UNUSED** Songsterr JSON-API client (`fetchMeta`/`fetchPart`/`extractSong`) | Do not wire this in without intent; it's not used by `server.js` |
| `src/render/sheetHtml.js` | HTML templates + escaping | Changing the sheet/error page markup |
| `public/index.html` | Landing page form + history container | Changing the home UI |
| `public/history.js` | Records the source URL from the sheet page's `<data>` element into `localStorage`, renders clickable history chips on home | Changing home history behavior |
| `public/sheet.js` | Pages / horizontal-scroll toggle (client-side) | Changing sheet interaction |
| `public/styles.css` | Design tokens + all styling, print rules | Changing visuals |
| `Dockerfile` / `docker-compose.yml` | Container build/run | Changing base image, ports, browser env |

### Key implementation details (don't regress these)

- **Browser reuse:** `extractPage.js` keeps one shared Chromium (`browserPromise`) across requests and relaunches on disconnect. Don't launch a new browser per request.
- **Lazy loading:** harvesting scrolls to the bottom in a stability loop (50 iterations, `stable >= 5` to stop) so infinitely-scrolling lines get captured.
- **Chrome removal:** interactive elements are stripped by selector in `CHROME_SELECTOR` (bar-dots, playhead, buttons) both in-browser (`page.evaluate`) and via `sanitizeSheetHtml` on the returned HTML.
- **Asset URLs:** relative `static3/` links are rewritten to `https://www.songsterr.com/static3/` via `rewriteAssetUrls`, otherwise the SVG styling breaks on the standalone page.
- **Friendly errors:** low-level Playwright/timeout/close errors are mapped to user-facing messages before re-throwing. `server.js` surfaces them through `?error=` on the landing page.
- **TTL:** `TTL_MS = 3_600_000` (60 min). `prune()` runs on every `saveSheet`/`getSheet`.
- **Escaping:** `render/sheetHtml.js` `escapeHtml` escapes `& < > "` — any new interpolated value must go through it.
- **History:** `public/history.js` stores source URLs in `localStorage` (most-recent-first, capped at 25) and renders clickable chips on the home page. The home form submits normally (no `fetch`); the server embeds the original Songsterr URL in the sheet page as `<data id="bare-staff-source" value="…">` (see `render/sheetHtml.js`). `history.js` records that URL when the sheet page loads — its presence is the definitive success signal, so failed extracts (which never render a sheet page) are never recorded. Do not reintroduce a `redirect: "manual"` fetch to read a `Location` header; opaque redirects make that impossible.

## Docker specifics

- Base image `mcr.microsoft.com/playwright:v1.62.1-noble` ships a pre-bundled Chromium.
- `PLAYWRIGHT_BUNDLED=1` + `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` are set; `extractPage.js` then uses container-safe launch args (`--no-sandbox`, `--disable-dev-shm-usage`, …).
- `docker-compose.yml` sets `shm_size: 1gb` and `seccomp:unconfined` — Chromium needs these.
- **Version coupling:** the base image Playwright version must match the resolved version in `package-lock.json`. Bump both together when upgrading Playwright.

## Running & verifying

No need to run it, ask user to validate unless he gives direct testing instructions

## Conventions

- ES modules only; use `import`, not `require`.
- No new dependencies without updating `package.json`/`package-lock.json` **and** noting the Docker version coupling.
- Keep error messages user-facing and specific (see existing patterns).
- Don't commit `node_modules/` (already `.gitignore`d). The stray `*.html` + `*_files/` capture in the repo root is example output — safe to remove, not part of the app.

## Files that are not part of the app

- `BIRDS Drum Tab by Turnstile _ Songsterr Tabs with Rhythm.html` and its `_files/` folder — a manual browser capture of one tab, used as a reference/example. Not loaded or served by the app.
