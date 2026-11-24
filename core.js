'use strict';
/* Kundengewinnen – Daten, Hilfsfunktionen, Login */

const AUTH_HASH = '284a1aee9a51fcdbef10fbb9f4ff39c93d3e6c5008d5b9f345becd47d37d9fe0';
const STORE_KEY = 'kg_data_v1';
const SESSION_KEY = 'kg_session';
const STAGES = ['Kontaktiert', 'Demo bauen', 'Demo fertig (anrufen)', 'Angebot gesendet', 'Verhandlung'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const DASH = '<span class="dash">–</span>';
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/* ---------- Speicher ---------- */
let db = loadDb();
function loadDb() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.leads) && Array.isArray(d.deals)) return d;
  } catch { /* leer */ }
  return { leads: [], deals: [] };
}
function saveDb() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
function findItem(type, id) { return (type === 'lead' ? db.leads : db.deals).find((x) => x.id === id); }

/* ---------- Login ---------- */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const normName = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
async function checkLogin(name, pass) { return (await sha256(normName(name) + ':' + pass.trim())) === AUTH_HASH; }
const isLoggedIn = () => localStorage.getItem(SESSION_KEY) === AUTH_HASH;

/* ---------- Datum / Rückruf ---------- */
function toLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayDiff(d) { return Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5); }
function fmtDate(d) { return `${WD[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() : ''}`; }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtStamp(iso) { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${fmtTime(d)}`; }

function cbStatus(s) {
  if (!s) return 'none';
  const d = new Date(s);
  if (d < new Date()) return 'overdue';
  const diff = dayDiff(d);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}
function cbLabel(s) {
  if (!s) return '+ Rückruf planen';
  const d = new Date(s), st = cbStatus(s), diff = dayDiff(d);
  const day = diff === 0 ? 'heute' : diff === -1 ? 'gestern' : diff === 1 ? 'morgen' : fmtDate(d);
  if (st === 'overdue') return `⚠ Überfällig · ${day} ${fmtTime(d)}`;
  if (st === 'today') return `📞 Heute ${fmtTime(d)}`;
  if (st === 'tomorrow') return `Morgen ${fmtTime(d)}`;
  return `${fmtDate(d)} ${fmtTime(d)}`;
}
function presetDate(key) {
  const d = new Date();
  switch (key) {
    case '1h': d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); break;
    case '3h': d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 3); break;
    case 'tom': d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); break;
    case '3d': d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0); break;
    case 'nw': d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(10, 0, 0, 0); break;
    case '2w': d.setDate(d.getDate() + 14); d.setHours(10, 0, 0, 0); break;
  }
  // Wochenende überspringen (außer bei Stunden-Presets)
  if (!['1h', '3h'].includes(key)) { while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); }
  return toLocal(d);
}
const PRESETS = [['1h', 'In 1 Std.'], ['3h', 'In 3 Std.'], ['tom', 'Morgen 10:00'], ['3d', 'In 3 Tagen'], ['nw', 'Nächste Woche'], ['2w', 'In 2 Wochen']];

/* ---------- Links ---------- */
const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');
const urlHref = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const shortUrl = (u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

/* ---------- Notizen ---------- */
function sortedNotes(item) {
  return [...(item.notes || [])].sort((a, b) => (b.pinned - a.pinned) || (b.date > a.date ? 1 : -1));
}
function mainNote(item) { return sortedNotes(item).find((n) => !n.system) || null; }
function addNote(item, text, system = false) {
  item.notes = item.notes || [];
  item.notes.push({ id: uid(), text, date: new Date().toISOString(), pinned: false, system });
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0];
  const delim = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function csvToLeads(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const used = new Set();
  const pick = (re) => { const i = head.findIndex((h, idx) => !used.has(idx) && re.test(h)); if (i >= 0) used.add(i); return i; };
  const col = {};
  col.email = pick(/e-?mail/);
  col.phone = pick(/telefon|phone|handy|mobil|\btel\b/);
  col.website = pick(/website|webseite|homepage|url|\bweb\b/);
  col.note = pick(/notiz|note|bemerkung|kommentar/);
  col.name = pick(/titel|title|firma|organisation|organization|unternehmen/);
  col.contact = pick(/ansprechpartner|person|kontakt|name/);
  if (col.name < 0) { col.name = col.contact; col.contact = -1; }
  if (col.name < 0) col.name = pick(/lead/);
  return rows.slice(1).map((r) => {
    const g = (k) => (col[k] >= 0 ? (r[col[k]] || '').trim() : '');
    const lead = { id: uid(), name: g('name') || g('contact'), phone: g('phone'), website: g('website'), email: g('email'), callback: null, notes: [], created: new Date().toISOString() };
    if (g('contact') && g('name')) addNote(lead, 'Ansprechpartner: ' + g('contact'));
    if (g('note')) addNote(lead, g('note'));
    return lead;
  }).filter((l) => l.name || l.phone || l.email);
}

/* ---------- Download ---------- */
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
