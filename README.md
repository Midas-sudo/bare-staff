# Bare Staff — Music Sheet Downloader

Bare Staff strips the UI chrome off a [Songsterr](https://www.songsterr.com) tab and shows you just the tablature on a clean, print-ready page. You paste a Songsterr URL; it returns a **temporary** link to a sheet page with nothing but the music.

- No accounts, no downloads to disk — sheets live in memory for one hour, then self-delete.
- No backend scraping API — it drives a real headless Chromium to render the page exactly as you'd see it, then harvests the rendered staff lines.
- Works for guitar, bass, drums, piano, and vocal tabs.

---

## Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [HTTP API](#http-api)
- [Configuration](#configuration)
- [Running in Docker](#running-in-docker)
- [Limitations & legal](#limitations--legal)
- [For AI agents](#for-ai-agents)

---

## Quick start

### Requirements

- Node.js **18 or newer** (the `engines` field requires `>=18`).
- A browser for extraction:
  - Locally: Google Chrome installed (the server tries the Chrome channel first), **or** run `npx playwright install chromium` to bundle Chromium.
  - In Docker: the base image ships a pre-bundled Chromium (see below).

### Install & run locally

```bash
npm install            # installs express + playwright
npm run dev            # node --watch src/server.js  (hot reload)
# or
npm start              # node src/server.js
```

The server starts on `http://localhost:3000` (override with `PORT` / `HOST`, see [Configuration](#configuration)).

Open the page, paste a Songsterr URL like:

```
https://www.songsterr.com/a/wsa/turnstile-birds-guitar-tab
```

Click **Extract**. On success you're redirected to `/sheet/<id>`; the link works for 60 minutes.

### Run with Docker

```bash
docker compose up --build
```

This builds the `bare-staff:local` image and serves on `http://localhost:3000`.

---

## How it works

A single request flows through four stages:

1. **Parse** — `src/songsterr/parseUrl.js` validates the URL is a Songsterr tab and extracts a numeric `songId` plus an optional `instrumentHint` (drum/bass/piano/vocal/guitar) detected from the path.
2. **Extract** — `src/songsterr/extractPage.js` launches a headless Chromium (via Playwright), loads the page, waits for the tablature SVG to render, then **scrolls** the page to lazily load every staff line. It clones each line group, deletes the interactive "chrome" elements (bar-dots, playhead, buttons), rewrites relative `static3/` asset URLs to absolute Songsterr URLs, and sanitizes the HTML.
3. **Store** — `src/store.js` saves the extracted sheet in an in-memory `Map` keyed by a UUID, stamped with a creation time for the 60-minute TTL.
4. **Render** — `src/render/sheetHtml.js` injects the sheet HTML + the original Songsterr CSS into a clean template and serves it at `/sheet/<id>`.

The browser is kept alive between requests as a single shared instance (re-launched automatically if it disconnects), so extraction is fast after the first cold start.

### Front-end sheet behavior

The rendered sheet page (`public/sheet.js`) offers a **Pages** toggle. When on, it packs the linear staff lines into discrete, horizontally-scrollable pages sized to the container width (persisted in `localStorage`). Off, the sheet scrolls vertically as usual. Print styles (`styles.css`) flatten everything to a single vertical page.

### Home-page history

The landing page remembers your last **successful** extractions. On success the server embeds the original Songsterr URL into the sheet page (`src/render/sheetHtml.js` renders a `<data id="bare-staff-source" value="…">` element), and `public/history.js` records that URL when the sheet page loads — its presence is the definitive "this extraction succeeded" signal. `history.js` stores each URL in `localStorage` (most-recent-first, capped at 25) and renders them as clickable chips under the form on the home page; clicking a chip re-fills the input and re-extracts. Because a failed extract never renders a sheet page, nothing is recorded on failure. Storage is per-browser and persists across restarts.

> Note: `src/songsterr/client.js` is a **separate, currently-unused** Songsterr REST-path client (`fetchMeta` / `fetchPart` / `extractSong`). The live server does **not** import it. It exists as an alternative extraction approach and is not wired into `server.js`.

---

## Project layout

```
music-sheetdownloader/
├── src/
│   ├── server.js              # Express app: routes, static serving, entry point
│   ├── store.js               # In-memory sheet store with 60-min TTL
│   ├── songsterr/
│   │   ├── parseUrl.js        # Validate Songsterr URL → { songId, instrumentHint, url }
│   │   ├── extractPage.js     # Playwright: render + harvest the sheet HTML
│   │   └── client.js          # (unused) Songsterr JSON API client
│   └── render/
│       └── sheetHtml.js       # Templates for the sheet page and the "expired" error page
├── public/
│   ├── index.html             # Landing page with the URL form + history container
│   ├── history.js             # Client-side history of successful URLs (localStorage)
│   ├── sheet.js               # Pages / horizontal-scroll toggle logic
│   └── styles.css             # Styles for home + sheet pages, plus print rules
├── Dockerfile                 # Playwright base image, bundled Chromium
├── docker-compose.yml         # Port 3000, 1GB shm, seccomp-unconfined
├── package.json
└── README.md
```

### Key modules

| File | Responsibility |
|---|---|
| `src/server.js` | Express server. Serves `public/`, defines `/extract` (POST) and `/sheet/:id` (GET), reads `PORT`/`HOST`. |
| `src/store.js` | `saveSheet(data)` → UUID; `getSheet(id)` → entry or `null`. Prunes expired entries on each access. TTL = 3,600,000 ms. |
| `src/songsterr/parseUrl.js` | URL validation and id/instrument extraction. Throws descriptive errors for bad input. |
| `src/songsterr/extractPage.js` | Playwright browser lifecycle + DOM harvesting. Maps low-level failures to friendly messages. |
| `src/songsterr/client.js` | **Not used by the server.** Songsterr meta/part JSON client + track-picking helpers. |
| `src/render/sheetHtml.js` | HTML templating with escaping. `renderSheetPage(entry)` embeds the source Songsterr URL in a `<data>` element; `renderErrorPage(message)` for expired sheets. |
| `public/history.js` | Records the source URL from the sheet page's `<data>` element into `localStorage`, and renders clickable "Recent extractions" chips on the home page. |
| `public/sheet.js` | Client-side page packing + horizontal-scroll toggle. |
| `public/styles.css` | Design tokens (`:root` vars), home + sheet styling, responsive + print media queries. |

---

## HTTP API

### `POST /extract`

Request body (`application/x-www-form-urlencoded`):

| Field | Type | Description |
|---|---|---|
| `url` | string | A Songsterr tab URL. Required. |

Behavior:

- On success: parses the URL, extracts the sheet, stores it, and responds with a `302` redirect to `/sheet/<id>`.
- On failure: responds with a `302` redirect back to `/` with an `?error=<message>` query param. The landing page displays the message.

### `GET /sheet/:id`

- On success: `200` with the rendered sheet page (`text/html`).
- If the sheet has expired or never existed: `404` with an "expired" error page.

### Static files

`public/` is served statically, so `/` serves `index.html`, and `/styles.css`, `/sheet.js`, `/history.js` are available.

---

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port to listen on. |
| `HOST` | `0.0.0.0` | Interface to bind. |
| `NODE_ENV` | — | Set to `production` in Docker. |
| `PLAYWRIGHT_BUNDLED` | — | `"1"` in Docker tells `extractPage.js` to use the bundled Chromium with container-safe launch args (see below). |

### Playwright launch behavior (`extractPage.js`)

- If `PLAYWRIGHT_BUNDLED=1`: launches bundled Chromium with container args (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--disable-software-rasterizer`).
- Otherwise: tries the system **Chrome** channel first; falls back to bundled Chromium with default args.

---

## Running in Docker

The `Dockerfile` is based on `mcr.microsoft.com/playwright:v1.62.1-noble`, which already contains a Chromium build. It sets:

- `PLAYWRIGHT_BUNDLED=1` — use the bundled browser with container args.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — don't try to download a browser (it's pre-baked).

`docker-compose.yml` maps port `3000`, sets `shm_size: 1gb` (Chromium needs a decent `/dev/shm`), enables `seccomp:unconfined`, and restarts unless stopped.

**When upgrading Playwright**, the Docker base image version (`v1.62.1`) must match the resolved Playwright version in `package-lock.json`, or the bundled browser APIs can drift. Bump both together.

---

## Limitations & legal

- **Temporary only.** Sheets are held in RAM for 60 minutes and are never written to disk. Sharing a `/sheet/<id>` link after that window returns 404.
- **Songsterr-dependent.** Extraction depends on Songsterr's current DOM structure (selectors like `#tablature`, `svg[data-testid^="multitrack-line-group"]`, `.gYbqeG_instrument`). If Songsterr changes its markup, harvest selectors in `extractPage.js` / `sheet.js` will need updating.
- **Rate limits.** Songsterr may return `403`/`429`; the client surfaces a friendly retry message.
- **Copyright.** Tabs are Songsterr's/licensed content. Bare Staff surfaces a page for an individual tab you've already accessed; do not use it to bulk-scrape or redistribute content.
- **Single browser instance.** One shared Chromium serves all requests; a crash during one extraction is contained (the context is closed in `finally`) and the browser relaunches for the next request.

---

## For AI agents

See [`AGENTS.md`](./AGENTS.md) — it describes the architecture, conventions, and the rule that **any code change must be reflected in this README**. After editing source, run the `/docs-update` command (or manually update the relevant sections) so the docs stay in sync.
