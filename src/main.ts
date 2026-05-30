import { LyricPlayer, BackgroundRender, PixiRenderer } from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import { esc, fmt } from './utils';

// ── DOM refs ──────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const audio        = $('audio') as HTMLAudioElement;
const coverWrap    = $('cover-wrap');
const coverImg     = $('cover-img') as HTMLImageElement;
const songTitle    = $('song-title');
const artistName   = $('artist-name');
const likeBtn      = $('like-btn');
const menuBtn      = $('menu-btn');
const menuDropdown = $('menu-dropdown');
const loginMenuBtn = $('login-menu-btn');
const loginNick    = $('login-nick');
const progressTrack = $('progress-track');
const progressFill  = $('progress-fill');
const timeCurrent   = $('time-current');
const timeRemain    = $('time-remain');
const playBtn      = $('play-btn');
const playSvg      = $('play-svg');
const prevBtn      = $('prev-btn');
const nextBtn      = $('next-btn');
const shuffleBtn   = $('shuffle-btn');
const repeatBtn    = $('repeat-btn');
const volumeTrack  = $('volume-track');
const volumeFill   = $('volume-fill');
const volLowBtn    = $('vol-low-btn');

// ── AMLL Lyric Player ─────────────────────────────────────
const lyricPlayer    = new LyricPlayer();
const lyricContainer = $('lyric-container');
lyricContainer.appendChild(lyricPlayer.getElement());

// ── AMLL Background ───────────────────────────────────────
const bgCanvas  = $('bg-canvas');
const bgRender  = BackgroundRender.new(PixiRenderer);
bgCanvas.appendChild(bgRender.getElement());
bgRender.setFlowSpeed(5);
function resizeBg() {
  const el = bgRender.getElement();
  el.style.width = '100%';
  el.style.height = '100%';
}
window.addEventListener('resize', resizeBg);
resizeBg();

// ── State ─────────────────────────────────────────────────
let currentSongId: string | null = null;
let likedSongs      = new Set<string>();
let shuffleActive   = false;
let repeatOne       = false;
let isMuted         = false;
let lastVolume      = 0.8;


// ── Cover scale: playing ↔ paused ────────────────────────
function setCoverPlaying(playing: boolean) {
  coverWrap.classList.toggle('playing', playing);
  coverWrap.classList.toggle('paused', !playing);
}

// ── Play / Pause SVGs ─────────────────────────────────────
const SVG_PLAY  = `<path d="M8 5.14v14l11-7-11-7z"/>`;
const SVG_PAUSE = `<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>`;

function updatePlayIcon() {
  playSvg.innerHTML = audio.paused ? SVG_PLAY : SVG_PAUSE;
  setCoverPlaying(!audio.paused);
}

// ── Heart SVG ─────────────────────────────────────────────
function updateHeartIcon(liked: boolean) {
  const svg = $('heart-svg');
  if (liked) {
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'none');
    likeBtn.classList.add('liked');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    likeBtn.classList.remove('liked');
  }
}

// ── Draggable progress bar ────────────────────────────────
let draggingProgress = false;
function progressPct(e: PointerEvent): number {
  const r = progressTrack.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
}
progressTrack.addEventListener('pointerdown', e => {
  draggingProgress = true;
  progressTrack.classList.add('dragging');
  progressTrack.setPointerCapture((e as PointerEvent).pointerId);
  if (audio.duration) audio.currentTime = progressPct(e as PointerEvent) * audio.duration;
});
progressTrack.addEventListener('pointermove', e => {
  if (!draggingProgress) return;
  if (audio.duration) audio.currentTime = progressPct(e as PointerEvent) * audio.duration;
});
progressTrack.addEventListener('pointerup', () => {
  draggingProgress = false;
  progressTrack.classList.remove('dragging');
});

// ── Draggable volume bar ──────────────────────────────────
let draggingVolume = false;
function volumePct(e: PointerEvent): number {
  const r = volumeTrack.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
}
function applyVolume(pct: number) {
  audio.volume = pct;
  volumeFill.style.width = (pct * 100) + '%';
  isMuted = pct === 0;
}
volumeTrack.addEventListener('pointerdown', e => {
  draggingVolume = true;
  volumeTrack.classList.add('dragging');
  volumeTrack.setPointerCapture((e as PointerEvent).pointerId);
  const pct = volumePct(e as PointerEvent);
  if (pct > 0) lastVolume = pct;
  applyVolume(pct);
});
volumeTrack.addEventListener('pointermove', e => {
  if (!draggingVolume) return;
  const pct = volumePct(e as PointerEvent);
  if (pct > 0) lastVolume = pct;
  applyVolume(pct);
});
volumeTrack.addEventListener('pointerup', () => {
  draggingVolume = false;
  volumeTrack.classList.remove('dragging');
});
// Mute toggle
volLowBtn.addEventListener('click', () => {
  if (isMuted || audio.volume === 0) {
    applyVolume(lastVolume || 0.8);
    isMuted = false;
  } else {
    lastVolume = audio.volume;
    applyVolume(0);
    isMuted = true;
  }
});

