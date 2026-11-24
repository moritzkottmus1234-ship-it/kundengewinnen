'use strict';
/* Kundengewinnen – Aktionen & Ereignisse */

function toast(msg, alert = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (alert ? ' alert' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), alert ? 7000 : 3200);
}
/* ---------- Abgleich (Handy/PC) ---------- */
function syncStateText() {
  const s = Sync.status;
  if (!Sync.enabled()) return { cls: 'off', txt: '☁ Abgleich einrichten', long: 'Nicht eingerichtet – Daten liegen nur auf diesem Gerät.' };
  if (s === 'busy') return { cls: 'busy', txt: '⏳ Speichert …', long: 'Wird gerade abgeglichen …' };
  if (s === 'error') return { cls: 'error', txt: '⚠ Abgleich-Fehler', long: 'Fehler: ' + Sync.lastErr };
  const t = Sync.lastOk ? fmtTime(Sync.lastOk) : '';
  return { cls: 'ok', txt: '☁ Abgeglichen ' + t, long: `Alles gespeichert und abgeglichen (zuletzt ${t} Uhr).` };
}
function updateSyncBadge() {
  const st = syncStateText(), b = $('#syncBadge');
  b.className = 'sync-badge ' + st.cls; b.textContent = st.txt; b.title = st.long;
  const m = $('#syncStateLine'); if (m) m.textContent = st.long;
}
function syncModal() {
  if (Sync.enabled()) {
    openModal(`<h2>☁ Abgleich zwischen Handy und PC</h2>
      <div class="modal-body">
        <div class="box" id="syncStateLine">${esc(syncStateText().long)}</div>
        <p class="muted">Jede Änderung wird automatisch in deinem privaten GitHub-Repo „${SYNC_CFG.repo}“ gespeichert. Alle Geräte, auf denen der Schlüssel eingetragen ist, sehen dieselben Leads und Deals.</p>
        <div class="row"><button class="btn btn-primary" data-act="syncNow">Jetzt abgleichen</button><button class="btn btn-danger" data-act="syncOff">Auf diesem Gerät trennen</button></div>
        <hr style="border:0;border-top:1px solid var(--line);width:100%">
        <div class="row"><button class="btn" data-act="backup">⬇ Backup sichern</button><button class="btn" data-act="restore">⬆ Backup laden</button><button class="btn" data-act="logout">⎋ Abmelden</button></div>
      </div>
      <div class="modal-foot"><button class="btn" data-act="closeModal">Schließen</button></div>`);
    return;
  }
  openModal(`<h2>☁ Abgleich zwischen Handy und PC einrichten</h2>
    <div class="modal-body">
      <p>Damit Handy und PC dieselben Leads sehen, speichert die App alles in deinem <b>privaten</b> GitHub-Repo „${SYNC_CFG.repo}“. Dafür brauchst du <b>einmalig</b> einen Zugangsschlüssel:</p>
      <ol>
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener"><b>Hier bei GitHub einen neuen Schlüssel anlegen</b></a> (angemeldet als ${SYNC_CFG.owner}).</li>
        <li><b>Token name:</b> Kundengewinnen – <b>Expiration:</b> z. B. 1 Jahr.</li>
        <li><b>Repository access:</b> „Only select repositories“ → <b>${SYNC_CFG.repo}</b> auswählen.</li>
        <li><b>Permissions → Repository permissions → Contents:</b> auf „Read and write“ stellen.</li>
        <li>Ganz unten <b>„Generate token“</b> klicken und den Schlüssel (beginnt mit <code>github_pat_</code>) kopieren.</li>
      </ol>
      <label>Schlüssel hier einfügen<input id="syncToken" type="password" autocomplete="off" placeholder="github_pat_…"></label>
      <p class="muted">Auf jedem Gerät (PC, Handy) einmal eintragen. Tipp: Schlüssel in deinen Notizen oder im Passwort-Manager speichern, dann kannst du ihn am Handy einfach einfügen.</p>
      <p class="error" id="syncError" hidden></p>
    </div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Abbrechen</button><button class="btn btn-primary" data-act="syncConnect">Verbinden</button></div>`);
}
async function syncConnect() {
  const btn = $('[data-act="syncConnect"]'), err = $('#syncError');
  btn.disabled = true; btn.textContent = 'Verbinde …'; err.hidden = true;
  try {
    await Sync.connect($('#syncToken').value);
    closeModal(); render();
    toast(`☁ Abgleich eingerichtet – ${db.leads.length} Leads, ${db.deals.length} Deals`);
  } catch (e) {
    err.textContent = e.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Verbinden';
  }
}

