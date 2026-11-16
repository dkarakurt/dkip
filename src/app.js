/* DKIP — Xtream Codes IPTV oynatıcı */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('dkip:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dkip:' + k, JSON.stringify(v)); } catch {} }
};
const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const PAGE = 120;

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function b64(s) {
  if (!s) return '';
  try { return decodeURIComponent(escape(atob(s))); } catch { return s; }
}
function fmtTime(d) { return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }

/* ---------------- Hesap / API ---------------- */
let acct = null;           // { server, user, pass }
let userInfo = null, serverInfo = null;
const SECTIONS = {
  live:   { title: 'Canlı TV', cats: 'get_live_categories',   items: 'get_live_streams' },
  movie:  { title: 'Filmler',  cats: 'get_vod_categories',    items: 'get_vod_streams' },
  series: { title: 'Diziler',  cats: 'get_series_categories', items: 'get_series' }
};
const cache = {};
const UAS = ['IPTVSmartersPro', 'VLC/3.0.20 LibVLC/3.0.20', 'okhttp/4.12.0', 'Lavf/58.76.100',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'];
async function setUA(ua) { if (window.dkip && window.dkip.setUserAgent) await window.dkip.setUserAgent(ua); }          // section -> { cats, items }
const settings = Object.assign({ format: 'ts', vlc: '' }, store.get('settings', {}));

function parseServerInput(raw) {
  let s = String(raw || '').trim();
  const out = {};
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    if (u.searchParams.get('username')) out.user = u.searchParams.get('username');
    if (u.searchParams.get('password')) out.pass = u.searchParams.get('password');
    out.server = u.origin;
  } catch { out.server = s.replace(/\/+$/, ''); }
  return out;
}

async function api(action, params = {}) {
  const q = new URLSearchParams({ username: acct.user, password: acct.pass });
  if (action) q.set('action', action);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(`${acct.server}/player_api.php?${q}`, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) { const er = new Error(`Sunucu ${r.status} döndürdü`); er.status = r.status; throw er; }
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { throw new Error('Sunucu geçersiz yanıt verdi'); }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Sunucu yanıt vermedi (zaman aşımı)');
    throw e;
  } finally { clearTimeout(to); }
}

const acctKey = () => acct ? `${acct.server}|${acct.user}` : '';
const favKey = () => 'fav:' + acctKey();
const progKey = () => 'prog:' + acctKey();
let favs = {}, prog = {};

