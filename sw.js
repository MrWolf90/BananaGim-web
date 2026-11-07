/* Banana Gim service worker: offline app + reminders (Web Push) */
const CACHE = 'bananagim-37';
const CORE = ['./', './index.html', './app.enc', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (fresh updates), cache when offline
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});

// ---------- IndexedDB (same store as the page)
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open('bananagim', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k){ const db = await idb(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
async function kvSet(k, v){ const db = await idb(); return new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }

// The server only says "ping": the reminder texts are on the phone.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const now = Date.now();
    let data = {}; try { data = e.data ? e.data.json() : {}; } catch (err) {}
    const list = (await kvGet('reminders')) || [];
    const shown = (await kvGet('shown')) || [];
    const key = r => r.id + '@' + r.at;
    let due = list.filter(r => r.at <= now + 90e3 && r.at > now - 15 * 60e3 && !shown.includes(key(r)));
    const test = await kvGet('test');
    if (data.test || (test && Math.abs(test.at - now) < 5 * 60e3 && !due.length)) { due = [{ id: 6998, at: test ? test.at : now, title: '⏰ 1-minute test', text: 'It works! Reminders reach you even with the phone locked.' }]; await kvSet('test', null); }
    if (!due.length) due = [{ id: 0, at: now, title: '🍌 Banana Gim', text: 'Yoshi has something for you. Open the app.' }]; // iPhone: every push must show something
    const log = (await kvGet('delivered')) || [];
    for (const r of due.slice(0, 4)) {
      await self.registration.showNotification(r.title, { body: r.text || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'bg-' + key(r), data: { url: './' } });
      shown.push(key(r)); log.push({ id: r.id, at: r.at, t: Date.now(), title: r.title });
    }
    await kvSet('shown', shown.slice(-300)); await kvSet('delivered', log.slice(-80));
    (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage({ type: 'delivered' }));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs[0]; return c ? c.focus() : self.clients.openWindow('./'); }));
});