let lastDeleted = null;
function toastUndo(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${esc(msg)}<button class="undo" data-act="undoDelete">Rückgängig</button>`;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 8000);
}
function commit(msg) { saveDb(); render(); if (msg) toast(msg); }

/* ---------- Popover (Rückruf) ---------- */
function closePopover() { $('#popover').hidden = true; }
function openCbPopover(btn, type, id) {
  const it = findItem(type, id); if (!it) return;
  const p = $('#popover');
  p.innerHTML = `<div class="pop">
    <h4>Rückruf · ${esc(it.title || it.name || '')}</h4>
    ${presetButtons(type, id)}
    <div class="dt-row"><input type="datetime-local" id="popCbInput" value="${it.callback || ''}"><button class="btn" data-act="cbSetInput" data-input="popCbInput" data-type="${type}" data-id="${id}">Setzen</button></div>
    ${it.callback ? `
      <textarea id="popNote" placeholder="Gesprächsnotiz (optional) …"></textarea>
      <div class="row"><button class="btn btn-deal" data-act="cbDone" data-type="${type}" data-id="${id}">✓ Angerufen / erledigt</button>
      <button class="btn btn-ghost" data-act="cbClear" data-type="${type}" data-id="${id}">Entfernen</button></div>` : ''}
  </div>`;
  p.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = r.left + window.scrollX;
  if (left + w > window.scrollX + document.documentElement.clientWidth - 8) left = window.scrollX + document.documentElement.clientWidth - w - 8;
  let top = r.bottom + window.scrollY + 6;
  if (r.bottom + h + 6 > window.innerHeight && r.top - h - 6 > 0) top = r.top + window.scrollY - h - 6;
  p.style.left = Math.max(8, left) + 'px';
  p.style.top = top + 'px';
}

/* ---------- Rückruf-Aktionen ---------- */
function setCallback(type, id, value) {
  const it = findItem(type, id); if (!it) return;
  it.callback = value || null;
  it.notifiedFor = null;
  closePopover();
  commit(value ? 'Rückruf: ' + cbLabel(value) : 'Rückruf entfernt');
}
function callbackDone(type, id) {
  const it = findItem(type, id); if (!it) return;
  const note = ($('#popover').hidden ? '' : ($('#popNote')?.value || '')).trim();
  const was = it.callback;
  if (note) addNote(it, note);
  addNote(it, `✓ Rückruf erledigt${was ? ' (geplant: ' + fmtStamp(was) + ')' : ''}`, true);
  it.callback = null;
  closePopover();
  commit('Rückruf erledigt – gleich den nächsten planen?');
  if (state.detail && state.detail.id === id) return;
  openDetail(type, id);
}

/* ---------- Modals ---------- */
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-card">${html}</div>`; m.hidden = false; const f = m.querySelector('input,textarea'); if (f) f.focus(); }

