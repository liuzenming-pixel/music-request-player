# 在线点歌台 (music-request)

一个局域网/线上"在线点歌 + 大屏播放"系统。同学在手机上搜索点歌,大屏端按队列依次播放,带 Apple Music 风格歌词。

本仓库是一个 **monorepo**:前端在 `frontend/`,后端与 Node API 在 `services/` 下。本文件说明整套系统的结构、各页面、以及如何在本地跑起来。

**当前保留两个页面**:`/play`(大屏播放器,React 苹果风)和 `/request`(手机点歌页)。

---

## 三层架构

```
浏览器 (同学点歌 / 大屏播放)
      │  /api/*
      ▼
┌──────────────────────────────────────────────┐
│ ② 后端  Flask   services/backend   端口 5123    │
│    队列管理 + 收藏 + 登录态;并托管前端打包产物         │
│    队列持久化在 services/backend/data/queue.json  │
└──────────────────────────────────────────────┘
      │  转发
      ▼
┌──────────────────────────────────────────────┐
│ ③ NeteaseCloudMusicApi  Node   端口 3000        │
│    services/api-server(第三方,去网易云取数据)       │
└──────────────────────────────────────────────┘

① 前端 Vite 原生 TS  ── frontend/(只剩点歌页),build 产物部署进后端的 player-dist/
```

数据流:浏览器 → ② Flask(`/api/*`)→ ③ Node API → 网易云服务器。

---

## 目录结构

```
music-request-player/          ← 仓库根(monorepo)
├── frontend/                  ← 前端(Vite):点歌页 + 播放器页
│   ├── request.html           点歌页入口(原生 TS)
│   ├── player.html            播放器页入口(React + AMLL)
│   ├── src/{request.ts, player.tsx, request.css, utils.ts, env.d.ts}
│   ├── vite.config.ts · tsconfig.json · package.json
│   ├── CLAUDE.md              前端开发约定(含播放器各坑)
│   └── dist/                  构建产物(gitignore)
├── vendor-amll/               ← 播放器用的 AMLL 歌词库【源码】(见其 README;放此处而非 npm/frontend 内有原因)
├── services/
│   ├── backend/               ② Flask(:5123)— /play /request /api/*
│   ├── api-server/            ③ Node 网易云 API(:3000,第三方)
│   └── start.sh               Linux 启动脚本
├── README.md · CLAUDE.md · .gitignore
```

> `services/` 各自是独立 git 仓库 / 第三方,已在根 `.gitignore` 排除。`vendor-amll/` 是 vendor 进来的第三方源码,**播放器构建依赖它**(详见 `vendor-amll/README.md`)。

---

## 两个页面

| 页面 | 实现 | 访问方式 |
|------|------|----------|
| **播放器**(React 19 + AMLL,Apple Music 原生 UI) | `frontend/player.html` / `frontend/src/player.tsx`,用官方 `react-full` 的 `PrebuiltLyricPlayer` | 后端 `/play` |
| **点歌页**(Vite 原生 TS) | `frontend/request.html` / `frontend/src/request.ts` | 后端 `/request`,或 `frontend/` 里 `pnpm dev` 开 request.html |

> 两个页面都由 `frontend/` 一起打包(Vite 多入口),后端提供的是**打包产物**(`services/backend/player-dist/`)。改了前端源码后:在 `frontend/` 里 `pnpm build`,再把 `frontend/dist/*` 覆盖进 `services/backend/player-dist/` 即生效(后端实时读盘,无需重启)。
>
> 播放器原本是 `services/backend/templates/player.html`(esm.sh 免打包),因版本错位导致歌词滚动 bug,已改为上面这个 Vite 构建版;旧模板保留但**已不再被路由使用**。

---

## 本地运行

### 前置依赖
- Node.js(已装)、pnpm
- Python 3.12+(Flask 后端需要)

### 1) 启动 Node API(端口 3000)
```powershell
cd services/api-server
node app.js
```

### 2) 启动新版后端(端口 5123)
```powershell
cd services/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt          # flask + requests
$env:NETEASE_API_BASE = "http://localhost:3000"
python app.py
```
访问:http://localhost:5123/play 和 http://localhost:5123/request

### 3)(可选)前端开发服务器
```powershell
cd frontend
pnpm install
pnpm dev      # 默认把 /api 代理到线上 VPS 39.105.51.114:5123
```
> 想代理到本地后端,把 `frontend/vite.config.ts` 里的 proxy target 改成 `http://localhost:5123`。dev 服务器只有点歌页(`/request.html`),播放器请用后端 `/play`。

> 未登录网易云账号时,搜索/歌词/热搜可用,但部分 VIP/版权歌曲拿不到播放地址。登录走二维码:页面里扫码,cookie 持久化到后端 `data/ncm_auth.txt`。

---

## 各组件自己的说明

- 前端开发约定见 `frontend/CLAUDE.md`
- 后端细节见 `services/backend/CLAUDE.md`(React `/play` 页的 import map / jotai 驱动、队列原子写、登录态等)
