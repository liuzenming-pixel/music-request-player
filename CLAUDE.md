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

This is a **vanilla TypeScript + Vite** project — no framework (no React/Vue). It has two separate pages built as a multi-entry Vite app:

| Page | HTML | TS | CSS | Purpose |
|------|------|----|-----|---------|
| Player | `index.html` | `src/main.ts` | `src/style.css` | Music playback, lyrics, login |
| Request | `request.html` | `src/request.ts` | `src/request.css` | Song search & queue management |

### Player page (`src/main.ts`)

- Renders an `<audio>` element, playback controls, progress/volume bars, and cover art.
- Uses **`@applemusic-like-lyrics/core`** (`LyricPlayer`) for animated Apple-Music-style lyrics. The lyrics player must be driven every frame via `requestAnimationFrame` → `lyricPlayer.setCurrentTime()` + `lyricPlayer.update()`.
- Uses **`BackgroundRender` (PixiJS)** for a fluid animated background derived from the album cover (`bgRender.setAlbum(url)`).
- On startup, fetches `/api/queue/next` to get the first song, then calls `/api/song/url` for the playback URL if not already included.
- `markPlayed(id)` must be POSTed before loading the next song so the backend advances the queue.
- NetEase QR-code login flow: `getQR()` → polls `/api/login/qr/check` every 2 s → on success code 803, calls `updateLoginStatus()`.

### Request page (`src/request.ts`)

- Three-column layout (hot search sidebar, search center, queue right panel) that collapses to a two-tab mobile layout (`#mobile-tabs`) at `< 720 px`.
- Queue is polled from `/api/queue` every 5 seconds. Queue actions (add/remove/move-to-top) call the backend then immediately re-poll.
- Search history is persisted in `localStorage` under key `reqSearchHist` (max 10 entries).

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

### Inline event handlers

Because there is no framework, many event handlers in dynamically generated HTML strings are attached via `window.*` assignments (e.g., `window.addToQueue`, `window.moveTop`, `window.showLogin`). When adding new interactive elements to generated HTML, follow this pattern.

### HTML escaping

The `esc(s)` helper (defined in both source files) must be used whenever user-supplied or API-returned strings are interpolated into HTML template literals, to prevent XSS.
