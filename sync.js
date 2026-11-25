'use strict';
/* Kundengewinnen – Abgleich zwischen Geräten über ein privates GitHub-Repo */

const SYNC_CFG = { owner: 'moritzkottmus1234-ship-it', repo: 'kundengewinnen-daten', path: 'data.json' };
const TOKEN_KEY = 'kg_sync_token';
// Vorausgefülltes GitHub-Formular (Name, Ablauf 1 Jahr, nur Lese-/Schreibrecht auf Dateien)
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=Kundengewinnen&description=Abgleich+der+Kundengewinnen-App+(nur+Repo+kundengewinnen-daten)&target_name=moritzkottmus1234-ship-it&expires_in=365&contents=write';

const Sync = (() => {
  let timer = null, running = false, again = false;
  let status = 'off', lastOk = null, lastErr = '';
  const listeners = [];

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const enabled = () => !!token();
  const base = `https://api.github.com/repos/${SYNC_CFG.owner}/${SYNC_CFG.repo}`;

  function headers(accept = 'application/vnd.github+json', json = false) {
    return { Authorization: 'Bearer ' + token(), Accept: accept, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  function errText(code) {
    if (code === 401) return 'Schlüssel ungültig oder abgelaufen';
    if (code === 403) return 'Schlüssel hat keine Berechtigung (Contents: Read and write nötig)';
    if (code === 404) return 'Daten-Repo nicht gefunden – Schlüssel muss für „kundengewinnen-daten“ freigegeben sein';
    if (code === 0) return 'Keine Internetverbindung';
    return 'GitHub-Fehler ' + code;
  }
  async function call(url, opts = {}) {
    let r;
    try { r = await fetch(url, { cache: 'no-store', ...opts }); } catch { const e = new Error(errText(0)); e.code = 0; throw e; }
    return r;
  }
  const b64e = (s) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  async function getRemote() {
    const url = `${base}/contents/${SYNC_CFG.path}?t=${Date.now()}`;
    const r = await call(url, { headers: headers() });
    if (r.status === 404) {
      // Datei fehlt noch (erster Abgleich) – oder Repo nicht erreichbar?
      const rr = await call(base, { headers: headers() });
      if (!rr.ok) { const e = new Error(errText(rr.status)); e.code = rr.status; throw e; }
      return { data: null, sha: null };
    }
    if (!r.ok) { const e = new Error(errText(r.status)); e.code = r.status; throw e; }
    const j = await r.json();
    let text = j.content ? b64d(j.content) : '';
    if (!text && j.size > 0) { // > 1 MB: Rohinhalt separat laden
      const raw = await call(url, { headers: headers('application/vnd.github.raw+json') });
      text = await raw.text();
    }
    return { data: text ? JSON.parse(text) : null, sha: j.sha };
  }

  /* Zusammenführen: pro Eintrag gewinnt die neuere Änderung, Löschungen gewinnen, wenn sie neuer sind */
  function merge(local, remote) {
    if (!remote) return local;
    const deleted = { ...(remote.deleted || {}) };
    for (const [id, ts] of Object.entries(local.deleted || {})) deleted[id] = Math.max(ts, deleted[id] || 0);
    const pick = (la, ra) => {
      const m = new Map();
      for (const it of ra || []) m.set(it.id, it);
      for (const it of la || []) { const o = m.get(it.id); if (!o || (it.updated || 0) > (o.updated || 0)) m.set(it.id, it); }
      return [...m.values()].filter((it) => !(deleted[it.id] && deleted[it.id] >= (it.updated || 0)));
    };
    // Grabsteine älter als 180 Tage aufräumen
    const limit = Date.now() - 180 * 864e5;
    for (const id in deleted) if (deleted[id] < limit) delete deleted[id];
    const deals = pick(local.deals, remote.deals);
    const lists = pick(local.lists, remote.lists);
    return { ...remote, ...local, leads: dedupe(pick(local.leads, remote.leads), deals), deals, lists, deleted };
  }

  /* Doppelte Firmen (gleicher Name + Telefon, z. B. auf zwei Geräten importiert) zusammenfassen.
     Gewinner: neuere Änderung → mehr Notizen/Rückruf → feste Reihenfolge (damit alle Geräte gleich entscheiden). */
  const dupKey = (it) => ((it.name || '') + '|' + (it.phone || '')).trim().toLowerCase();
  const richness = (it) => (it.notes || []).filter((n) => !n.system).length + (it.callback ? 2 : 0);
  const better = (a, b) => ((a.updated || 0) - (b.updated || 0)) || (richness(a) - richness(b)) || (a.id < b.id ? 1 : -1);
  function dedupe(leads, deals) {
    const dealKeys = new Set(deals.map(dupKey));
    const m = new Map();
    for (const l of leads) {
      const k = dupKey(l);
      if (k === '|') { m.set('#' + l.id, l); continue; }
      if (dealKeys.has(k)) continue; // ist schon ein Deal geworden
      const o = m.get(k);
      if (!o || better(l, o) > 0) m.set(k, l);
    }
    return [...m.values()];
  }

  function setStatus(s, err = '') {
    status = s; lastErr = err;
    if (s === 'ok') lastOk = new Date();
    listeners.forEach((f) => f());
  }

  async function run() {
    if (!enabled()) { setStatus('off'); return; }
    if (running) { again = true; return; }
    running = true; setStatus('busy');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await getRemote();
        const before = JSON.stringify(db);
        const merged = merge(db, remote.data);
        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== before) { replaceDb(JSON.parse(mergedStr)); onRemoteChange(); }
        if (remote.data && mergedStr === JSON.stringify(remote.data)) break; // nichts hochzuladen
        const r = await call(`${base}/contents/${SYNC_CFG.path}`, {
          method: 'PUT', headers: headers('application/vnd.github+json', true),
          body: JSON.stringify({ message: 'Daten aktualisiert', content: b64e(mergedStr), ...(remote.sha ? { sha: remote.sha } : {}) }),
        });
        if (r.ok) break;
        if (r.status === 409 || r.status === 422) continue; // gleichzeitig von anderem Gerät gespeichert → neu laden
        const e = new Error(errText(r.status)); e.code = r.status; throw e;
      }
      setStatus('ok');
    } catch (e) {
      setStatus('error', e.message || String(e));
    } finally {
      running = false;
      if (again) { again = false; schedule(300); }
    }
  }

  let pendingRender = false;
  function onRemoteChange() {
    const busy = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || !$('#modal').hidden || !$('#popover').hidden;
    if (busy) { pendingRender = true; updateCounts(); } else render();
  }
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { if (pendingRender && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { pendingRender = false; render(); } }, 200); });

  function schedule(ms = 1500) {
    if (!enabled()) return;
    clearTimeout(timer); timer = setTimeout(run, ms);
  }

  async function connect(newToken) {
    const t = newToken.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) throw new Error('Das sieht nicht nach einem GitHub-Schlüssel aus (beginnt mit github_pat_ …)');
    const r = await call(base, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(errText(r.status));
    localStorage.setItem(TOKEN_KEY, t);
    await run();
    if (status === 'error') throw new Error(lastErr);
  }
  function disconnect() { localStorage.removeItem(TOKEN_KEY); setStatus('off'); }

  function start() {
    if (enabled()) run(); else setStatus('off');
    setInterval(() => { if (document.visibilityState === 'visible') run(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
    window.addEventListener('online', () => run());
  }

  return {
    start, schedule, run, connect, disconnect, enabled,
    onChange: (f) => listeners.push(f),
    get status() { return status; }, get lastOk() { return lastOk; }, get lastErr() { return lastErr; },
  };
})();