// Initial volume
applyVolume(0.8);

// ── Shuffle / Repeat toggles ──────────────────────────────
shuffleBtn.addEventListener('click', () => {
  shuffleActive = !shuffleActive;
  shuffleBtn.classList.toggle('active-dot', shuffleActive);
  shuffleBtn.classList.toggle('active', shuffleActive);
});
repeatBtn.addEventListener('click', () => {
  repeatOne = !repeatOne;
  repeatBtn.classList.toggle('active-dot', repeatOne);
  repeatBtn.classList.toggle('active', repeatOne);
  if (repeatOne) {
    // Show "1" indicator by updating icon
    repeatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        <text x="11" y="15" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-weight="700">1</text>
      </svg>`;
  } else {
    repeatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>`;
  }
});

// ── Menu dropdown ─────────────────────────────────────────
menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  menuDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => menuDropdown.classList.add('hidden'));
menuDropdown.addEventListener('click', e => e.stopPropagation());
loginMenuBtn.addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  showLogin();
});

// ── Play song ─────────────────────────────────────────────
async function playSong(song: any) {
  if (!song?.id) return;
  currentSongId = String(song.id);
  songTitle.textContent = song.name || '未知';
  artistName.textContent = song.artist || '';

  const picUrl = song.picUrl || '';
  coverImg.src = picUrl;
  if (picUrl) bgRender.setAlbum(picUrl);

  loadLyrics(song.id);

  let url = song.playUrl || '';
  if (!url) {
    try {
      const r = await (await fetch('/api/song/url?id=' + song.id + '&level=excellent')).json();
      if (r.code === 200) {
        const d = r.data || [];
        url = (Array.isArray(d) ? d[0]?.url : d.url) || '';
      }
    } catch {}
  }
  if (url) {
    audio.src = url;
    audio.play().catch(() => {});
  }
  checkLiked(song.id);
}

// ── Lyrics ────────────────────────────────────────────────
async function loadLyrics(id: string) {
  try {
    const d = await (await fetch('/api/lyric?id=' + id)).json();
    const lines = parseLRC(d.lrc?.lyric || '', d.tlyric?.lyric || '');
    lyricPlayer.setLyricLines(lines);
  } catch {
    lyricPlayer.setLyricLines([]);
  }
}

function parseLRC(lrc: string, tlyric: string): any[] {
  if (!lrc) return [];
  const tlMap = new Map<number, string>();
  tlyric.split('\n').forEach(line => {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) tlMap.set(+m[1] * 60 + +m[2], m[3].trim());
  });

  const parsed: { startTime: number; text: string }[] = [];
  lrc.split('\n').forEach(line => {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) {
      const startTime = (+m[1] * 60 + +m[2]) * 1000;
      const text = m[3].trim();
      if (text) parsed.push({ startTime, text });
    }
  });

  return parsed.map((cur, i) => {
    const next = parsed[i + 1];
    const endTime = next ? next.startTime : cur.startTime + 5000;
    let translation = '';
    let minDiff = Infinity;
    for (const [t, txt] of tlMap) {
      const diff = Math.abs(t * 1000 - cur.startTime);
      if (diff < minDiff && diff < 3000) { minDiff = diff; translation = txt; }
    }
    return {
      words: [{ startTime: cur.startTime, endTime, word: cur.text }],
      translatedLyric: translation,
      romanLyric: '',
      startTime: cur.startTime,
      endTime,
      isBG: false,
      isDuet: false,
    };
  });
}

// ── Queue / navigation ────────────────────────────────────
async function loadNext() {
  try {
    const d = await (await fetch('/api/queue/next?_=' + Date.now())).json();
    if (d.code === 200 && d.data) await playSong(d.data);
  } catch {}
}

async function markPlayed(sid: string) {
  await fetch('/api/queue/mark-played', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: sid }),
  }).catch(() => {});
}

async function nextSong() {
  if (repeatOne) { audio.currentTime = 0; audio.play(); return; }
  if (currentSongId) { await markPlayed(currentSongId); currentSongId = null; }
  await loadNext();
}

