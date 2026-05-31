# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo is a **monorepo / workspace** for the 在线点歌台 ("online song-request") system. See `README.md` for the full picture and run instructions.

## Layout

| 路径 | 组件 | 说明 |
|------|------|------|
| `frontend/` | **前端·点歌页** | Vite + 原生 TS,单入口(`request.html`)。开发约定见 `frontend/CLAUDE.md` |
| `services/backend/` | **② Flask 后端**(端口 5123) | 队列/收藏/登录 + `/api/*`;serves `/play`(React 页)和 `/request`。细节见 `services/backend/CLAUDE.md` |
| `services/api-server/` | **③ Node 网易云 API**(端口 3000) | 第三方 NeteaseCloudMusicApi,数据源 |

数据流:浏览器 → ② Flask(`/api/*`)→ ③ Node API → 网易云。

## 当前保留的两个页面

- **`/play`** — 大屏播放器,React Apple-Music UI(`services/backend/templates/player.html`,esm.sh 免打包,不依赖前端打包产物)。
- **`/request`** — 手机点歌页(`frontend/` 的打包产物)。

## 跨组件的关键约定

- **前端改动要重新部署**:`frontend/` 的源码改完后,`cd frontend && pnpm build`,再把 `frontend/dist/*` 覆盖进 `services/backend/player-dist/`。后端 `/request` 实时读盘,换文件后无需重启;`/play` 改了 `templates/player.html` 需重启 Flask(Jinja 缓存)。
- **`services/` 是独立组件**(各自 git 仓库 / 第三方),已在根 `.gitignore` 排除,不纳入本仓库。
- 本机本地运行的环境细节(Python 路径、启动命令、杀进程坑)见记忆 `local-run-setup`。
