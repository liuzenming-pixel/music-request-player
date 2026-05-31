// 大屏播放器页(/play)。AMLL react-full 成品播放器 + 你的 /api/* 后端。
// 由 esm.sh 免打包页迁移而来,改为正经 Vite 构建,版本锁定、官方接线。
// 源码构建:样式由各组件自带 CSS Module 引入,无需手动 import。
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider, createStore, useAtomValue } from "jotai";
import {
  PrebuiltLyricPlayer,
  PrebuiltToggleIconButton, PrebuiltToggleIconButtonType,
  musicIdAtom, musicNameAtom, musicArtistsAtom, musicAlbumNameAtom, musicCoverAtom,
  musicDurationAtom, musicPlayingAtom, musicPlayingPositionAtom, musicVolumeAtom,
  musicLyricLinesAtom,
  isLyricPageOpenedAtom, enableLyricLineScaleEffectAtom,
  lyricSizePresetAtom, LyricSizePreset,
  onPlayOrResumeAtom, onRequestNextSongAtom, onRequestPrevSongAtom,
  onSeekPositionAtom, onChangeVolumeAtom, onRequestOpenMenuAtom,
} from "@applemusic-like-lyrics/react-full";
import { parseYrc, parseLrc } from "@applemusic-like-lyrics/lyric";

const $ = (id: string) => document.getElementById(id)!;
const au = $('audio') as HTMLAudioElement;
const store = createStore();

// ===== 配置 =====
store.set(isLyricPageOpenedAtom, true);            // 必须:开启歌词页,歌词才滚动、背景才流动
store.set(enableLyricLineScaleEffectAtom, false);  // 当前行只点亮不放大
// 歌词字号:默认 Medium;可用 URL 参数 ?size=small|medium|large|extra-large|huge 临时切换。
const SIZE_MAP: Record<string, any> = {
  small: LyricSizePreset.Small, medium: LyricSizePreset.Medium, large: LyricSizePreset.Large,
  'extra-large': LyricSizePreset.ExtraLarge, huge: LyricSizePreset.Huge,
};
store.set(lyricSizePresetAtom, SIZE_MAP[new URLSearchParams(location.search).get('size') || ''] ?? LyricSizePreset.Medium);
au.volume = store.get(musicVolumeAtom) ?? 0.7;

// ===== 渲染 React 应用 =====
createRoot($('root')).render(
  React.createElement(Provider, { store } as any,
    // 用 fixed + 100vh 铁定撑满视口;不要用 height:100% 靠父链,否则可能塌缩成内容高度→当前行下移
    React.createElement(PrebuiltLyricPlayer, { style: { position: 'fixed', inset: 0, width: '100%', height: '100vh' } })
  )
);
const loadingEl = document.getElementById('loading');
if (loadingEl) loadingEl.style.display = 'none';