async function prevSong() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  try {
    const d = await (await fetch('/api/queue')).json();
    const items = d.data?.requests || [];
    if (items.length && currentSongId) {
      const idx = items.findIndex((s: any) => String(s.id) === currentSongId);
      if (idx > 0) {
        await markPlayed(currentSongId!);
        currentSongId = null;
        await playSong(items[idx - 1]);
        return;
      }
    }
  } catch {}
  audio.currentTime = 0;
}

// ── Like / heart ──────────────────────────────────────────
async function toggleLike() {
  if (!currentSongId) return;
  const liked = likedSongs.has(currentSongId);
  try {
    const r = await (await fetch('/api/song/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentSongId, like: !liked }),
    })).json();
    if (r.code === 200) {
      liked ? likedSongs.delete(currentSongId) : likedSongs.add(currentSongId);
      updateHeartIcon(!liked);
    }
  } catch {}
}

async function checkLiked(id: string) {
  try {
    const r = await (await fetch('/api/song/like/check?id=' + id)).json();
    if (r.code === 200) {
      r.liked ? likedSongs.add(id) : likedSongs.delete(id);
      updateHeartIcon(!!r.liked);
    }
  } catch {}
}

// ── Login ─────────────────────────────────────────────────
function showLogin() {
  const modal = $('login-modal');
  modal.classList.remove('hidden');
  $('login-success').style.display = 'none';
  ($('qr-img') as HTMLImageElement).src = '';
  $('qr-tip').textContent = '打开网易云 App 扫码';
  getQR();
}
(window as any).showLogin = showLogin;

function closeLogin() {
  $('login-modal').classList.add('hidden');
  if (qrInterval) { clearInterval(qrInterval); qrInterval = null; }
}
(window as any).closeLogin = closeLogin;

let qrInterval: any = null;

async function getQR() {
  try {
    const kd = await (await fetch('/api/login/qr/key')).json();
    if (kd.code !== 200) return;
    const key = kd.data.unikey;
    const qd  = await (await fetch('/api/login/qr/create?key=' + key + '&qrimg=true')).json();
    if (qd.code === 200 && qd.data?.qrimg) {
      ($('qr-img') as HTMLImageElement).src = qd.data.qrimg;
    }
    if (qrInterval) clearInterval(qrInterval);
    qrInterval = setInterval(async () => {
      const cd = await (await fetch('/api/login/qr/check?key=' + key)).json();
      if (cd.code === 803) {
        clearInterval(qrInterval); qrInterval = null;
        $('login-success').style.display = 'block';
        await updateLoginStatus();
        setTimeout(closeLogin, 800);
      } else if (cd.code === 802) {
        $('qr-tip').textContent = '✓ 已扫码，等待确认…';
      } else if (cd.code === 800) {
        clearInterval(qrInterval); qrInterval = null;
        $('qr-tip').textContent = '二维码已过期，请刷新';
      }
    }, 2000);
  } catch {}
}

async function updateLoginStatus() {
  try {
    const d = await (await fetch('/api/login/status')).json();
    const p = d.data || d;
    const profile = p.profile || (p.code === 200 ? p : null);
    if (profile?.nickname) {
      loginMenuBtn.textContent = '重新登录';
      loginNick.textContent = profile.nickname;
      loginNick.classList.remove('hidden');
    }
  } catch {}
}

// ── Audio events ──────────────────────────────────────────
audio.addEventListener('play',  updatePlayIcon);
audio.addEventListener('pause', updatePlayIcon);
audio.addEventListener('loadedmetadata', () => {
  timeRemain.textContent = '-' + fmt(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || !isFinite(audio.duration)) return;
  const pct = audio.currentTime / audio.duration;
  progressFill.style.width = (pct * 100) + '%';
  timeCurrent.textContent = fmt(audio.currentTime);
  timeRemain.textContent  = '-' + fmt(audio.duration - audio.currentTime);
});
audio.addEventListener('ended', () => {
  if (currentSongId) nextSong().catch(() => {});
});
audio.addEventListener('error', () => {
  songTitle.textContent = '无法播放';
  const failedId = currentSongId;
  currentSongId = null;
  setTimeout(async () => {
    if (failedId) await markPlayed(failedId);
    await loadNext();
  }, 2000);
});

// ── Button events ─────────────────────────────────────────
playBtn.addEventListener('click', () => { audio.paused ? audio.play() : audio.pause(); });
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
likeBtn.addEventListener('click', toggleLike);

// ── Animation loop ────────────────────────────────────────
function animate(time: number) {
  lyricPlayer.setCurrentTime(audio.currentTime * 1000);
  lyricPlayer.update(time);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ── Init ──────────────────────────────────────────────────
async function init() {
  await updateLoginStatus();
  try {
    const d = await (await fetch('/api/queue/next')).json();
    if (d.code === 200 && d.data) await playSong(d.data);
  } catch {}
}
init();