function newLeadModal() {
  openModal(`<h2>Neuer Lead</h2>
    <form id="leadForm" class="form">
      <label>Name *<input name="name" required placeholder="z. B. Trattoria da Mario"></label>
      <label>Stadt<input name="city" list="cityOptions" placeholder="z. B. Köln" value="${esc(state.city)}"></label>
      <label>Telefon<input name="phone" type="tel"></label>
      <label>E-Mail<input name="email" type="email"></label>
      <label class="full">Website<input name="website" placeholder="www.beispiel.de"></label>
      <label class="full">Notiz<textarea name="note" placeholder="Was wurde besprochen?"></textarea></label>
      <label class="full">Rückruf
        <select name="cbPreset"><option value="">Kein Rückruf</option>${PRESETS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="custom">Eigenes Datum …</option></select>
      </label>
      <label class="full" id="cbCustomWrap" hidden>Datum & Uhrzeit<input name="cbCustom" type="datetime-local"></label>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Abbrechen</button><button class="btn btn-primary" data-act="saveLead">Lead speichern</button></div>`);
  $('#leadForm [name=cbPreset]').addEventListener('change', (e) => { $('#cbCustomWrap').hidden = e.target.value !== 'custom'; });
}
function saveLead() {
  const f = $('#leadForm'); if (!f.reportValidity()) return;
  const v = Object.fromEntries(new FormData(f));
  const lead = { id: uid(), name: v.name.trim(), city: v.city.trim(), phone: v.phone.trim(), email: v.email.trim(), website: v.website.trim(), notes: [], created: new Date().toISOString(),
    callback: v.cbPreset === 'custom' ? (v.cbCustom || null) : v.cbPreset ? presetDate(v.cbPreset) : null };
  if (v.note.trim()) addNote(lead, v.note.trim());
  db.leads.push(lead);
  closeModal();
  commit('Lead angelegt');
}

function convertModal(id) {
  const l = findItem('lead', id); if (!l) return;
  openModal(`<h2>Lead in Deal umwandeln</h2>
    <form id="dealForm" class="form" data-id="${id}">
      <label class="full">Deal-Titel<input name="title" value="${esc(l.name)}" required></label>
      <label>Wert (€)<input name="value" type="number" min="0" step="50" placeholder="0"></label>
      <label>Phase<select name="stage">${STAGES.map((s, i) => `<option value="${i}">${esc(s)}</option>`).join('')}</select></label>
      <p class="muted full" style="margin:0;grid-column:1/-1">Kontaktdaten, Notizen und Rückruf werden übernommen. Der Lead verschwindet aus der Lead-Liste.</p>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Abbrechen</button><button class="btn btn-primary" data-act="saveConvert">In Deal umwandeln</button></div>`);
}
function saveConvert() {
  const f = $('#dealForm'); if (!f.reportValidity()) return;
  const l = findItem('lead', f.dataset.id); if (!l) return;
  const v = Object.fromEntries(new FormData(f));
  const deal = { ...l, id: uid(), title: v.title.trim(), value: Number(v.value) || 0, stage: Number(v.stage), status: 'open', created: new Date().toISOString(), fromLead: l.created, notes: [...(l.notes || [])] };
  addNote(deal, `Aus Lead umgewandelt (Lead angelegt am ${fmtStamp(l.created)})`, true);
  db.deals.push(deal);
  db.leads = db.leads.filter((x) => x.id !== l.id);
  closeModal();
  state.view = 'deals'; state.dealTab = 'open'; state.detail = { type: 'deal', id: deal.id };
  commit('🎉 Deal erstellt: ' + deal.title);
}

/* ---------- Detail ---------- */
function openDetail(type, id, focusNote = false) {
  state.detail = { type, id };
  renderDrawer();
  if (focusNote) setTimeout(() => $('#noteText')?.focus(), 30);
}
function closeDrawer() { state.detail = null; renderDrawer(); }
function currentItem() { return state.detail && findItem(state.detail.type, state.detail.id); }