const enc = (s) => String(s).replace(/[%\/?#\s]/g, c => encodeURIComponent(c));
function streamUrl(kind, id, ext) {
  const base = `${acct.server}/${kind}/${enc(acct.user)}/${enc(acct.pass)}/${id}`;
  if (kind === 'live') return `${acct.server}/live/${enc(acct.user)}/${enc(acct.pass)}/${id}.${ext || settings.format}`;
  return `${base}.${ext || 'mp4'}`;
}

/* ---------------- Giriş ekranı ---------------- */
function renderProfiles() {
  const list = store.get('profiles', []);
  const el = $('#savedProfiles');
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<h4>Kayıtlı hesaplar</h4>' + list.map((p, i) => `
    <div class="profile" data-i="${i}" role="button" tabindex="0">
      <div class="p-main"><div><b>${esc(p.user)}</b></div><div class="muted small">${esc(p.server)}</div></div>
      <button class="p-del" data-del="${i}" title="Sil">✕</button>
    </div>`).join('');
}
$('#savedProfiles').addEventListener('click', (e) => {
  const list = store.get('profiles', []);
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); list.splice(+del.dataset.del, 1); store.set('profiles', list); renderProfiles(); return; }
  const p = e.target.closest('.profile');
  if (p) { const a = list[+p.dataset.i]; $('#fServer').value = a.server; $('#fUser').value = a.user; $('#fPass').value = a.pass; login(a, true); }
});
$('#fServer').addEventListener('change', () => {
  const p = parseServerInput($('#fServer').value);
  if (p.user) { $('#fUser').value = p.user; $('#fPass').value = p.pass || ''; $('#fServer').value = p.server; }
});
$('#pwToggle').addEventListener('click', () => {
  const i = $('#fPass'); i.type = i.type === 'password' ? 'text' : 'password';
  $('#pwToggle').textContent = i.type === 'password' ? 'Göster' : 'Gizle';
});
$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = parseServerInput($('#fServer').value);
  login({ server: p.server, user: $('#fUser').value.trim() || p.user, pass: $('#fPass').value || p.pass }, $('#fRemember').checked);
});

async function login(a, remember) {
  const btn = $('#loginBtn'), err = $('#loginError');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Bağlanılıyor…';
  acct = a;
  try {
    let res, lastErr;
    const order = [a.ua, settings.ua, ...UAS].filter((x, i, arr) => x && arr.indexOf(x) === i);
    for (const ua of order) {
      await setUA(ua);
      try {
        btn.textContent = 'Bağlanılıyor…';
        res = await api();
        if (res && res.user_info) { a.ua = ua; break; }
      } catch (e) { lastErr = e; if (!e.status) break; }   // ağ hatasında diğer kimlikleri denemeye gerek yok
      res = null;
    }
    if (!res && lastErr) throw lastErr;
    if (!res || !res.user_info) throw new Error('Bu adreste Xtream Codes API bulunamadı');
    if (String(res.user_info.auth) !== '1') throw new Error('Kullanıcı adı veya şifre hatalı');
    if (res.user_info.status && res.user_info.status !== 'Active') throw new Error('Hesap durumu: ' + res.user_info.status);
    userInfo = res.user_info; serverInfo = res.server_info || {};
    if (remember) {
      const list = store.get('profiles', []).filter(p => !(p.server === a.server && p.user === a.user));
      list.unshift(a); store.set('profiles', list.slice(0, 10));
    }
    store.set('last', a);
    settings.ua = a.ua; store.set('settings', settings);
    favs = store.get(favKey(), { live: [], movie: [], series: [] });
    prog = store.get(progKey(), {});
    for (const k of Object.keys(cache)) delete cache[k];
    $('#login').hidden = true; $('#app').hidden = false;
    showSection('live');
  } catch (e) {
    acct = null;
    err.textContent = e.message === 'Failed to fetch' ? 'Sunucuya ulaşılamadı. URL\'yi ve internet bağlantınızı kontrol edin.' : e.message;
    err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Giriş yap'; }
}

function logout() {
  liveP.stop(); vodP.stop();
  acct = null; store.set('last', null);
  $('#account').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
  renderProfiles();
}

/* ---------------- Oynatıcı ---------------- */
class Player {
  constructor(video, msgEl) { this.v = video; this.msg = msgEl; this.hls = null; this.ts = null; this.onFail = null;
    video.addEventListener('playing', () => this.hide());
    video.addEventListener('waiting', () => this.show('Yükleniyor…'));
    video.addEventListener('error', () => this.fail('Video oynatılamadı'));
  }
  show(t) { this.msg.textContent = t; this.msg.classList.add('show'); }
  hide() { this.msg.classList.remove('show'); }
  fail(t) {
    if (this.onFail && this.onFail()) return;
    this.show(t + ' — "VLC\'de aç" düğmesini deneyin');
  }
  stop() {
    if (this.hls) { try { this.hls.destroy(); } catch {} this.hls = null; }
    if (this.ts) { try { this.ts.pause(); this.ts.unload(); this.ts.detachMediaElement(); this.ts.destroy(); } catch {} this.ts = null; }
    this.v.removeAttribute('src'); try { this.v.load(); } catch {}
    this.hide();
  }
  play(url, { live = false, startAt = 0 } = {}) {
    this.stop(); this.url = url; this.show('Yükleniyor…');
    const ext = (url.split('?')[0].match(/\.(\w+)$/) || [])[1]?.toLowerCase();
    const v = this.v;
    if (ext === 'm3u8' && window.Hls && Hls.isSupported()) {
      this.hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
      this.hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { this.hls.recoverMediaError(); return; }
        this.fail('Yayın açılamadı');
      });
      this.hls.loadSource(url); this.hls.attachMedia(v);
    } else if (ext === 'ts' && window.mpegts && mpegts.isSupported()) {
      this.ts = mpegts.createPlayer({ type: 'mpegts', isLive: live, url }, {
        enableWorker: false, lazyLoad: !live, liveBufferLatencyChasing: live, liveBufferLatencyMaxLatency: 8,
        liveBufferLatencyMinRemain: 2, enableStashBuffer: true, stashInitialSize: 384 * 1024
      });
      this.ts.attachMediaElement(v); this.ts.load();
      this.ts.on(mpegts.Events.ERROR, () => this.fail('Yayın açılamadı'));
    } else {
      v.src = url;
    }
    if (startAt > 0) v.addEventListener('loadedmetadata', () => { try { v.currentTime = startAt; } catch {} }, { once: true });
    const p = v.play(); if (p) p.catch(() => {});
  }
}
const liveP = new Player($('#liveVideo'), $('#liveMsg'));
const vodP = new Player($('#vodVideo'), $('#vodMsg'));

async function openExternal(url, title) {
  if (!window.dkip) { navigator.clipboard?.writeText(url); toast('Bağlantı kopyalandı'); return; }
  const r = await window.dkip.openExternal(url, title, settings.vlc);
  if (r.ok) toast('VLC açılıyor…');
  else toast('VLC bulunamadı. Yayın bağlantısı panoya kopyalandı.', 4000);
}

/* ---------------- Bölümler ---------------- */
let section = 'live', curCat = 'all', curItems = [], shown = 0;

$$('.rail-btn[data-section]').forEach(b => b.addEventListener('click', () => showSection(b.dataset.section)));

async function showSection(s) {
  section = s; curCat = store.get('cat:' + s, 'all');
  $$('.rail-btn[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === s));
  $('#sectionTitle').textContent = SECTIONS[s].title;
  $('#body').classList.toggle('is-live', s === 'live');
  $('#search').value = '';
  if (s !== 'live') liveP.stop(), resetLivePane();
  await loadSection(s);
}

async function loadSection(s, force = false) {
  const content = $('#content'), catsEl = $('#cats');
  if (!cache[s] || force) {
    catsEl.innerHTML = '';
    content.innerHTML = `<div class="loading"><div class="spinner"></div>${SECTIONS[s].title} yükleniyor…</div>`;
    try {
      const [cats, items] = await Promise.all([api(SECTIONS[s].cats), api(SECTIONS[s].items)]);
      cache[s] = { cats: Array.isArray(cats) ? cats : [], items: Array.isArray(items) ? items : [] };
    } catch (e) {
      content.innerHTML = `<div class="empty">Liste alınamadı: ${esc(e.message)}<br><br><button class="ghost" id="retry">Tekrar dene</button></div>`;
      $('#retry').onclick = () => loadSection(s, true);
      return;
    }
  }
  if (section !== s) return;
  renderCats(); renderItems();
}

function itemId(it) { return String(section === 'series' ? it.series_id : it.stream_id); }
function itemCats(it) { return (it.category_ids && it.category_ids.length) ? it.category_ids.map(String) : [String(it.category_id)]; }

function renderCats() {
  const { cats, items } = cache[section];
  const counts = {};
  for (const it of items) for (const c of itemCats(it)) counts[c] = (counts[c] || 0) + 1;
  const fav = favs[section] || [];
  const extra = section === 'live' ? [] : [{ id: 'recent', name: 'İzlemeye devam et' }];
  const html = [
    `<button class="cat ${curCat === 'all' ? 'active' : ''}" data-c="all"><span class="t">Tümü</span><span class="n">${items.length}</span></button>`,
    `<button class="cat ${curCat === 'fav' ? 'active' : ''}" data-c="fav"><span class="t">★ Favoriler</span><span class="n">${fav.length}</span></button>`,
    ...extra.map(x => `<button class="cat ${curCat === x.id ? 'active' : ''}" data-c="${x.id}"><span class="t">▶ ${x.name}</span></button>`),
    '<div class="cat-sep"></div>',
    ...cats.map(c => `<button class="cat ${curCat === String(c.category_id) ? 'active' : ''}" data-c="${esc(c.category_id)}">
        <span class="t">${esc(c.category_name)}</span><span class="n">${counts[String(c.category_id)] || 0}</span></button>`)
  ];
  $('#cats').innerHTML = html.join('');
}
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('.cat'); if (!b) return;
  curCat = b.dataset.c; store.set('cat:' + section, curCat);
  $$('.cat', $('#cats')).forEach(x => x.classList.toggle('active', x === b));
  $('#search').value = '';
  renderItems();
  $('#content').scrollTop = 0;
});

function filteredItems() {
  const { items } = cache[section];
  const q = norm($('#search').value.trim());
  let list;
  if (q) list = items.filter(it => norm(it.name).includes(q));         // arama tüm kategorilerde
  else if (curCat === 'all') list = items;
  else if (curCat === 'fav') { const f = new Set(favs[section] || []); list = items.filter(it => f.has(itemId(it))); }
  else if (curCat === 'recent') {
    const rec = Object.values(prog).filter(p => p.section === section).sort((a, b) => b.t - a.t);
    const byId = new Map(items.map(it => [itemId(it), it]));
    list = rec.map(r => byId.get(String(r.parent || r.id))).filter(Boolean);
    list = [...new Set(list)];
  }
  else list = items.filter(it => itemCats(it).includes(curCat));
  return list;
}

function renderItems() {
  curItems = filteredItems(); shown = 0;
  const content = $('#content');
  $('#status').textContent = `${curItems.length.toLocaleString('tr-TR')} içerik`;
  if (!curItems.length) {
    content.innerHTML = `<div class="empty">${curCat === 'fav' ? 'Henüz favori eklemediniz. ☆ simgesine tıklayarak ekleyebilirsiniz.' : 'İçerik bulunamadı.'}</div>`;
    return;
  }
  content.innerHTML = section === 'live' ? '<div id="list"></div>' : '<div class="grid" id="list"></div>';
  renderMore();
}

function renderMore() {
  const list = $('#list'); if (!list) return;
  const slice = curItems.slice(shown, shown + PAGE);
  const fav = new Set(favs[section] || []);
  const html = slice.map((it, i) => {
    const id = itemId(it); const isFav = fav.has(id);
    if (section === 'live') {
      return `<div class="chan ${String(liveCur?.stream_id) === id ? 'active' : ''}" data-id="${esc(id)}" role="button">
        <span class="chan-num">${shown + i + 1}</span>
        <img class="chan-logo" loading="lazy" src="${esc(it.stream_icon || '')}" onerror="this.style.visibility='hidden'">
        <span class="chan-name">${esc(it.name)}</span>
        <button class="star ${isFav ? 'on' : ''}" data-fav="${esc(id)}">${isFav ? '★' : '☆'}</button></div>`;
    }
    const img = section === 'series' ? it.cover : it.stream_icon;
    const rating = parseFloat(it.rating) || 0;
    const year = (it.releaseDate || it.release_date || it.year || '').toString().slice(0, 4);
    const p = section === 'movie' ? prog['movie:' + id] : null;
    const pct = p && p.d ? Math.min(100, (p.pos / p.d) * 100) : 0;
    return `<button class="card" data-id="${esc(id)}">
      <div class="poster">${img ? `<img loading="lazy" src="${esc(img)}" onerror="this.remove()">` : ''}<span>${img ? '' : 'Afiş yok'}</span></div>
      ${rating ? `<span class="rating">★ ${rating.toFixed(1)}</span>` : ''}
      <span class="star ${isFav ? 'on' : ''}" data-fav="${esc(id)}">${isFav ? '★' : '☆'}</span>
      ${pct > 1 ? `<div class="progress"><div style="width:${pct}%"></div></div>` : ''}
      <div class="title">${esc(it.name)}</div>
      <div class="meta">${esc(year)}</div>
    </button>`;
  }).join('');
  list.insertAdjacentHTML('beforeend', html);
  shown += slice.length;
}

$('#content').addEventListener('scroll', (e) => {
  const c = e.target;
  if (c.scrollTop + c.clientHeight > c.scrollHeight - 600 && shown < curItems.length) renderMore();
});

let searchT;
$('#search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(renderItems, 200); });

function toggleFav(id) {
  const arr = favs[section] = favs[section] || [];
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  store.set(favKey(), favs);
  return i < 0;
}

$('#content').addEventListener('click', (e) => {
  const f = e.target.closest('[data-fav]');
  if (f) {
    e.stopPropagation();
    const on = toggleFav(f.dataset.fav);
    f.classList.toggle('on', on); f.textContent = on ? '★' : '☆';
    if (section === 'live' && liveCur && String(liveCur.stream_id) === f.dataset.fav) updateLiveFav();
    renderCats();
    if (curCat === 'fav') renderItems();
    return;
  }
  const el = e.target.closest('[data-id]'); if (!el) return;
  const it = curItems.find(x => itemId(x) === el.dataset.id); if (!it) return;
  if (section === 'live') playLive(it);
  else if (section === 'movie') openMovie(it);
  else openSeries(it);
});

/* ---------------- Canlı TV ---------------- */
let liveCur = null, epgTimer = null, triedAlt = false;

function resetLivePane() {
  liveCur = null; clearInterval(epgTimer);
  $('#liveEmpty').hidden = false; $('#liveName').textContent = '—'; $('#liveLogo').src = ''; $('#epg').innerHTML = '';
}

function playLive(it) {
  liveCur = it; triedAlt = false;
  $$('.chan').forEach(c => c.classList.toggle('active', c.dataset.id === String(it.stream_id)));
  $('#liveEmpty').hidden = true;
  $('#liveName').textContent = it.name;
  $('#liveLogo').src = it.stream_icon || '';
  updateLiveFav();
  liveP.onFail = () => {               // bir format açılmazsa diğerini dene
    if (triedAlt || liveCur !== it) return false;
    triedAlt = true;
    const alt = settings.format === 'ts' ? 'm3u8' : 'ts';
    liveP.play(streamUrl('live', it.stream_id, alt), { live: true });
    return true;
  };
  liveP.play(streamUrl('live', it.stream_id), { live: true });
  loadEpg(it); clearInterval(epgTimer); epgTimer = setInterval(() => liveCur === it && loadEpg(it), 120000);
}

function updateLiveFav() {
  const on = liveCur && (favs.live || []).includes(String(liveCur.stream_id));
  $('#liveFav').textContent = on ? '★ Favoride' : '☆ Favori';
}

async function loadEpg(it) {
  const el = $('#epg');
  try {
    const r = await api('get_short_epg', { stream_id: it.stream_id, limit: 6 });
    if (liveCur !== it) return;
    const list = (r && r.epg_listings) || [];
    if (!list.length) { el.innerHTML = '<div class="muted small">Bu kanal için yayın akışı bilgisi yok.</div>'; return; }
    const now = Date.now() / 1000;
    el.innerHTML = list.map(p => {
      const st = +p.start_timestamp || Date.parse(p.start) / 1000;
      const en = +p.stop_timestamp || Date.parse(p.end || p.stop) / 1000;
      const isNow = st <= now && now < en;
      const pct = isNow ? ((now - st) / (en - st)) * 100 : 0;
      return `<div class="epg-item ${isNow ? 'now' : ''}">
        <div class="epg-time">${isNow ? 'ŞİMDİ · ' : ''}${fmtTime(new Date(st * 1000))} – ${fmtTime(new Date(en * 1000))}</div>
        <div class="epg-title">${esc(b64(p.title))}</div>
        ${p.description ? `<div class="epg-desc">${esc(b64(p.description))}</div>` : ''}
        ${isNow ? `<div class="epg-bar"><div style="width:${pct}%"></div></div>` : ''}
      </div>`;
    }).join('');
  } catch { if (liveCur === it) el.innerHTML = '<div class="muted small">Yayın akışı alınamadı.</div>'; }
}

function zap(dir) {
  if (!liveCur || !curItems.length) return;
  let i = curItems.findIndex(x => x.stream_id === liveCur.stream_id);
  i = (i + dir + curItems.length) % curItems.length;
  while (i >= shown) renderMore();
  playLive(curItems[i]);
  const el = $(`.chan[data-id="${CSS.escape(String(curItems[i].stream_id))}"]`);
  el && el.scrollIntoView({ block: 'nearest' });
}

function liveFullscreen() {
  const w = $('#liveVideoWrap');
  if (document.fullscreenElement) document.exitFullscreen(); else w.requestFullscreen().catch(() => {});
}
$('#liveVideoWrap').addEventListener('dblclick', liveFullscreen);
$('#liveFull').onclick = liveFullscreen;
$('#liveVlc').onclick = () => liveCur && openExternal(streamUrl('live', liveCur.stream_id), liveCur.name);
$('#liveFav').onclick = () => {
  if (!liveCur) return;
  toggleFav(String(liveCur.stream_id)); updateLiveFav(); renderCats();
  const s = $(`.chan[data-id="${CSS.escape(String(liveCur.stream_id))}"] .star`);
  if (s) { const on = favs.live.includes(String(liveCur.stream_id)); s.classList.toggle('on', on); s.textContent = on ? '★' : '☆'; }
};
function toggleMute() { const v = $('#liveVideo'); v.muted = !v.muted; toast(v.muted ? 'Ses kapalı' : 'Ses açık', 1000); }

/* ---------------- Film / Dizi detayları ---------------- */
function openModal(html) { $('#detailBody').innerHTML = html; $('#detail').hidden = false; $('#detail .modal-card').scrollTop = 0; }
$('#detailClose').onclick = () => $('#detail').hidden = true;
$('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') $('#detail').hidden = true; });

function heroHtml({ title, poster, backdrop, meta, plot, cast, actions }) {
  return `<div class="detail-hero" style="${backdrop ? `background-image:url('${esc(backdrop)}')` : ''}">
    ${poster ? `<img class="poster" src="${esc(poster)}" onerror="this.style.visibility='hidden'">` : '<div class="poster"></div>'}
    <div>
      <h2>${esc(title)}</h2>
      <div class="detail-meta">${meta.filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('')}</div>
      <div class="detail-plot">${esc(plot || 'Açıklama yok.')}</div>
      ${cast ? `<div class="detail-cast">${cast}</div>` : ''}
      <div class="detail-actions">${actions}</div>
    </div></div>`;
}

async function openMovie(it) {
  const id = String(it.stream_id);
  openModal(`<div class="loading"><div class="spinner"></div>Yükleniyor…</div>`);
  let info = {}, md = {};
  try { const r = await api('get_vod_info', { vod_id: id }); info = (r && r.info) || {}; md = (r && r.movie_data) || {}; } catch {}
  const ext = md.container_extension || it.container_extension || 'mp4';
  const url = streamUrl('movie', id, ext);
  const p = prog['movie:' + id];
  const canResume = p && p.pos > 30 && (!p.d || p.pos < p.d - 60);
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
  const rating = parseFloat(info.rating || it.rating) || 0;
  openModal(heroHtml({
    title: info.name || it.name,
    poster: info.movie_image || info.cover_big || it.stream_icon,
    backdrop,
    meta: [ (info.releasedate || info.release_date || '').slice(0, 4), info.duration, info.genre, rating ? '★ ' + rating.toFixed(1) : '', ext.toUpperCase() ],
    plot: info.plot || info.description,
    cast: [info.director && `<b>Yönetmen:</b> ${esc(info.director)}`, info.cast && `<b>Oyuncular:</b> ${esc(info.cast)}`].filter(Boolean).join('<br>'),
    actions: `${canResume ? `<button class="primary" id="mResume">▶ Devam et (${Math.floor(p.pos / 60)} dk)</button>` : ''}
      <button class="${canResume ? 'ghost' : 'primary'}" id="mPlay">▶ ${canResume ? 'Baştan izle' : 'İzle'}</button>
      <button class="ghost" id="mVlc">VLC'de aç</button>
      <button class="ghost" id="mFav">${(favs.movie || []).includes(id) ? '★ Favoride' : '☆ Favorilere ekle'}</button>`
  }));
  const start = (at) => { $('#detail').hidden = true; playVod({ url, title: info.name || it.name, key: 'movie:' + id, meta: { section: 'movie', id }, startAt: at }); };
  $('#mPlay').onclick = () => start(0);
  if (canResume) $('#mResume').onclick = () => start(p.pos);
  $('#mVlc').onclick = () => openExternal(url, it.name);
  $('#mFav').onclick = () => { const on = toggleFav(id); $('#mFav').textContent = on ? '★ Favoride' : '☆ Favorilere ekle'; renderCats(); renderItems(); };
}

async function openSeries(it) {
  const id = String(it.series_id);
  openModal(`<div class="loading"><div class="spinner"></div>Yükleniyor…</div>`);
  let r;
  try { r = await api('get_series_info', { series_id: id }); } catch (e) { openModal(`<div class="empty">Dizi bilgisi alınamadı: ${esc(e.message)}</div>`); return; }
  const info = (r && r.info) || {};
  const epsObj = (r && r.episodes) || {};
  const seasons = Object.keys(epsObj).sort((a, b) => +a - +b);
  const allEps = seasons.flatMap(s => (epsObj[s] || []).map(e => ({ ...e, season: s })));
  // en son izlenen bölümü bul
  const last = Object.values(prog).filter(p => p.section === 'series' && String(p.parent) === id).sort((a, b) => b.t - a.t)[0];
  let curSeason = last ? String(last.season) : seasons[0];
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
  const rating = parseFloat(info.rating || it.rating) || 0;
  const lastEp = last && allEps.find(e => String(e.id) === String(last.id));

  openModal(heroHtml({
    title: info.name || it.name,
    poster: info.cover || it.cover,
    backdrop,
    meta: [(info.releaseDate || info.release_date || '').slice(0, 4), info.genre, rating ? '★ ' + rating.toFixed(1) : '', `${seasons.length} sezon`],
    plot: info.plot,
    cast: [info.director && `<b>Yönetmen:</b> ${esc(info.director)}`, info.cast && `<b>Oyuncular:</b> ${esc(info.cast)}`].filter(Boolean).join('<br>'),
    actions: `${lastEp ? `<button class="primary" id="sResume">▶ Devam et: S${lastEp.season} B${lastEp.episode_num}</button>` : (allEps[0] ? '<button class="primary" id="sFirst">▶ İlk bölümü izle</button>' : '')}
      <button class="ghost" id="sFav">${(favs.series || []).includes(id) ? '★ Favoride' : '☆ Favorilere ekle'}</button>`
  }) + `<div class="seasons" id="seasons"></div><div class="episodes" id="episodes"></div>`);

  const playEp = (ep) => {
    const p = prog['ep:' + ep.id];
    const at = p && p.pos > 30 && (!p.d || p.pos < p.d - 60) ? p.pos : 0;
    $('#detail').hidden = true;
    const idx = allEps.indexOf(ep);
    playVod({
      url: streamUrl('series', ep.id, ep.container_extension || 'mp4'),
      title: `${info.name || it.name} — S${ep.season} B${ep.episode_num}${ep.title ? ' · ' + ep.title.replace(/^.*?-\s*S\d+E\d+\s*-\s*/i, '') : ''}`,
      key: 'ep:' + ep.id, meta: { section: 'series', id: ep.id, parent: id, season: ep.season }, startAt: at,
      next: allEps[idx + 1] ? () => playEp(allEps[idx + 1]) : null
    });
  };

  const renderSeason = () => {
    $('#seasons').innerHTML = seasons.map(s => `<button class="season ${s === curSeason ? 'active' : ''}" data-s="${esc(s)}">Sezon ${esc(s)}</button>`).join('');
    const eps = epsObj[curSeason] || [];
    $('#episodes').innerHTML = eps.length ? eps.map(ep => {
      const p = prog['ep:' + ep.id]; const pct = p && p.d ? Math.min(100, p.pos / p.d * 100) : 0;
      const img = ep.info && (ep.info.movie_image || ep.info.cover_big);
      return `<button class="ep" data-ep="${esc(ep.id)}">
        ${img ? `<img loading="lazy" src="${esc(img)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ep-ph'}))">` : '<div class="ep-ph"></div>'}
        <div class="ep-body">
          <div class="ep-title">${esc(ep.episode_num)}. ${esc(ep.title || 'Bölüm ' + ep.episode_num)}</div>
          <div class="muted small">${esc((ep.info && ep.info.duration) || '')}</div>
          ${ep.info && ep.info.plot ? `<div class="ep-plot">${esc(ep.info.plot)}</div>` : ''}
          ${pct > 1 ? `<div class="ep-progress"><div style="width:${pct}%"></div></div>` : ''}
        </div></button>`;
    }).join('') : '<div class="empty">Bu sezonda bölüm yok.</div>';
  };
  renderSeason();
  $('#seasons').onclick = (e) => { const b = e.target.closest('.season'); if (b) { curSeason = b.dataset.s; renderSeason(); } };
  $('#episodes').onclick = (e) => { const b = e.target.closest('.ep'); if (b) { const ep = allEps.find(x => String(x.id) === b.dataset.ep); ep && playEp(ep); } };
  if (lastEp) $('#sResume').onclick = () => playEp(lastEp);
  else if (allEps[0]) $('#sFirst').onclick = () => playEp(allEps[0]);
  $('#sFav').onclick = () => { const on = toggleFav(id); $('#sFav').textContent = on ? '★ Favoride' : '☆ Favorilere ekle'; renderCats(); renderItems(); };
}

/* ---------------- Film/Dizi oynatıcı ---------------- */
let vodCur = null, saveT = 0, idleT;
function playVod(o) {
  vodCur = o;
  liveP.stop();
  $('#player').hidden = false;
  $('#playerTitle').textContent = o.title;
  $('#playerNext').hidden = !o.next;
  vodP.onFail = null;
  vodP.play(o.url, { startAt: o.startAt || 0 });
  if (o.startAt) toast('Kaldığınız yerden devam ediliyor');
  bumpIdle();
}
function saveProgress(force) {
  const v = $('#vodVideo');
  if (!vodCur || !v.duration || !isFinite(v.duration)) return;
  if (!force && Date.now() - saveT < 5000) return;
  saveT = Date.now();
  prog[vodCur.key] = { ...vodCur.meta, pos: Math.floor(v.currentTime), d: Math.floor(v.duration), t: Date.now() };
  if (v.duration - v.currentTime < 60) prog[vodCur.key].pos = 0, prog[vodCur.key].done = true;
  store.set(progKey(), prog);
}
$('#vodVideo').addEventListener('timeupdate', () => saveProgress(false));
$('#vodVideo').addEventListener('ended', () => { saveProgress(true); if (vodCur && vodCur.next) { toast('Sonraki bölüm başlıyor'); vodCur.next(); } });
function closePlayer() {
  saveProgress(true); vodP.stop(); vodCur = null;
  if (document.fullscreenElement) document.exitFullscreen();
  $('#player').hidden = true;
  if (section !== 'live') renderItems();
  else if (liveCur) playLive(liveCur);
}
$('#playerBack').onclick = closePlayer;
$('#playerVlc').onclick = () => { if (vodCur) { saveProgress(true); vodP.v.pause(); openExternal(vodCur.url, vodCur.title); } };
$('#playerNext').onclick = () => { if (vodCur && vodCur.next) { saveProgress(true); vodCur.next(); } };
$('#playerFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else $('#player').requestFullscreen().catch(() => {}); };
$('#vodVideo').addEventListener('dblclick', () => $('#playerFull').click());
function bumpIdle() { $('#player').classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => $('#player').classList.add('idle'), 3000); }
$('#player').addEventListener('mousemove', bumpIdle);

/* ---------------- Hesap penceresi ---------------- */
$('#btnAccount').onclick = async () => {
  const u = userInfo || {};
  const exp = u.exp_date && +u.exp_date ? new Date(+u.exp_date * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sınırsız';
  $('#accountBody').innerHTML = `<div class="kv">
    <div>Sunucu</div><div>${esc(acct.server)}</div>
    <div>Kullanıcı</div><div>${esc(u.username || acct.user)}</div>
    <div>Durum</div><div>${esc(u.status || '—')}</div>
    <div>Bitiş tarihi</div><div>${esc(exp)}</div>
    <div>Bağlantı</div><div>${esc(u.active_cons ?? '?')} / ${esc(u.max_connections ?? '?')}</div>
    <div>Formatlar</div><div>${esc((u.allowed_output_formats || []).join(', ') || '—')}</div>
  </div>`;
  $('#setFormat').value = settings.format;
  $('#setVlc').value = settings.vlc;
  if (window.dkip) $('#versionInfo').textContent = 'DKIP sürüm ' + await window.dkip.version();
  $('#account').hidden = false;
};
$('#accountClose').onclick = () => $('#account').hidden = true;
$('#account').addEventListener('click', (e) => { if (e.target.id === 'account') $('#account').hidden = true; });
$('#setFormat').onchange = () => { settings.format = $('#setFormat').value; store.set('settings', settings); if (liveCur) playLive(liveCur); };
$('#setVlc').onchange = () => { settings.vlc = $('#setVlc').value.trim(); store.set('settings', settings); };
$('#btnLogout').onclick = logout;
$('#btnReload').onclick = () => { for (const k of Object.keys(cache)) delete cache[k]; $('#account').hidden = true; loadSection(section, true); };

/* ---------------- Klavye ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (!$('#player').hidden) {
    const v = $('#vodVideo');
    if (e.key === 'Escape' && !document.fullscreenElement) closePlayer();
    else if (e.key === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (e.key === 'ArrowRight') v.currentTime += 10;
    else if (e.key === 'ArrowLeft') v.currentTime -= 10;
    else if (e.key === 'ArrowUp') { e.preventDefault(); v.volume = Math.min(1, v.volume + .1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); v.volume = Math.max(0, v.volume - .1); }
    else if (e.key.toLowerCase() === 'f') $('#playerFull').click();
    else if (e.key.toLowerCase() === 'n' && vodCur?.next) vodCur.next();
    bumpIdle();
    return;
  }
  if (e.key === 'Escape') { $('#detail').hidden = true; $('#account').hidden = true; return; }
  if (!$('#detail').hidden || !$('#account').hidden) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); return; }
  if (section === 'live') {
    if (e.key === 'ArrowDown') { e.preventDefault(); zap(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); zap(-1); }
    else if (e.key.toLowerCase() === 'f') liveFullscreen();
    else if (e.key.toLowerCase() === 'm') toggleMute();
  }
  if (e.key === '1') showSection('live');
  if (e.key === '2') showSection('movie');
  if (e.key === '3') showSection('series');
});

/* ---------------- Başlangıç ---------------- */
renderProfiles();
const last = store.get('last', null);
if (last && last.server) {
  $('#fServer').value = last.server; $('#fUser').value = last.user; $('#fPass').value = last.pass;
  login(last, false);
}