// ===== 收藏按钮(库组件 Star),插到「…」菜单左侧 =====
function StarButton() {
  const id = useAtomValue(musicIdAtom);
  const [liked, setLiked] = React.useState(false);
  React.useEffect(() => {
    if (!id) { setLiked(false); return; }
    let alive = true;
    fetch('/api/song/like/check?id=' + id).then(r => r.json())
      .then(d => { if (alive) setLiked(!!d.liked); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  const toggle = async () => {
    if (!id) return;
    const next = !liked; setLiked(next);
    try {
      const r = await (await fetch('/api/song/like', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, like: next }),
      })).json();
      if (r.code !== 200) setLiked(!next);
    } catch (e) { setLiked(!next); }
  };
  return React.createElement(PrebuiltToggleIconButton, {
    type: PrebuiltToggleIconButtonType.Star, checked: liked, onClick: toggle, title: '收藏',
    className: 'favStar',
  } as any);
}
// PrebuiltLyricPlayer 在全屏/窄屏(关歌词)各有一个 musicInfo,靠 CSS 切换显隐。
// 必须给【每个】musicInfo 都插一个收藏按钮(各自独立 React root),否则切到窄屏时收藏按钮会随隐藏的那个一起消失。
const starred = new WeakSet<Element>();
function ensureStar() {
  document.querySelectorAll('#root [class*="musicInfo"]').forEach((info) => {
    if (starred.has(info)) return;
    const menu = info.querySelector('button[class*="menuButton"]');
    if (!menu) return;
    const wrap = document.createElement('span');
    wrap.style.display = 'contents';
    createRoot(wrap).render(React.createElement(Provider, { store } as any, React.createElement(StarButton)));
    info.insertBefore(wrap, menu);
    starred.add(info);
  });
}
new MutationObserver(ensureStar).observe($('root'), { childList: true, subtree: true });
ensureStar();

// ===== audio -> jotai 同步 =====
// 进度只在 timeupdate(~4Hz)/seek/play 时喂给 react-full,让它内部按帧平滑插值。
// 切勿每帧 requestAnimationFrame 都 setPos:au.currentTime 是粗粒度跳变,
// 每帧把内部插值的时钟拽回旧值,会导致歌词当前行来回跳。
const setPos = () => store.set(musicPlayingPositionAtom, (au.currentTime || 0) * 1000);
au.addEventListener('loadedmetadata', () => { store.set(musicDurationAtom, (au.duration || 0) * 1000); setPos(); });
au.addEventListener('timeupdate', setPos);
au.addEventListener('seeked', setPos);
au.addEventListener('play',  () => { store.set(musicPlayingAtom, true); setPos(); });
au.addEventListener('pause', () => store.set(musicPlayingAtom, false));
au.addEventListener('ended', advance);
au.addEventListener('error', () => setTimeout(advance, 1500));

// ===== 控制回调 =====
store.set(onPlayOrResumeAtom,    { onEmit: () => au.paused ? au.play().catch(() => {}) : au.pause() });
store.set(onRequestNextSongAtom, { onEmit: advance });
store.set(onRequestPrevSongAtom, { onEmit: () => { if (au.currentTime > 3) au.currentTime = 0; else prevSong(); } });
store.set(onSeekPositionAtom,    { onEmit: (ms: number) => { if (au.duration) au.currentTime = ms / 1000; } });
store.set(onChangeVolumeAtom,    { onEmit: (v: number) => { au.volume = v; store.set(musicVolumeAtom, v); } });
store.set(onRequestOpenMenuAtom, { onEmit: () => showLogin() });   // 菜单(…)按钮 → 扫码登录

// ===== 歌词 =====
function toArtists(str: string) {
  const arr = (str || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
  return arr.length ? arr.map((n, i) => ({ name: n, id: 'a' + i })) : [{ name: '', id: '0' }];
}
function mergeAux(lines: any[], romanLrc: string, transLrc: string) {
  const assign = (lrcStr: string, field: string) => {
    if (!lrcStr) return;
    let aux: any[]; try { aux = parseLrc(lrcStr); } catch (e) { return; }
    for (const line of lines) {
      let best: any = null, bd = 800;
      for (const a of aux) { const dd = Math.abs(a.startTime - line.startTime); if (dd < bd) { bd = dd; best = a; } }
      if (best) { const t = best.words.map((w: any) => w.word).join('').trim(); if (t) line[field] = t; }
    }
  };
  assign(romanLrc, 'romanLyric');
  assign(transLrc, 'translatedLyric');
}
let lyricToken = 0;
async function setLyric(id: string) {
  const my = ++lyricToken;
  try {
    const d = await (await fetch('/api/lyric?id=' + id)).json();
    if (my !== lyricToken) return;
    let lines: any[] = [];
    if (d.yrc && d.yrc.lyric) { lines = parseYrc(d.yrc.lyric); mergeAux(lines, d.yromalrc && d.yromalrc.lyric, d.ytlrc && d.ytlrc.lyric); }
    else if (d.lrc && d.lrc.lyric) { lines = parseLrc(d.lrc.lyric); mergeAux(lines, d.romalrc && d.romalrc.lyric, d.tlyric && d.tlyric.lyric); }
    store.set(musicLyricLinesAtom, lines);
  } catch (e) { if (my === lyricToken) store.set(musicLyricLinesAtom, []); }
}

// ===== 队列 / 播放 =====
let cp: string | null = null;
function applySong(s: any) {
  cp = s.id;
  store.set(musicIdAtom, s.id || '');
  store.set(musicNameAtom, s.name || '未知');
  store.set(musicArtistsAtom, toArtists(s.artist));
  store.set(musicAlbumNameAtom, s.album || '');
  store.set(musicCoverAtom, s.picUrl || '');
  setLyric(s.id);
}
async function playSong(s: any) {
  if (!s || !s.id) return;
  applySong(s);
  try {
    const r = await (await fetch(`/api/song/url?id=${s.id}&level=excellent`)).json();
    let url = '';
    if (r.code === 200) { const dd = r.data; if (Array.isArray(dd) && dd[0]) url = dd[0].url || ''; else if (dd && dd.url) url = dd.url; }
    if (url) { au.src = url; au.play().catch(() => {}); }
    else setTimeout(advance, 2000);   // 取不到播放地址 → 跳过这首(advance 会先 markPlayed 再取下一首)
  } catch (e) {}
}
async function loadNext() {
  try {
    const d = await (await fetch('/api/queue/next?_=' + Date.now())).json();
    if (d.code === 200 && d.data) {
      const s = d.data; applySong(s);
      if (s.playUrl) { au.src = s.playUrl; au.play().catch(() => {}); }
      else await playSong(s);
    } else {
      store.set(musicIdAtom, '');
      store.set(musicNameAtom, '等待点歌');
      store.set(musicArtistsAtom, [{ name: '', id: '0' }]);
      store.set(musicCoverAtom, '');
      store.set(musicLyricLinesAtom, []);
      au.pause(); au.src = ''; cp = null;
    }
  } catch (e) {}
}
async function prevSong() {
  try {
    const d = await (await fetch('/api/queue')).json();
    if (d.code === 200) { const items = d.data.requests || []; const idx = items.findIndex((s: any) => s.id === cp); if (idx > 0) { await playSong(items[idx - 1]); return; } }
  } catch (e) {}
  au.currentTime = 0;
}
async function markPlayed(sid: string | null) {
  if (!sid) return;
  try { await fetch('/api/queue/mark-played', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sid }) }); } catch (e) {}
}
// 切下一首的统一入口(带互斥锁):必须【先等 markPlayed 完成、再 loadNext】,
// 否则 /api/queue/next 可能先于 mark-played 到达服务器,队首仍是当前歌 → 取回同一首导致重播。
// 互斥锁同时避免"手动切歌"与"空闲轮询"并发触发两次 loadNext。
let advancing = false;
async function advance() {
  if (advancing) return;
  advancing = true;
  const prev = cp; cp = null;
  try { await markPlayed(prev); await loadNext(); }
  finally { advancing = false; }
}
async function init() {
  try {
    const d = await (await fetch('/api/queue/next')).json();
    if (d.code === 200 && d.data) {
      const s = d.data; applySong(s);
      let url = s.playUrl || '';
      if (!url) {   // queue/next 未带 playUrl 时,补一次解析,保证播放按钮可用
        try {
          const r = await (await fetch('/api/song/url?id=' + s.id + '&level=excellent')).json();
          const dd = r.data; if (Array.isArray(dd) && dd[0]) url = dd[0].url || ''; else if (dd && dd.url) url = dd.url;
        } catch (e) {}
      }
      if (url) au.src = url;   // 载入但不自动播放,等用户点播放(避开浏览器自动播放限制)
    }
  } catch (e) {}
}
init();

