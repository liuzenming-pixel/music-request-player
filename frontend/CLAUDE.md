# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server (proxies /api → http://39.105.51.114:5123)
pnpm build      # production build → dist/
pnpm preview    # preview the production build locally
```

No test runner or linter is configured.

## Architecture

A **Vite** project with **two entry points** (`rollupOptions.input` in `vite.config.ts`), built together by `pnpm build` into `dist/`:

| Page | HTML | Entry | CSS | Stack | Purpose |
|------|------|-------|-----|-------|---------|
| Request | `request.html` | `src/request.ts` | `src/request.css` | **vanilla TS** | Song search & queue management |
| Player | `player.html` | `src/player.tsx` | (lib CSS) | **React 19 + AMLL** | Big-screen player + lyrics |

Most of the codebase is framework-free vanilla TS; only the player page uses React (via `@vitejs/plugin-react`). `src/utils.ts` holds `esc()` (HTML escaping) and `fmt()` (seconds → `m:ss`), used by the request page.

Both pages are consumed by the Flask backend: `pnpm build` → copy `dist/*` into `services/backend/player-dist/`, then the backend serves `request.html` at `/request` and `player.html` at `/play`. See `README.md` for the whole system.

### Player page (`src/player.tsx`)

- React app mounting AMLL's official **`PrebuiltLyricPlayer`** — the Apple-Music-style UI with animated background + lyrics.
- Driven imperatively via a jotai `createStore()`: data atoms (`musicNameAtom`, `musicCoverAtom`, `musicPlayingPositionAtom`, `musicLyricLinesAtom`, …) fed from an `<audio>` element + `/api/*`; callback atoms (`onPlayOrResumeAtom`, `onRequestNextSongAtom`, …) wire UI controls back to the audio. `isLyricPageOpenedAtom` **must be `true`** or lyrics won't scroll.
- **AMLL is built from VENDORED SOURCE, not the npm package** (`../vendor-amll/`, aliased in `vite.config.ts`). The published `react-full@0.4.1` and the tsdown-built dist both render wrong (size/blur) and make the active lyric **drift downward**; building from `src` fixes it. See `../vendor-amll/README.md` (vendor lives outside the Vite root so svgr can compile `.svg?react`; a `node_modules` junction resolves its deps; `dedupe: ['react','react-dom','jotai']` is required or hooks throw `useContext of null`).
- **Feeding playback position: only on `timeupdate`/`seeked`/`play`, NOT every `requestAnimationFrame`.** AMLL interpolates between updates internally; feeding raw `au.currentTime` every frame fights that and makes lyrics jump back and forth.
- Lyric font size via `lyricSizePresetAtom` (default `Medium`; `?size=small|medium|large|extra-large|huge` URL param overrides). Never override `font-size` on the lyric element with `!important`.
- **Advancing the queue goes through `advance()` — a single mutex-guarded path that `await`s `markPlayed` BEFORE `loadNext()`.** Firing them concurrently races: if `/api/queue/next` reaches the server before `/api/queue/mark-played`, the current song is still at the head → it replays. Next-button / `ended` / `error` / unplayable-skip / idle-poll all call `advance()`.
- The 收藏 (Star) button is injected into AMLL's DOM via a `MutationObserver` (`ensureStar`). PrebuiltLyricPlayer renders **two `musicInfo` containers** (full + compact/lyrics-closed), CSS-toggled — a star must be inserted into **each** (own React root, deduped via `WeakSet`) or it vanishes when switching layouts.
- Lyrics: `/api/lyric` returns `yrc` (`parseYrc`) when available, else `lrc` (`parseLrc`); translation/roman merged by nearest timestamp.
- The old no-build esm.sh player (`services/backend/templates/player.html`) is unused/superseded.

### Request page (`src/request.ts`)

- Single mobile-style layout: a search panel (`#center-col`) and a queue panel (`#right-col`) shown one at a time, switched by the bottom tab bar `#mobile-tabs` (toggles each column's `.tab-active` class and slides `#tab-indicator`). There is no wide/three-column desktop layout — that was removed; do not reintroduce desktop-only columns.
- Renders a `BackgroundRender` (PixiJS) animated background seeded with a static indigo SVG gradient.
- Queue is polled from `/api/queue` every 5 seconds. Queue actions (add/remove/move-to-top) call the backend then immediately re-poll.
- Search history is persisted in `localStorage` under key `reqSearchHist` (max 10 entries). The landing view (search history + hot-search list) is rendered when the input is empty/focused.

### Backend API (proxy)

All `/api/*` calls are proxied to the backend in dev (`vite.config.ts`). Key endpoints:

- `GET  /api/queue/next` — next queued song (includes `playUrl` when available)
- `POST /api/queue/mark-played` — `{ id }` — advance queue
- `GET  /api/queue` — full queue state (`data.requests[]`)
- `POST /api/queue/add` — `{ id, name, artist, picUrl }`
- `POST /api/queue/remove` — `{ id }`
- `POST /api/queue/move` — `{ id, direction: 'top' }`
- `GET  /api/song/url?id=&level=excellent` — playback URL
- `GET  /api/lyric?id=` — LRC + translation lyrics
- `GET  /api/search?keyword=&limit=` — song search
- `GET  /api/search/hot` — hot search terms
- `GET  /api/login/qr/key` / `/api/login/qr/create` / `/api/login/qr/check`
- `GET  /api/login/status`
- `POST /api/song/like` — `{ id, like: boolean }`
- `GET  /api/song/like/check?id=`

### Event handlers in generated HTML

Because there is no framework, the UI is built by assigning `innerHTML` from template-literal strings. Two patterns coexist:

- **Inline `onclick="window.*"`** — handlers are attached via `window.*` assignments (e.g., `window.addToQueue`, `window.moveTop`, `window.removeSong`, `window.showLogin`) and referenced from the generated markup. Used for the search results and queue items.
- **Delegated `data-*` listeners** — the landing view (search history + hot search) attaches a single delegated click listener on `#search-results` that reads `data-keyword`, so no per-item JS string is interpolated. Prefer this pattern for new interactive lists; it sidesteps the escaping pitfalls below.

### HTML escaping

`esc(s)` (from `src/utils.ts`) must wrap any user-supplied or API-returned string interpolated into an HTML template literal — including values placed inside `data-*`/attribute contexts that feed inline `onclick` handlers — to prevent XSS. It escapes single quotes too, which is why it is safe inside single-quoted attributes.
