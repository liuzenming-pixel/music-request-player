import { BackgroundRender, PixiRenderer } from '@applemusic-like-lyrics/core';
import { esc } from './utils';

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;
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
bgRender.setFlowSpeed(4);
bgRender.setAlbum('data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
  '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">' +
  '<stop offset="0%" style="stop-color:#1e1b4b"/>' +
  '<stop offset="30%" style="stop-color:#312e81"/>' +
  '<stop offset="65%" style="stop-color:#4c1d95"/>' +
  '<stop offset="100%" style="stop-color:#2e1065"/>' +
  '</linearGradient></defs>' +
  '<rect width="400" height="400" fill="url(#g)"/>' +
  '</svg>'
));

function resizeBg() {
  const el = bgRender.getElement();
  el.style.width = '100%';
  el.style.height = '100%';
}
window.addEventListener('resize', resizeBg);
resizeBg();

// --- Search History ---
function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem('reqSearchHist') || '[]'); }
  catch { return []; }
}
function addHistory(keyword: string) {
  const hist = getHistory().filter(h => h !== keyword);
  hist.unshift(keyword);
  localStorage.setItem('reqSearchHist', JSON.stringify(hist.slice(0, 10)));
}
function clearHistory() {
  localStorage.removeItem('reqSearchHist');
}

// --- Hot Search ---
let hotItems: any[] = [];
async function loadHotSearch() {
  try {
    const d = await (await fetch('/api/search/hot')).json();
    hotItems = d.result?.hots || d.data || [];
    renderLanding();
  } catch {}
}

async function triggerSearch(keyword: string) {
  searchInput.value = keyword;
  addHistory(keyword);
  await doSearch(keyword);
}

// --- Landing Content (history + hot) ---
// All interactive items use data-keyword; a single delegated listener handles clicks.
function renderLanding() {
  const hist = getHistory();

  const historyHtml = hist.length > 0
    ? '<div class="landing-section" id="history-section">' +
      '<div class="landing-header"><span>搜索历史</span>' +
      '<button class="clear-hist">清除</button></div>' +
      '<div class="history-tags">' +
      hist.map(k =>
        '<span class="history-tag" data-keyword="' + esc(k) + '">' + esc(k) + '</span>'
      ).join('') +
      '</div></div>'
    : '';

  const hotHtml = hotItems.length > 0
    ? '<div class="landing-section">' +
      '<div class="landing-header">热搜榜</div>' +
      '<div id="landing-hot-list">' +
      hotItems.map((h: any, i: number) => {
        const rank = i + 1;
        const name = h.first || h.searchWord || '';
        const rankClass = rank <= 3 ? ' t' + rank : '';
        const heat = h.score || h.hot || 0;
        return '<div class="hot-item" data-keyword="' + esc(name) + '">' +
          '<span class="rk' + rankClass + '">' + rank + '</span>' +
          '<span class="ht-name">' + esc(name) + '</span>' +
          (heat ? '<span class="landing-heat">' + heat + '</span>' : '') +
          '</div>';
      }).join('') +
      '</div></div>'
    : '';

  searchResults.innerHTML = '<div class="landing-content">' + historyHtml + hotHtml + '</div>';
}

// Delegated click handler for landing items (safe: no JS string interpolation)
searchResults.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;

  const keywordEl = target.closest('[data-keyword]') as HTMLElement | null;
  if (keywordEl) {
    await triggerSearch(keywordEl.dataset.keyword!);
    return;
  }

  if (target.closest('.clear-hist')) {
    clearHistory();
    renderLanding();
  }
});

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
        '<button class="add-btn" data-id="' + esc(String(s.id)) + '" data-name="' + esc(s.name) +
        '" data-artist="' + esc(artist) + '" data-pic="' + esc(s.album?.picUrl || s.picUrl || '') +
        '" onclick="window.addToQueue(this)">+ 点歌</button></div>';
    }).join('');
  } catch {}
}

searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(searchInput.value); });
searchInput.addEventListener('focus', () => { if (!searchInput.value.trim()) renderLanding(); });
searchInput.addEventListener('input', () => {
  toggleClearBtn();
  if (!searchInput.value.trim()) renderLanding();
});

// --- Clear Button ---
const searchClear = document.getElementById('search-clear') as HTMLButtonElement;
function toggleClearBtn() {
  searchClear.classList.toggle('hidden', !searchInput.value.trim());
}
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.focus();
  toggleClearBtn();
  renderLanding();
});
toggleClearBtn();

// --- Add to Queue ---
(window as any).addToQueue = async (btn: HTMLButtonElement) => {
  if (btn.classList.contains('done')) return;
  const { id, name, artist, pic: picUrl } = btn.dataset;
  try {
    const r = await (await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, artist, picUrl }),
    })).json();
    if (r.code === 200) {
      btn.textContent = '✓';
      btn.classList.add('done');
      await pollQueue();
    }
  } catch {}
};

// --- Queue Polling ---
async function pollQueue() {
  try {
    const d = await (await fetch('/api/queue?_=' + Date.now())).json();
    if (d.code !== 200) return;
    const req = (d.data?.requests || []) as any[];
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
      '<div class="qi-artist">' + esc(s.artist) + '</div></div>' +
      '<div class="qi-actions">' +
      '<button class="qi-btn pin" data-id="' + esc(String(s.id)) + '" onclick="window.moveTop(this)">↑</button>' +
      '<button class="qi-btn del" data-id="' + esc(String(s.id)) + '" onclick="window.removeSong(this)">×</button>' +
      '</div></li>'
    ).join('');
  } catch {}
}

// --- Queue Actions ---
(window as any).moveTop = async (btn: HTMLButtonElement) => {
  const id = btn.dataset.id;
  if (!id) return;
  await fetch('/api/queue/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, direction: 'top' }),
  });
  await pollQueue();
};
(window as any).removeSong = async (btn: HTMLButtonElement) => {
  const id = btn.dataset.id;
  if (!id) return;
  await fetch('/api/queue/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  await pollQueue();
};

// --- Init ---
loadHotSearch();
pollQueue();
setInterval(pollQueue, 5000);

// --- Mobile Tab Switching ---
const mobileTabs = document.getElementById('mobile-tabs');
const tabIndicator = document.getElementById('tab-indicator');

function moveIndicator(btn: HTMLElement) {
  if (!tabIndicator || !mobileTabs) return;
  const btnRect = btn.getBoundingClientRect();
  const containerRect = mobileTabs.getBoundingClientRect();
  const inset = 6;
  tabIndicator.style.left  = (btnRect.left - containerRect.left + inset) + 'px';
  tabIndicator.style.width = (btnRect.width - inset * 2) + 'px';
}

if (mobileTabs) {
  const defaultBtn = mobileTabs.querySelector('.tab-btn[data-tab="center-col"]') as HTMLButtonElement;
  if (defaultBtn) {
    mobileTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    defaultBtn.classList.add('active');
    moveIndicator(defaultBtn);
  }
  document.getElementById('center-col')?.classList.add('tab-active');

  mobileTabs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.tab-btn') as HTMLButtonElement | null;
    if (!btn?.dataset.tab) return;
    mobileTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    moveIndicator(btn);
    document.querySelectorAll('#center-col, #right-col').forEach(col => {
      col.classList.toggle('tab-active', col.id === btn.dataset.tab);
    });
  });

  let resizeTimer: number;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const activeBtn = mobileTabs.querySelector('.tab-btn.active') as HTMLButtonElement;
      if (activeBtn) moveIndicator(activeBtn);
    }, 200);
  });
}
