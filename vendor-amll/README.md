# vendored AMLL (Apple Music-like Lyrics) — 源码

播放器页(`/play`,`frontend/src/player.tsx`)用的 AMLL 组件库**源码**,vendor 在这里。

## 为什么用源码,且为什么放在 frontend 之外

- npm 发布的 `@applemusic-like-lyrics/react-full@0.4.1` 产物、以及用 tsdown 编译的 dist,**渲染与源码不一致**且**当前歌词行会随播放逐渐下移(drift)**。直接用**源码**让 Vite 打包则渲染正确、不漂。
- 必须放在 `frontend/`(Vite root)**之外**:Vite 8(rolldown)对 root 内的 `.svg?react` 会跳过 `vite-plugin-svgr` 的 JSX 编译;放在 root 外才能正常编译 react-full 里的图标。

## 来源与版本

- 仓库:`amll-dev/applemusic-like-lyrics`(原 `Steve-xmh/...`),`main` 分支
- 版本:`react-full` 0.4.1 / `core` 0.5.1 / `react` 0.5.1 / `lyric` 1.0.1 / `ttml`
- 内容:各包的 `src/`(直接被 Vite 打包,不经过 npm/dist)。

## 依赖解析:node_modules 目录联接(junction)

源码会 `import` 一些裸依赖(`gl-matrix@4.0.0-beta.2`、`pako`、`bezier-easing`、`classnames`、
`corner-smoothing`、`react-toastify`、`@ungap/structured-clone`、`framer-motion`、`@pixi/*`、`react`、`jotai` 等)。
因为本目录在 frontend 之外、附近没有 node_modules,这里用一个 **junction** 指向 frontend 的 node_modules:

```
vendor-amll/node_modules  ──(Windows junction)──>  frontend/node_modules
```

这些裸依赖都已作为 `frontend` 的直接依赖安装。**若 junction 丢失**(如换机器/重建),用以下命令重建:

```powershell
New-Item -ItemType Junction -Path "vendor-amll\node_modules" -Target "frontend\node_modules"
```

## 引用方式

`frontend/vite.config.ts` 用 `resolve.alias` 把 `@applemusic-like-lyrics/<pkg>` 指到 `../vendor-amll/<pkg>/src`,
并复刻了 core 包 package.json 的 `imports` 子路径别名(`#interfaces`/`#utils`/`#styles`/`#lyric`/`#bg`),
同时 `dedupe` react/react-dom/jotai。

## 如何更新

从上游仓库重新 `pnpm install && pnpm run build:libs` 不是必须;只需把各包最新的 `src/` 覆盖到这里即可。