// ===== 空闲轮询:没有在放歌时,定时检查队列,有新歌自动开始播放 =====
// 复用 advance(cp 为空时 markPlayed 是 no-op,等价于直接 loadNext);advancing 锁避免与手动切歌并发。
setInterval(() => { if (!cp && !advancing) advance(); }, 4000);

// ===== 扫码登录 (DOM 覆盖层) =====
let qt: any = null;
function showLogin() {
  $('lModal').style.display = 'flex';
  $('ls').style.display = 'none'; ($('qri') as HTMLImageElement).src = ''; $('qtip').textContent = '打开网易云 App 扫码';
  getQR();
}
function closeLogin() { $('lModal').style.display = 'none'; if (qt) { clearInterval(qt); qt = null; } }
async function getQR() {
  try {
    const kd = await (await fetch('/api/login/qr/key')).json();
    if (kd.code !== 200) return;
    const key = kd.data.unikey;
    const qd = await (await fetch(`/api/login/qr/create?key=${key}&qrimg=true`)).json();
    if (qd.code === 200 && qd.data && qd.data.qrimg) ($('qri') as HTMLImageElement).src = qd.data.qrimg;
    if (qt) clearInterval(qt);
    qt = setInterval(async () => {
      const cd = await (await fetch(`/api/login/qr/check?key=${key}`)).json();
      if (cd.code === 803) { clearInterval(qt); qt = null; $('ls').style.display = 'block'; setTimeout(closeLogin, 1200); }
      else if (cd.code === 802) $('qtip').textContent = '✓ 已扫码，等待确认';
      else if (cd.code === 800) { clearInterval(qt); qt = null; $('qtip').textContent = '二维码已过期'; }
    }, 2000);
  } catch (e) {}
}
$('lClose').addEventListener('click', closeLogin);
$('lDone').addEventListener('click', closeLogin);
$('lModal').addEventListener('click', e => { if (e.target === $('lModal')) closeLogin(); });
