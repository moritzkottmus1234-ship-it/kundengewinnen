'use strict';
/* Kundengewinnen – Ansichten */

const state = { view: 'leads', filter: 'all', search: '', city: '', dealTab: 'open', detail: null, list: { lead: 'leads', deal: 'deals', callback: 'callbacks' } };
const VIEW_OF = { lead: 'leads', deal: 'deals', callback: 'callbacks' };
const TYPE_OF = { leads: 'lead', deals: 'deal', callbacks: 'callback' };
/* aktuelle Liste eines Typs (fällt auf die erste zurück, falls gelöscht) */
function cur(type) {
  const l = listById(state.list[type]);
  if (!l || l.type !== type) state.list[type] = listsOf(type)[0].id;
  return state.list[type];
}
const inList = (item, type) => listOf(item, type) === cur(type);
/* Rückruf-Liste: zeigt Rückrufe aus den gewählten Lead-/Deal-Listen (leer = alle) */
function inCbList(cbl, x) {
  const src = (cbl && cbl.sources) || [];
  return !src.length || src.includes(listOf(x.item, x.type));
}
function listHead(type) {
  const l = listById(cur(type));
  const many = listsOf(type).length > 1;
  return `<h1 class="list-title">${esc(l.name)}</h1>
    <button class="btn btn-ghost btn-sm icon-btn" data-act="editList" data-id="${l.id}" title="Liste umbenennen">✎</button>
    ${many ? `<button class="btn btn-ghost btn-sm icon-btn" data-act="deleteList" data-id="${l.id}" title="Liste löschen">🗑</button>` : ''}
    <select class="search list-pick" data-type="${type}" title="Liste wechseln / neue Liste">
      ${listsOf(type).map((x) => `<option value="${x.id}" ${x.id === l.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      <option value="__new">＋ Neue Liste …</option></select>`;
}
const cityOf = (item) => (item.city || '').trim();
function cityList() {
  const s = new Set([...db.leads, ...db.deals].map(cityOf).filter(Boolean));
  return [...s].sort((a, b) => a.localeCompare(b, 'de'));
}
function citySelect() {
  const cities = cityList();
  if (!cities.length) return '';
  if (state.city && !cities.includes(state.city)) state.city = '';
  return `<select class="search city-select" id="cityFilter" title="Nach Stadt filtern">
    <option value="">Alle Städte</option>${cities.map((c) => `<option ${state.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
}
const matchCity = (item) => !state.city || cityOf(item) === state.city;

function cbBadge(item, type) {
  const st = cbStatus(item.callback);
  return `<button class="cb cb-${st}" data-act="cb" data-type="${type}" data-id="${item.id}" title="Rückruf festlegen">${esc(cbLabel(item.callback))}</button>`;
}
function noteCell(item, type) {
  const n = mainNote(item);
  const count = (item.notes || []).filter((x) => !x.system).length;
  if (!n) return `<button class="add-note" data-act="open" data-focus="note" data-type="${type}" data-id="${item.id}">+ Notiz</button>`;
  return `<button class="note-chip" data-act="open" data-focus="note" data-type="${type}" data-id="${item.id}">
    <span class="txt">${esc(n.text)}</span>
    <span class="meta">${n.pinned ? '<span>📌</span>' : ''}<span>${fmtStamp(n.date)}</span>${count > 1 ? `<span>+${count - 1} weitere</span>` : ''}</span>
  </button>`;
}
function matchSearch(item) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.title, item.city, item.phone, item.email, item.website, ...(item.notes || []).map((n) => n.text)]
    .some((v) => (v || '').toLowerCase().includes(q));
}
function matchFilter(item) {
  const st = cbStatus(item.callback);
  switch (state.filter) {
    case 'overdue': return st === 'overdue';
    case 'today': return st === 'today';
    case 'week': return ['overdue', 'today', 'tomorrow', 'week'].includes(st);
    case 'none': return st === 'none';
    default: return true;
  }
}
function cbSortKey(item) { return item.callback ? new Date(item.callback).getTime() : Infinity; }

/* ---------- Leads ---------- */
function renderLeads() {
  const all = db.leads.filter((l) => inList(l, 'lead') && matchCity(l));
  const cnt = (f) => all.filter((l) => { const o = state.filter; state.filter = f; const r = matchFilter(l); state.filter = o; return r; }).length;
  const list = all.filter((l) => matchFilter(l) && matchSearch(l))
    .sort((a, b) => cbSortKey(a) - cbSortKey(b) || (b.created > a.created ? 1 : -1));
  const chip = (key, label, cls = '') => `<button class="chip ${cls} ${state.filter === key ? 'active' : ''}" data-act="filter" data-filter="${key}">${cls ? '<span class="dot"></span>' : ''}${label} <span class="n">${cnt(key)}</span></button>`;

  return `
  <div class="view-head">
    ${listHead('lead')}
    <input class="search" id="search" placeholder="Suchen (Name, Stadt, Telefon, Notiz …)" value="${esc(state.search)}">
    ${citySelect()}
    ${state.city ? `<button class="btn btn-danger" data-act="deleteCity" title="Alle Leads dieser Stadt löschen">🗑 Alle aus ${esc(state.city)} löschen</button>` : ''}
    <span class="spacer"></span>
    <button class="btn" data-act="importCsv">CSV importieren</button>
    <button class="btn btn-primary" data-act="newLead">+ Lead</button>
  </div>
  <div class="chips">
    ${chip('all', 'Alle')}
    ${chip('overdue', 'Überfällig', 'chip-overdue')}
    ${chip('today', 'Heute anrufen', 'chip-today')}
    ${chip('week', 'Nächste 7 Tage', 'chip-week')}
    ${chip('none', 'Ohne Rückruf')}
  </div>
  <div class="table-wrap">
    ${list.length ? `
    <table class="grid">
      <thead><tr><th>Name</th><th>Stadt</th><th>Telefon</th><th>Website</th><th>E-Mail</th><th>Notiz</th><th>Rückruf</th><th></th></tr></thead>
      <tbody>
      ${list.map((l) => `
        <tr class="cb-${cbStatus(l.callback)}">
          <td data-label="Name"><button class="link" data-act="open" data-type="lead" data-id="${l.id}">${esc(l.name) || '<i>Ohne Name</i>'}</button></td>
          <td data-label="Stadt" class="nowrap">${cityOf(l) ? `<button class="city-tag" data-act="cityFilter" data-city="${esc(cityOf(l))}" title="Nur ${esc(cityOf(l))} anzeigen">📍 ${esc(cityOf(l))}</button>` : DASH}</td>
          <td data-label="Telefon" class="nowrap">${l.phone ? `<a href="${esc(telHref(l.phone))}">${esc(l.phone)}</a>` : DASH}</td>
          <td data-label="Website">${l.website ? `<a href="${esc(urlHref(l.website))}" target="_blank" rel="noopener">${esc(shortUrl(l.website))}</a>` : DASH}</td>
          <td data-label="E-Mail">${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : DASH}</td>
          <td data-label="Notiz" class="col-note">${noteCell(l, 'lead')}</td>
          <td data-label="Rückruf">${cbBadge(l, 'lead')}</td>
          <td data-label="" class="row-acts"><button class="btn btn-sm btn-deal" data-act="convert" data-id="${l.id}" title="In Deal umwandeln">→ Deal</button><button class="btn btn-sm btn-del" data-act="rowDelete" data-id="${l.id}" title="Lead löschen (zum Bestätigen nochmal klicken)" aria-label="Lead löschen">🗑</button></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">${all.length ? 'Keine Leads für diesen Filter.' : 'Diese Liste ist noch leer. Lege oben rechts den ersten Lead an oder importiere eine CSV-Datei.'}</div>`}
  </div>`;
}

/* ---------- Deals ---------- */
const euro = (v) => (Number(v) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function dealCard(d) {
  const n = mainNote(d);
  return `<div class="card cb-${cbStatus(d.callback)}" draggable="true" data-act="open" data-type="deal" data-id="${d.id}">
    <h4>${esc(d.title || d.name)}</h4>
    <div class="sub">${esc(d.name)}${cityOf(d) ? ' · 📍 ' + esc(cityOf(d)) : ''}${d.phone ? ' · ' + esc(d.phone) : ''}</div>
    <div class="row"><span class="val">${euro(d.value)}</span>${cbBadge(d, 'deal')}</div>
    ${n ? `<div class="note-chip"><span class="txt">${esc(n.text)}</span></div>` : ''}
    <div class="card-acts">${dealActs(d)}</div>
  </div>`;
}
function dealActs(d) {
  return `<button class="btn btn-sm" data-act="dealToLead" data-id="${d.id}" title="Deal wieder zu einem Lead machen">↩ Zu Leads</button><button class="btn btn-sm btn-del" data-act="rowDelete" data-type="deal" data-id="${d.id}" title="Deal löschen (zum Bestätigen nochmal klicken)" aria-label="Deal löschen">🗑</button>`;
}
function renderDeals() {
  const mine = db.deals.filter((d) => inList(d, 'deal') && matchSearch(d) && matchCity(d));
  const open = mine.filter((d) => d.status === 'open');
  const tab = (k, l, n) => `<button class="tab ${state.dealTab === k ? 'active' : ''}" data-act="dealTab" data-tab="${k}">${l} (${n})</button>`;
  const won = mine.filter((d) => d.status === 'won');
  const lost = mine.filter((d) => d.status === 'lost');
  let body;
  if (state.dealTab === 'open') {
    body = `<div class="board">${STAGES.map((s, i) => {
      const items = open.filter((d) => d.stage === i).sort((a, b) => cbSortKey(a) - cbSortKey(b));
      return `<div class="col" data-stage="${i}">
        <div class="col-head"><b>${esc(s)}</b><small>${items.length} Deals · ${euro(items.reduce((t, d) => t + (Number(d.value) || 0), 0))}</small></div>
        ${items.map(dealCard).join('')}
      </div>`;
    }).join('')}</div>`;
  } else {
    const list = state.dealTab === 'won' ? won : lost;
    body = `<div class="table-wrap">${list.length ? `<table class="grid"><thead><tr><th>Deal</th><th>Name</th><th>Stadt</th><th>Telefon</th><th>Wert</th><th>Abgeschlossen</th><th></th></tr></thead><tbody>
      ${list.map((d) => `<tr>
        <td data-label="Deal"><button class="link" data-act="open" data-type="deal" data-id="${d.id}">${esc(d.title || d.name)}</button></td>
        <td data-label="Name">${esc(d.name) || DASH}</td>
        <td data-label="Stadt">${esc(cityOf(d)) || DASH}</td>
        <td data-label="Telefon">${d.phone ? `<a href="${esc(telHref(d.phone))}">${esc(d.phone)}</a>` : DASH}</td>
        <td data-label="Wert">${euro(d.value)}</td>
        <td data-label="Datum">${d.closed ? fmtStamp(d.closed) : DASH}</td>
        <td class="row-acts"><button class="btn btn-sm" data-act="reopen" data-id="${d.id}">Wieder öffnen</button> ${dealActs(d)}</td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty">Keine Deals.</div>'}</div>`;
  }
  return `
  <div class="view-head">
    ${listHead('deal')}
    <div class="tabs">${tab('open', 'Pipeline', open.length)}${tab('won', 'Gewonnen', won.length)}${tab('lost', 'Verloren', lost.length)}</div>
    <input class="search" id="search" placeholder="Deals suchen …" value="${esc(state.search)}">
    ${citySelect()}
    <span class="spacer"></span>
    <span class="muted">Offen gesamt: <b>${euro(open.reduce((t, d) => t + (Number(d.value) || 0), 0))}</b></span>
  </div>
  ${body}
  ${state.dealTab === 'open' && !mine.length ? '<p class="muted">Deals entstehen, indem du bei einem Lead auf „→ Deal“ klickst. Karten kannst du per Ziehen in die nächste Phase verschieben.</p>' : ''}`;
}

/* ---------- Rückrufe ---------- */
function allOpenItems() {
  return [...db.leads.map((x) => ({ type: 'lead', item: x })), ...db.deals.filter((d) => d.status === 'open').map((x) => ({ type: 'deal', item: x }))];
}
function renderCallbacks() {
  const cbl = listById(cur('callback'));
  const items = allOpenItems().filter((x) => x.item.callback && inCbList(cbl, x) && matchSearch(x.item) && matchCity(x.item)).sort((a, b) => cbSortKey(a.item) - cbSortKey(b.item));
  const srcNames = (cbl.sources || []).map((id) => listById(id)?.name).filter(Boolean);
  const groups = [
    ['overdue', '⚠ Überfällig'], ['today', '📞 Heute'], ['tomorrow', 'Morgen'], ['week', 'Diese Woche'], ['later', 'Später'],
  ];
  const html = groups.map(([k, label]) => {
    const g = items.filter((x) => cbStatus(x.item.callback) === k);
    if (!g.length) return '';
    return `<div class="cb-group"><h2>${label} <span class="muted">(${g.length})</span></h2>
      ${g.map(({ type, item }) => {
        const n = mainNote(item);
        return `<div class="cb-item cb-${k}">
          <div>
            <div class="who">
              <span class="pill pill-${type}">${type === 'lead' ? 'Lead' : 'Deal'}</span>
              <button class="link" data-act="open" data-type="${type}" data-id="${item.id}">${esc(item.title || item.name) || 'Ohne Name'}</button>
              ${cityOf(item) ? `<span class="muted">📍 ${esc(cityOf(item))}</span>` : ''}
              ${item.phone ? `<a class="phone" href="${esc(telHref(item.phone))}">📞 ${esc(item.phone)}</a>` : ''}
              ${cbBadge(item, type)}
            </div>
            ${n ? `<button class="note-chip" data-act="open" data-focus="note" data-type="${type}" data-id="${item.id}"><span class="txt">${esc(n.text)}</span></button>` : ''}
          </div>
          <div class="acts">
            <button class="btn btn-sm btn-deal" data-act="cbDone" data-type="${type}" data-id="${item.id}">✓ Erledigt</button>
            <button class="btn btn-sm" data-act="cbShift" data-days="1" data-type="${type}" data-id="${item.id}">+1 Tag</button>
            <button class="btn btn-sm" data-act="cbShift" data-days="7" data-type="${type}" data-id="${item.id}">+1 Woche</button>
          </div>
        </div>`;
      }).join('')}</div>`;
  }).join('');
  return `
  <div class="view-head">
    ${listHead('callback')}
    <input class="search" id="search" placeholder="Suchen …" value="${esc(state.search)}">
    ${citySelect()}
    <span class="spacer"></span>
    ${'Notification' in window && Notification.permission === 'default' ? '<button class="btn" data-act="notify">🔔 Erinnerungen im Browser erlauben</button>' : ''}
  </div>
  <p class="muted list-src">Zeigt Rückrufe aus: <b>${srcNames.length ? srcNames.map(esc).join(', ') : 'allen Lead- und Deal-Listen'}</b> · <button class="link-btn" data-act="editList" data-id="${cbl.id}">ändern</button></p>
  ${html || '<div class="table-wrap"><div class="empty">Keine geplanten Rückrufe. 🎉</div></div>'}`;
}

/* ---------- Detail-Panel ---------- */
function presetButtons(type, id) {
  return `<div class="presets">${PRESETS.map(([k, l]) => `<button class="btn" data-act="cbSet" data-preset="${k}" data-type="${type}" data-id="${id}">${l}</button>`).join('')}</div>`;
}
function renderDrawer() {
  const dr = $('#drawer'), shade = $('#drawerShade');
  const it = state.detail && findItem(state.detail.type, state.detail.id);
  if (!it) { dr.hidden = true; shade.hidden = true; state.detail = null; return; }
  const type = state.detail.type, st = cbStatus(it.callback);
  const notes = sortedNotes(it);
  const statusPill = type === 'deal' && it.status !== 'open' ? `<span class="pill pill-${it.status}">${it.status === 'won' ? 'Gewonnen' : 'Verloren'}</span>` : '';
  dr.innerHTML = `
    <div class="d-head">
      <div><span class="pill pill-${type}">${type === 'lead' ? 'Lead' : 'Deal'}</span> ${statusPill}
        <h2>${esc(type === 'deal' ? (it.title || it.name) : it.name) || 'Ohne Name'}</h2>
        ${cityOf(it) ? `<div class="muted">📍 ${esc(cityOf(it))}</div>` : ''}</div>
      <button class="btn btn-ghost close" data-act="closeDrawer" aria-label="Schließen">✕</button>
    </div>
    <div class="d-body">
      <div class="d-actions">
        ${it.phone ? `<a class="btn" href="${esc(telHref(it.phone))}">📞 Anrufen</a>` : ''}
        ${it.email ? `<a class="btn" href="mailto:${esc(it.email)}">✉ E-Mail</a>` : ''}
        ${it.website ? `<a class="btn" href="${esc(urlHref(it.website))}" target="_blank" rel="noopener">🌐 Website</a>` : ''}
        ${type === 'lead' ? `<button class="btn btn-primary" data-act="convert" data-id="${it.id}">→ In Deal umwandeln</button>` : ''}
        ${type === 'deal' && it.status === 'open' ? `<button class="btn btn-deal" data-act="won" data-id="${it.id}">🏆 Gewonnen</button><button class="btn" data-act="lost" data-id="${it.id}">Verloren</button>` : ''}
        ${type === 'deal' && it.status !== 'open' ? `<button class="btn" data-act="reopen" data-id="${it.id}">Wieder öffnen</button>` : ''}
        ${type === 'deal' ? `<button class="btn" data-act="dealToLead" data-id="${it.id}">↩ Zurück zu Leads</button>` : ''}
      </div>

      <div class="section">
        <h3>Rückruf</h3>
        <div class="cb-box cb-${st}">
          <div class="cb-now">${it.callback ? esc(cbLabel(it.callback)) : '<span class="muted">Kein Rückruf geplant</span>'}</div>
          ${presetButtons(type, it.id)}
          <div class="dt-row"><input type="datetime-local" id="dCbInput" value="${it.callback || ''}"><button class="btn" data-act="cbSetInput" data-type="${type}" data-id="${it.id}">Setzen</button></div>
          ${it.callback ? `<div class="dt-row"><button class="btn btn-deal" data-act="cbDone" data-type="${type}" data-id="${it.id}">✓ Angerufen / erledigt</button><button class="btn btn-ghost" data-act="cbClear" data-type="${type}" data-id="${it.id}">Entfernen</button></div>` : ''}
        </div>
      </div>

      <div class="section">
        <h3>Notizen</h3>
        <div class="note-new">
          <textarea id="noteText" placeholder="Notiz schreiben … (Strg+Enter zum Speichern)"></textarea>
          <div><button class="btn btn-primary btn-sm" data-act="addNote">Notiz speichern</button></div>
        </div>
        <div class="notes" style="margin-top:10px">
          ${notes.map((n) => `<div class="note-card ${n.pinned ? 'pinned' : ''} ${n.system ? 'system' : ''}" data-note="${n.id}">
            <div class="txt">${esc(n.text)}</div>
            <div class="meta"><span>${fmtStamp(n.date)}</span>
              ${n.system ? '' : `<button data-act="pinNote" data-note="${n.id}">${n.pinned ? 'Lösen' : '📌 Anheften'}</button><button data-act="editNote" data-note="${n.id}">Bearbeiten</button>`}
              <button data-act="delNote" data-note="${n.id}">Löschen</button></div>
          </div>`).join('') || '<p class="muted" style="margin:0">Noch keine Notizen.</p>'}
        </div>
      </div>

      <div class="section">
        <h3>Daten</h3>
        <div class="fields">
          ${type === 'deal' ? `<label class="full">Deal-Titel<input data-field="title" value="${esc(it.title)}"></label>
            <label>Wert (€)<input data-field="value" type="number" min="0" step="50" value="${esc(it.value)}"></label>
            <label>Phase<select data-field="stage">${STAGES.map((s, i) => `<option value="${i}" ${it.stage === i ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
          <label>Name<input data-field="name" value="${esc(it.name)}"></label>
          <label>Stadt<input data-field="city" value="${esc(it.city)}" list="cityOptions"></label>
          <label>Telefon<input data-field="phone" type="tel" value="${esc(it.phone)}"></label>
          <label>E-Mail<input data-field="email" type="email" value="${esc(it.email)}"></label>
          <label>Website<input data-field="website" value="${esc(it.website)}"></label>
          <label>Liste<select data-field="listId">${listsOf(type).map((l) => `<option value="${l.id}" ${listOf(it, type) === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        </div>
        <p class="muted" style="font-size:12px">Angelegt: ${fmtStamp(it.created)} · Änderungen werden automatisch gespeichert.</p>
      </div>

      <div><button class="btn btn-danger btn-sm" data-act="delete">${type === 'lead' ? 'Lead' : 'Deal'} löschen</button></div>
    </div>`;
  dr.hidden = false; shade.hidden = false;
}

/* ---------- Gesamt ---------- */
function renderNav() {
  const open = allOpenItems();
  const isDue = (x) => ['overdue', 'today'].includes(cbStatus(x.item.callback));
  const count = {
    lead: (l) => db.leads.filter((x) => listOf(x, 'lead') === l.id).length,
    deal: (l) => db.deals.filter((x) => x.status === 'open' && listOf(x, 'deal') === l.id).length,
    callback: (l) => open.filter((x) => isDue(x) && inCbList(l, x)).length,
  };
  const total = { lead: db.leads.length, deal: db.deals.filter((d) => d.status === 'open').length, callback: open.filter(isDue).length };
  const ICO = { lead: '👤', deal: '💼', callback: '📞' };
  $('#navLists').innerHTML = Object.keys(LIST_TYPES).map((type) => {
    const view = VIEW_OF[type], alert = type === 'callback';
    const subs = listsOf(type).map((l) => {
      const n = count[type](l);
      const active = state.view === view && cur(type) === l.id;
      return `<div class="nav-sub ${active ? 'active' : ''}">
        <button class="nav-sub-btn" data-act="pickList" data-type="${type}" data-id="${l.id}" title="${esc(l.name)}"><span class="nav-sub-name">${esc(l.name)}</span>${n ? `<span class="count ${alert ? 'count-alert' : ''}">${n}</span>` : ''}</button>
        <button class="nav-edit" data-act="editList" data-id="${l.id}" title="„${esc(l.name)}“ umbenennen">✎</button>
      </div>`;
    }).join('');
    return `<div class="nav-group">
      <button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}"><span class="ico">${ICO[type]}</span><span class="nav-label">${LIST_TYPES[type]}</span>
        <span class="count ${alert ? 'count-alert' : ''}" ${alert && !total[type] ? 'hidden' : ''}>${total[type]}</span></button>
      <div class="nav-subs">${subs}<button class="nav-add" data-act="newList" data-type="${type}">＋ Neue ${type === 'callback' ? 'Rückruf' : type === 'deal' ? 'Deal' : 'Lead'}-Liste</button></div>
    </div>`;
  }).join('');
}
function updateCounts() {
  const open = allOpenItems();
  const overdue = open.filter((x) => cbStatus(x.item.callback) === 'overdue').length;
  const due = overdue + open.filter((x) => cbStatus(x.item.callback) === 'today').length;
  renderNav();
  document.title = (due ? `(${due}) ` : '') + 'Kundengewinnen';
  const b = $('#dueBanner');
  if (overdue && state.view !== 'callbacks') {
    b.innerHTML = `⚠ ${overdue} Rückruf${overdue > 1 ? 'e' : ''} überfällig! <button class="btn btn-sm" data-act="go" data-view="callbacks">Jetzt anzeigen</button>`;
    b.hidden = false;
  } else b.hidden = true;
}
function render() {
  const searchHadFocus = document.activeElement && document.activeElement.id === 'search';
  const pos = searchHadFocus ? document.activeElement.selectionStart : 0;
  $('#view').innerHTML = state.view === 'deals' ? renderDeals() : state.view === 'callbacks' ? renderCallbacks() : renderLeads();
  if (searchHadFocus) { const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); }
  $('#cityOptions').innerHTML = [...new Set(['Köln', 'Berlin', ...cityList()])].map((c) => `<option value="${esc(c)}">`).join('');
  updateCounts();
  renderDrawer();
}
