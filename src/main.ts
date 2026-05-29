import { LyricPlayer, BackgroundRender, PixiRenderer } from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;
const audio = document.getElementById('audio') as HTMLAudioElement;
const coverImg = $('cover-img') as HTMLImageElement;
const songTitle = $('song-title');
const artistName = $('artist-name');
const playBtn = $('play-btn');
const prevBtn = $('prev-btn');
const nextBtn = $('next-btn');
const progressFill = $('progress-fill');
const progressTrack = $('progress-track');
const timeCurrent = $('time-current');
const timeTotal = $('time-total');
const likeBtn = $('like-btn');
const loginText = $('login-text');
const volumeTrack = $('volume-track');
const volumeFill = $('volume-fill');

// --- State ---
let currentSongId: string | null = null;
let likedSongs = new Set<string>();

// --- AMLL Lyric Player ---
const lyricPlayer = new LyricPlayer();
const lyricContainer = $('lyric-container');
lyricContainer.appendChild(lyricPlayer.getElement());

// --- AMLL Background Renderer ---
const bgCanvas = document.getElementById('bg-canvas')!;
const bgRender = BackgroundRender.new(PixiRenderer);
bgCanvas.appendChild(bgRender.getElement());
bgRender.setFlowSpeed(6);

// --- Auto-resize bg canvas ---
function resizeBg() {
  const el = bgRender.getElement();
  el.style.width = '100%';
  el.style.height = '100%';
}
window.addEventListener('resize', resizeBg);
resizeBg();

// --- Helpers ---
function fmt(t: number): string {
  if (!t || isNaN(t)) return '00:00';
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
}
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Play Song ---
async function playSong(song: any) {
  if (!song || !song.id) return;
  currentSongId = song.id;
  songTitle.textContent = song.name || '未知';
  artistName.textContent = (song.artist || '');

  // Cover & background
  const picUrl = song.picUrl || '';
  coverImg.src = picUrl;
  if (picUrl) bgRender.setAlbum(picUrl);

  // Lyrics
  loadLyrics(song.id);

  // Song URL - use playUrl if already provided (from /api/queue/next), otherwise fetch
  let url = song.playUrl || '';
  if (!url) {
    try {
      const r = await (await fetch('/api/song/url?id=' + song.id + '&level=excellent')).json();
      if (r.code === 200) {
        const d = r.data || [];
        if (Array.isArray(d) && d[0]) url = d[0].url || '';
        else if (d.url) url = d.url;
      }
    } catch {}
  }
  if (url) {
    audio.src = url;
    const pp = audio.play();
    if (pp) pp.catch(() => { songTitle.textContent = song.name; });
  } else {
    songTitle.textContent = song.name;
  }

  // Check liked status
  checkLiked(song.id);
}

// --- Lyrics ---
async function loadLyrics(id: string) {
  try {
    const d = await (await fetch('/api/lyric?id=' + id)).json();
    const lrc = d.lrc?.lyric || '';
    const tlyric = d.tlyric?.lyric || '';
    const lines = parseLRC(lrc, tlyric);
    lyricPlayer.setLyricLines(lines);
  } catch {
    lyricPlayer.setLyricLines([]);
  }
}

function parseLRC(lrc: string, tlyric: string): any[] {
  if (!lrc) return [];
  const tlMap = new Map<number, string>();
  if (tlyric) {
    tlyric.split('\n').forEach(line => {
      const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (m) {
        const time = +m[1] * 60 + +m[2];
        tlMap.set(time, m[3].trim());
      }
    });
  }

  // Parse all lines first
  const parsed: { startTime: number; text: string }[] = [];
  lrc.split('\n').forEach(line => {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) {
      const startTime = (+m[1] * 60 + +m[2]) * 1000;
      const text = m[3].trim();
      if (text) parsed.push({ startTime, text });
    }
  });

  // Build LyricLine[] with proper end times (next line's startTime)
  const lines: any[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const cur = parsed[i];
    const next = parsed[i + 1];
    const endTime = next ? next.startTime : cur.startTime + 5000;
    const translation = findClosestTranslation(cur.startTime, tlMap);
    lines.push({
      words: [{ startTime: cur.startTime, endTime, word: cur.text }],
      translatedLyric: translation || '',
      romanLyric: '',
      startTime: cur.startTime,
      endTime,
      isBG: false,
      isDuet: false,
    });
  }
  return lines;
}

function findClosestTranslation(time: number, map: Map<number, string>): string {
  let closest = '';
  let minDiff = Infinity;
  for (const [t, txt] of map) {
    const diff = Math.abs(t * 1000 - time);
    if (diff < minDiff && diff < 3000) {
      minDiff = diff;
      closest = txt;
    }
  }
  return closest;
}

// --- Load Next Song ---
async function loadNext() {
  try {
    const d = await (await fetch('/api/queue/next?_=' + Date.now())).json();
    if (d.code === 200 && d.data) await playSong(d.data);
  } catch {}
}

