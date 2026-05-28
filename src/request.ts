import { BackgroundRender, PixiRenderer } from '@applemusic-like-lyrics/core';

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;
const hotList = $('hot-list');
const searchInput = $('search-input') as HTMLInputElement;
const searchBtn = $('search-btn');
const searchResults = $('search-results');
const queueList = $('queue-list') as HTMLOListElement;
const queueEmpty = $('queue-empty');
const queueCount = $('queue-count');

// --- AMLL Background ---
const bgCanvas = document.getElementById('bg-canvas')!;
const bgRender = BackgroundRender.new(PixiRenderer);
bgCanvas.appendChild(bgRender.getElement());
bgRender.setFlowSpeed(5);
// Use a default gradient since there's no album art on the request page
bgRender.setAlbum('data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
  '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">' +
  '<stop offset="0%" style="stop-color:#1a1a2e"/>' +
  '<stop offset="50%" style="stop-color:#16213e"/>' +
  '<stop offset="100%" style="stop-color:#0f3460"/>' +
  '</linearGradient></defs>' +
  '<rect width="400" height="400" fill="url(#g)"/>' +
  '</svg>'
));

// Auto-resize bg
function resizeBg() {
  const el = bgRender.getElement();
  el.style.width = '100%';
  el.style.height = '100%';
}
window.addEventListener('resize', resizeBg);
resizeBg();

// --- Helpers ---
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Hot Search ---
async function loadHotSearch() {
  try {
    const d = await (await fetch('/api/search/hot')).json();
    const items = d.result?.hots || d.data || [];
    hotList.innerHTML = items.map((h: any, i: number) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? ' t' + rank : '';
      const name = h.first || h.searchWord || '';
      return '<div class="hot-item" onclick="window.addHot(\'' + esc(name) + '\')">' +
        '<span class="rk' + rankClass + '">' + rank + '</span>' +
        '<span class="ht-name">' + esc(name) + '</span></div>';
    }).join('');
  } catch {}
}
(window as any).addHot = async (keyword: string) => {
  searchInput.value = keyword;
  await doSearch(keyword);
};

// --- Search ---
async function doSearch(keyword: string) {
  if (!keyword.trim()) return;
  try {
    const d = await (await fetch('/api/search?keyword=' + encodeURIComponent(keyword) + '&limit=50')).json();
    const songs = d.result?.songs || [];
    if (songs.length === 0) {
      searchResults.innerHTML = '<div class="empty-state"><span class="e">~</span>未找到结果</div>';
      return;
    }
    searchResults.innerHTML = songs.map((s: any) => {
      const artist = (s.artists || []).map((a: any) => a.name).join(' / ') || s.artist || '';
      return '<div class="search-item">' +
        '<img src="' + esc(s.album?.picUrl || s.picUrl || '') + '" onerror="this.style.display=\'none\'">' +
        '<div class="si-info">' +
        '<div class="si-name">' + esc(s.name) + '</div>' +
        '<div class="si-artist">' + esc(artist) + '</div></div>' +
        '<button class="add-btn" data-id="' + s.id + '" data-name="' + esc(s.name) +
        '" data-artist="' + esc(artist) + '" data-pic="' + esc(s.album?.picUrl || s.picUrl || '') +
        '" onclick="window.addToQueue(this)">+ 点歌</button></div>';
    }).join('');
  } catch {}
}

searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(searchInput.value); });

// --- Add to Queue ---
(window as any).addToQueue = async (btn: HTMLButtonElement) => {
  if (btn.classList.contains('done')) return;
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const artist = btn.dataset.artist;
  const picUrl = btn.dataset.pic;
  try {
    const r = await (await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, artist, picUrl }),
    })).json();
    if (r.code === 200) {
      btn.textContent = '✓';
      btn.classList.add('done');
      pollQueue();
    }
  } catch {}
};

// --- Queue Polling ---
async function pollQueue() {
  try {
    const d = await (await fetch('/api/queue?_=' + Date.now())).json();
    if (d.code !== 200) return;
    const q = d.data;
    const req = q.requests || [];
    queueCount.textContent = String(req.length);

    if (req.length === 0) {
      queueList.classList.add('hidden');
      queueEmpty.classList.remove('hidden');
      return;
    }
    queueEmpty.classList.add('hidden');
    queueList.classList.remove('hidden');
    queueList.innerHTML = req.map((s: any) =>
      '<li class="queue-item">' +
      '<img src="' + esc(s.picUrl || '') + '" onerror="this.style.display=\'none\'">' +
      '<div class="qi-info"><div class="qi-name">' + esc(s.name) + '</div>' +
      '<div class="qi-artist">' + esc(s.artist) + '</div></div></li>'
    ).join('');
  } catch {}
}

// --- Init ---
loadHotSearch();
pollQueue();
setInterval(pollQueue, 5000);