/* ---------- Klicks ---------- */
document.addEventListener('click', (e) => {
  const pop = $('#popover');
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-act="cb"]')) closePopover();

  const nav = e.target.closest('.nav-item[data-view]');
  if (nav) { state.view = nav.dataset.view; state.filter = 'all'; state.search = ''; closePopover(); render(); window.scrollTo(0, 0); return; }

  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, type, id } = el.dataset;
  const it = currentItem();
  switch (act) {
    case 'go': state.view = el.dataset.view; render(); break;
    case 'filter': state.filter = el.dataset.filter; render(); break;
    case 'syncSetup': closePopover(); syncModal(); break;
    case 'syncConnect': syncConnect(); break;
    case 'syncNow': Sync.run(); break;
    case 'syncOff': if (confirm('Abgleich auf diesem Gerät trennen? Die Daten bleiben auf diesem Gerät und im Repo erhalten.')) { Sync.disconnect(); closeModal(); toast('Abgleich getrennt'); } break;
    case 'rowDelete': {
      // 1. Klick: Knopf wird rot „Löschen?“ – 2. Klick: wirklich löschen
      if (!el.classList.contains('armed')) {
        $$('.btn-del.armed').forEach((b) => { b.classList.remove('armed'); b.textContent = '🗑'; });
        el.classList.add('armed'); el.textContent = 'Löschen?';
        clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove('armed'); el.textContent = '🗑'; }, 4000);
        break;
      }
      const idx = db.leads.findIndex((x) => x.id === id); if (idx < 0) break;
      const [gone] = db.leads.splice(idx, 1);
      lastDeleted = { lead: gone, idx };
      if (state.detail && state.detail.id === id) state.detail = null;
      saveDb(); render();
      toastUndo(`„${gone.name || 'Lead'}“ gelöscht`);
      break;
    }
    case 'undoDelete': {
      if (!lastDeleted) break;
      db.leads.splice(Math.min(lastDeleted.idx, db.leads.length), 0, lastDeleted.lead);
      const n = lastDeleted.lead.name; lastDeleted = null;
      el.closest('.toast')?.remove();
      commit(`„${n}“ wiederhergestellt`); break;
    }
    case 'deleteCity': {
      const c = state.city; if (!c) break;
      const n = db.leads.filter((l) => cityOf(l) === c).length;
      if (!n || !confirm(`Alle ${n} Leads aus ${c} löschen?\n\nDeals bleiben erhalten. Das lässt sich nicht rückgängig machen (außer über ein vorher gesichertes Backup).`)) break;
      db.leads = db.leads.filter((l) => cityOf(l) !== c);
      state.city = ''; state.detail = null;
      commit(`${n} Leads aus ${c} gelöscht`); break;
    }
    case 'cityFilter': state.city = el.dataset.city; render(); toast('Nur ' + state.city + ' – „Alle Städte“ wählen zum Zurücksetzen'); break;
    case 'dealTab': state.dealTab = el.dataset.tab; render(); break;
    case 'newLead': newLeadModal(); break;
    case 'saveLead': saveLead(); break;
    case 'closeModal': closeModal(); break;
    case 'convert': convertModal(id); break;
    case 'saveConvert': saveConvert(); break;
    case 'open': if (!draggedRecently) openDetail(type, id, el.dataset.focus === 'note'); break;
    case 'closeDrawer': closeDrawer(); break;
    case 'cb': e.stopPropagation(); openCbPopover(el, type, id); break;
    case 'cbSet': setCallback(type, id, presetDate(el.dataset.preset)); break;
    case 'cbSetInput': { const inp = $('#' + (el.dataset.input || 'dCbInput')); if (inp && inp.value) setCallback(type, id, inp.value); else toast('Bitte Datum und Uhrzeit wählen'); break; }
    case 'cbClear': setCallback(type, id, null); break;
    case 'cbDone': callbackDone(type, id); break;
    case 'cbShift': {
      const x = findItem(type, id); if (!x) break;
      const base = new Date(Math.max(Date.now(), new Date(x.callback || Date.now()).getTime()));
      const d = new Date(x.callback || Date.now());
      base.setHours(d.getHours(), d.getMinutes(), 0, 0);
      base.setDate(base.getDate() + Number(el.dataset.days));
      while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() + 1);
      setCallback(type, id, toLocal(base)); break;
    }
    case 'addNote': {
      const t = $('#noteText').value.trim(); if (!t || !it) break;
      addNote(it, t); commit('Notiz gespeichert'); break;
    }
    case 'pinNote': { const n = it?.notes.find((x) => x.id === el.dataset.note); if (n) { n.pinned = !n.pinned; commit(); } break; }
    case 'delNote': { if (it && confirm('Notiz löschen?')) { it.notes = it.notes.filter((x) => x.id !== el.dataset.note); commit('Notiz gelöscht'); } break; }
    case 'editNote': {
      const n = it?.notes.find((x) => x.id === el.dataset.note); if (!n) break;
      const card = el.closest('.note-card');
      card.innerHTML = `<textarea class="edit-ta" style="width:100%;min-height:80px;background:transparent;border:0;resize:vertical">${esc(n.text)}</textarea>
        <div class="meta"><button data-act="saveEdit" data-note="${n.id}">Speichern</button><button data-act="cancelEdit">Abbrechen</button></div>`;
      card.querySelector('textarea').focus(); break;
    }
    case 'saveEdit': { const n = it?.notes.find((x) => x.id === el.dataset.note); const v = el.closest('.note-card').querySelector('textarea').value.trim(); if (n && v) { n.text = v; commit('Notiz geändert'); } break; }
    case 'cancelEdit': renderDrawer(); break;
    case 'won': case 'lost': {
      const d = findItem('deal', id); if (!d) break;
      d.status = act; d.closed = new Date().toISOString(); d.callback = null;
      addNote(d, act === 'won' ? '🏆 Deal gewonnen' : 'Deal verloren', true);
      commit(act === 'won' ? '🏆 Glückwunsch – Deal gewonnen!' : 'Deal als verloren markiert'); break;
    }
    case 'reopen': { const d = findItem('deal', id); if (d) { d.status = 'open'; d.closed = null; addNote(d, 'Deal wieder geöffnet', true); commit('Deal wieder geöffnet'); } break; }
    case 'delete': {
      if (!it || !confirm(`${state.detail.type === 'lead' ? 'Lead' : 'Deal'} „${it.title || it.name}“ wirklich löschen?`)) break;
      if (state.detail.type === 'lead') db.leads = db.leads.filter((x) => x.id !== it.id); else db.deals = db.deals.filter((x) => x.id !== it.id);
      state.detail = null; commit('Gelöscht'); break;
    }
    case 'importCsv': $('#fileCsv').click(); break;
    case 'backup': download(`kundengewinnen-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json'); toast('Backup heruntergeladen'); break;
    case 'restore': $('#fileJson').click(); break;
    case 'notify': Notification.requestPermission().then(() => render()); break;
    case 'logout': localStorage.removeItem(SESSION_KEY); location.reload(); break;
  }
});
$('#drawerShade').addEventListener('click', closeDrawer);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#popover').hidden) closePopover(); else if (!$('#modal').hidden) closeModal(); else closeDrawer(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'noteText') $('[data-act="addNote"]').click();
  if (e.key === 'Enter' && !$('#modal').hidden && e.target.tagName === 'INPUT') { e.preventDefault(); $('#modal .modal-foot .btn-primary').click(); }
});

/* Suche */
document.addEventListener('input', (e) => { if (e.target.id === 'search') { state.search = e.target.value; render(); } });

/* Felder im Detail-Panel speichern */
document.addEventListener('change', (e) => {
  if (e.target.id === 'cityFilter') { state.city = e.target.value; render(); return; }
  const f = e.target.dataset?.field; if (!f) return;
  const it = currentItem(); if (!it) return;
  let v = e.target.value.trim();
  if (f === 'value' || f === 'stage') v = Number(v) || 0;
  it[f] = v; saveDb();
  const keep = e.target.dataset.field;
  render();
  if (keep !== 'stage') { /* Fokus bleibt sinnvoll */ }
  toast('Gespeichert');
});

/* ---------- Drag & Drop (Deals) ---------- */
let draggedId = null, draggedRecently = false;
document.addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.card'); if (!c) return;
  draggedId = c.dataset.id; c.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', draggedId);
});
document.addEventListener('dragend', (e) => {
  e.target.closest?.('.card')?.classList.remove('dragging');
  $$('.col.drop').forEach((c) => c.classList.remove('drop'));
  draggedRecently = true; setTimeout(() => { draggedRecently = false; }, 150);
});
document.addEventListener('dragover', (e) => {
  const col = e.target.closest?.('.col'); if (!col || !draggedId) return;
  e.preventDefault();
  $$('.col.drop').forEach((c) => c !== col && c.classList.remove('drop'));
  col.classList.add('drop');
});
document.addEventListener('drop', (e) => {
  const col = e.target.closest?.('.col'); if (!col || !draggedId) return;
  e.preventDefault();
  const d = findItem('deal', draggedId); draggedId = null;
  const stage = Number(col.dataset.stage);
  if (d && d.stage !== stage) { d.stage = stage; addNote(d, `Phase → ${STAGES[stage]}`, true); commit('Verschoben nach „' + STAGES[stage] + '“'); }
  else render();
});

/* ---------- Dateien ---------- */
$('#fileCsv').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let text = await file.text();
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
  const leads = csvToLeads(text);
  if (!leads.length) return toast('Keine Leads in der Datei gefunden', true);
  const key = (l) => (l.name + '|' + l.phone).toLowerCase();
  const known = new Map([...db.leads, ...db.deals].map((l) => [key(l), l]));
  const fresh = []; let updated = 0;
  for (const l of leads) {
    const old = known.get(key(l));
    if (!old) { fresh.push(l); continue; }
    // vorhandene Einträge: fehlende Felder (z. B. Stadt) ergänzen
    let ch = false;
    for (const f of ['city', 'website', 'email']) if (!old[f] && l[f]) { old[f] = l[f]; ch = true; }
    if (ch) updated++;
  }
  db.leads.push(...fresh);
  commit(`${fresh.length} Leads importiert${leads.length > fresh.length ? ` (${leads.length - fresh.length} schon vorhanden${updated ? `, davon ${updated} ergänzt` : ''})` : ''}`);
});
$('#fileJson').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.leads) || !Array.isArray(d.deals)) throw new Error();
    if (!confirm(`Backup laden? Aktuelle Daten (${db.leads.length} Leads, ${db.deals.length} Deals) werden ersetzt durch ${d.leads.length} Leads und ${d.deals.length} Deals.`)) return;
    db = d; state.detail = null; commit('Backup geladen');
  } catch { toast('Datei ist kein gültiges Backup', true); }
});

/* ---------- Erinnerungen ---------- */
function checkDue() {
  let changed = false;
  for (const { type, item } of allOpenItems()) {
    if (item.callback && cbStatus(item.callback) === 'overdue' && item.notifiedFor !== item.callback) {
      item.notifiedFor = item.callback; changed = true;
      const msg = `📞 Rückruf fällig: ${item.title || item.name}${item.phone ? ' – ' + item.phone : ''}`;
      toast(msg, true);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Kundengewinnen', { body: msg }); } catch { /* ignorieren */ }
      }
    }
  }
  if (changed) saveDb();
  const busy = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || !$('#popover').hidden || !$('#modal').hidden;
  if (busy) updateCounts(); else render();
}

/* ---------- Start ---------- */
function startApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  // Beim ersten Start: bereits überfällige nicht alle als Popup melden
  allOpenItems().forEach(({ item }) => { if (item.callback && cbStatus(item.callback) === 'overdue') item.notifiedFor = item.callback; });
  if (db.cleanup_berlin_2026_11 > 0 && !db.cleanup_berlin_shown) {
    db.cleanup_berlin_shown = true;
    setTimeout(() => toast(`${db.cleanup_berlin_2026_11} Berlin-Leads wurden entfernt`), 300);
  }
  saveDb();
  render();
  setInterval(checkDue, 30000);
  Sync.onChange(updateSyncBadge);
  updateSyncBadge();
  Sync.start();
  if (!Sync.enabled() && !localStorage.getItem('kg_sync_hint')) {
    localStorage.setItem('kg_sync_hint', '1');
    setTimeout(syncModal, 600);
  }
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await checkLogin($('#loginName').value, $('#loginPass').value)) {
    localStorage.setItem(SESSION_KEY, AUTH_HASH);
    startApp();
  } else { $('#loginError').hidden = false; $('#loginPass').value = ''; $('#loginPass').focus(); }
});
if (isLoggedIn()) startApp(); else { $('#login').hidden = false; $('#loginName').focus(); }