async function markPlayed(sid: string) {
  if (!sid) return;
  await fetch('/api/queue/mark-played', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: sid }),
  });
}

// --- Controls ---
function togglePlay() {
  if (audio.paused) audio.play();
  else audio.pause();
}
function updatePlayBtn() {
  playBtn.textContent = audio.paused ? '▶' : '⏸';
}

function seek(e: MouseEvent) {
  const r = progressTrack.getBoundingClientRect();
  audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
}

(window as any).seek = seek;

async function nextSong() {
  if (currentSongId) { await markPlayed(currentSongId); currentSongId = null; }
  await loadNext();
}

async function prevSong() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  try {
    const d = await (await fetch('/api/queue')).json();
    if (d.code !== 200) return;
    const items = d.data.requests || [];
    if (items.length > 0 && currentSongId) {
      const idx = items.findIndex((s: any) => s.id === currentSongId);
      if (idx > 0) {
        await markPlayed(currentSongId);
        currentSongId = null;
        await playSong(items[idx - 1]);
        return;
      }
    }
  } catch {}
  audio.currentTime = 0;
}

// --- Heart / Like ---
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
      if (liked) {
        likedSongs.delete(currentSongId);
        likeBtn.textContent = '♡';
        likeBtn.classList.remove('liked');
      } else {
        likedSongs.add(currentSongId);
        likeBtn.textContent = '♥';
        likeBtn.classList.add('liked');
      }
    }
  } catch {}
}

async function checkLiked(id: string) {
  try {
    const r = await (await fetch('/api/song/like/check?id=' + id)).json();
    if (r.code === 200) {
      if (r.liked) {
        likedSongs.add(id);
        likeBtn.textContent = '♥';
        likeBtn.classList.add('liked');
      } else {
        likedSongs.delete(id);
        likeBtn.textContent = '♡';
        likeBtn.classList.remove('liked');
      }
    }
  } catch {}
}

// --- Login ---
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
    const qd = await (await fetch('/api/login/qr/create?key=' + key + '&qrimg=true')).json();
    if (qd.code === 200 && qd.data?.qrimg) {
      ($('qr-img') as HTMLImageElement).src = qd.data.qrimg;
    }
    if (qrInterval) clearInterval(qrInterval);
    qrInterval = setInterval(async () => {
      const cd = await (await fetch('/api/login/qr/check?key=' + key)).json();
      if (cd.code === 803) {
        clearInterval(qrInterval!);
        qrInterval = null;
        $('login-success').style.display = 'block';
        await updateLoginStatus();
        setTimeout(() => closeLogin(), 800);
      } else if (cd.code === 802) {
        $('qr-tip').textContent = '✓ 已扫码';
      } else if (cd.code === 800) {
        clearInterval(qrInterval!);
        qrInterval = null;
        $('qr-tip').textContent = '已过期';
      }
    }, 2000);
  } catch {}
}

async function updateLoginStatus() {
  try {
    const d = await (await fetch('/api/login/status')).json();
    const p = d.data || d;
    if ((d.code === 200 || p.code === 200) && p.profile) {
      loginText.innerHTML = '<span class="nk">' + esc(p.profile.nickname || '') + '</span>';
    }
  } catch {}
}

// --- Init ---
async function init() {
  await updateLoginStatus();
  try {
    const d = await (await fetch('/api/queue/next')).json();
    if (d.code === 200 && d.data) {
      await playSong(d.data);
    }
  } catch {}
}
init();

// --- Audio Events ---
audio.addEventListener('loadedmetadata', () => {
  if (audio.duration && isFinite(audio.duration)) {
    timeTotal.textContent = fmt(audio.duration);
  }
});
audio.addEventListener('timeupdate', () => {
  if (audio.duration && isFinite(audio.duration)) {
    progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    timeCurrent.textContent = fmt(audio.currentTime);
    timeTotal.textContent = fmt(audio.duration);
  }
});
audio.addEventListener('play', updatePlayBtn);
audio.addEventListener('pause', updatePlayBtn);
audio.addEventListener('ended', () => { if (currentSongId) { markPlayed(currentSongId); nextSong(); } });
audio.addEventListener('error', () => {
  songTitle.textContent = '无法播放';
  setTimeout(() => { if (currentSongId) { markPlayed(currentSongId); nextSong(); } }, 2000);
});

// --- Button Events ---
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
likeBtn.addEventListener('click', toggleLike);

// --- Volume Control ---
audio.volume = 0.8;
function setVolume(e: MouseEvent) {
  const r = volumeTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  audio.volume = pct;
  volumeFill.style.width = (pct * 100) + '%';
}
volumeTrack.addEventListener('click', setVolume);

// --- Animation loop for AMLL (called every frame) ---
function animate(time: number) {
  lyricPlayer.setCurrentTime(audio.currentTime * 1000);
  lyricPlayer.update(time);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// --- Click on progress track ---
progressTrack.addEventListener('click', seek);
