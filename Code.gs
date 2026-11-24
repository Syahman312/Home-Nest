/**
 * Nest: Google Sheets bridge (Apps Script)
 * Same pattern as Garage / Ledger: the web app is the API, the Sheet is the database.
 *
 * Setup
 * 1. Create a Google Sheet called "Nest DB". Extensions → Apps Script → paste this file.
 * 2. Project Settings → Time zone: (GMT+08:00) Kuala Lumpur.
 * 3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 * 4. Copy the /exec URL into Nest → Settings → Sync on each device.
 *    After editing this file: Deploy → Manage deployments → Edit → Version: New version
 *    (keeps the same URL).
 *
 * Endpoints
 *   GET  ?action=get      → { ok, data }     full app state
 *   GET  ?action=summary  → { ok, summary }  small numbers for the Dashboard app
 *   POST {action:'save', data}  (sent as text/plain) → { ok, updatedAt, data }
 *
 * Sync: last-write-wins *per record*. Each row has `u` (ms of its last edit).
 * `by` / `eb` = who added / last edited a row; the `log` tab is the shared activity feed.
 * Deleted ids are kept in the `_deleted` tab so deletions reach every device.
 * A save merges the incoming state with the Sheet and returns the merged result,
 * so a device that was offline never overwrites newer edits made elsewhere.
 */

const COLLECTIONS = {
  rooms: ['id', 'name', 'icon', 'by', 'eb', 'u'],
  items: ['id', 'roomId', 'name', 'category', 'priority', 'status', 'est', 'actual', 'shop', 'link', 'date', 'warranty', 'notes', 'paid', 'by', 'eb', 'u'],
  tasks: ['id', 'name', 'roomId', 'interval', 'lastDone', 'doneBy', 'notes', 'by', 'eb', 'u'],
  bills: ['id', 'name', 'amount', 'freq', 'notes', 'by', 'eb', 'u'],
  log: ['id', 'at', 'by', 'text', 'u'] // activity: who did what (newest LOG_MAX kept)
};
const NUMERIC = ['est', 'actual', 'interval', 'amount', 'at', 'u'];
const LOG_MAX = 300;
const TZ = 'Asia/Kuala_Lumpur';
const TOMBSTONE_DAYS = 400;

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'get';
    if (action === 'summary') return json_({ ok: true, summary: summary_(readState_()) });
    if (action === 'get') return json_({ ok: true, data: readState_() });
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'save' || !body.data) return json_({ ok: false, error: 'Unknown action' });
    const current = readState_();
    const merged = mergeStates_(current, body.data);
    if (sig_(merged) !== sig_(current)) writeState_(merged);
    return json_({ ok: true, updatedAt: merged.updatedAt, data: merged });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ---------- merge (mirrors mergeStates in index.html; `b` wins ties) ---------- */

function mergeStates_(a, b) {
  const n = v => (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v);
  const out = { version: 2, updatedAt: Math.max(n(a.updatedAt), n(b.updatedAt)), deleted: {} };
  const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
  [a.deleted || {}, b.deleted || {}].forEach(src => Object.keys(src).forEach(id => {
    const t = n(src[id]);
    if (t > cutoff && !(out.deleted[id] >= t)) out.deleted[id] = t;
  }));
  Object.keys(COLLECTIONS).forEach(c => {
    const order = [], m = {};
    (a[c] || []).forEach(r => { if (r && r.id) { if (!(r.id in m)) order.push(r.id); m[r.id] = r; } });
    (b[c] || []).forEach(r => {
      if (!r || !r.id) return;
      const x = m[r.id];
      if (!x) { order.push(r.id); m[r.id] = r; }
      else if (n(r.u) >= n(x.u)) m[r.id] = r;
    });
    out[c] = order.map(id => m[id]).filter(r => !(out.deleted[r.id] >= n(r.u)));
  });
  out.log = out.log.slice().sort((x, y) => n(y.at) - n(x.at) || (x.id < y.id ? -1 : 1)).slice(0, LOG_MAX);
  const bWins = n(b.settingsAt) >= n(a.settingsAt);
  out.settings = Object.assign({}, bWins ? (b.settings || {}) : (a.settings || {}));
  delete out.settings.syncUrl; // device-specific, never stored centrally
  out.settingsAt = Math.max(n(a.settingsAt), n(b.settingsAt));
  return out;
}

/* Fingerprint of what is stored, to skip rewriting the Sheet when nothing changed. */
function sig_(s) {
  const o = { settings: s.settings || {}, settingsAt: Number(s.settingsAt || 0) };
  o.deleted = Object.keys(s.deleted || {}).sort().map(k => k + ':' + s.deleted[k]);
  Object.keys(COLLECTIONS).forEach(c => {
    const cols = COLLECTIONS[c];
    o[c] = (s[c] || []).map(r => cols.map(k => r[k] === undefined || r[k] === null ? '' : String(r[k])).join('\u0001')).sort();
  });
  return JSON.stringify(o);
}

/* ---------- read / write ---------- */

function readState_() {
  const meta = readMeta_();
  const state = {
    version: 2,
    updatedAt: Number(meta.updatedAt || 0),
    settingsAt: Number(meta.settingsAt || 0),
    settings: meta.settings || {},
    deleted: readDeleted_()
  };
  Object.keys(COLLECTIONS).forEach(name => { state[name] = readTable_(name); });
  return state;
}

function writeState_(data) {
  const ss = SpreadsheetApp.getActive();
  Object.keys(COLLECTIONS).forEach(name => {
    const cols = COLLECTIONS[name];
    const rows = [cols].concat((data[name] || []).map(o => cols.map(c => o[c] === undefined || o[c] === null ? '' : String(o[c]))));
    writeTab_(ss, name, rows);
  });
  writeTab_(ss, '_deleted', [['id', 'at']].concat(Object.keys(data.deleted || {}).map(id => [id, String(data.deleted[id])])));
  const settings = Object.assign({}, data.settings || {});
  delete settings.syncUrl;
  writeTab_(ss, '_meta', [
    ['key', 'value'],
    ['updatedAt', String(data.updatedAt || Date.now())],
    ['settingsAt', String(data.settingsAt || 0)],
    ['settings', JSON.stringify(settings)]
  ]);
}

function writeTab_(ss, name, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const width = rows[0].length;
  sh.clearContents();
  const range = sh.getRange(1, 1, rows.length, width);
  range.setNumberFormat('@'); // plain text: no date / timezone guessing by Sheets
  range.setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#2a1d10').setFontColor('#f3c58f');
}

function readMeta_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('_meta');
  const out = { updatedAt: 0, settingsAt: 0, settings: {} };
  if (!sh || sh.getLastRow() < 1) return out;
  // Key/value rows. Also reads the prototype layout (no header row).
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(r => {
    const k = String(r[0]), v = r[1];
    if (k === 'updatedAt') out.updatedAt = Number(v || 0);
    else if (k === 'settingsAt') out.settingsAt = Number(v || 0);
    else if (k === 'settings') { try { out.settings = JSON.parse(v || '{}'); } catch (e) { out.settings = {}; } }
  });
  return out;
}

function readDeleted_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('_deleted');
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0] !== '') out[String(r[0])] = Number(r[1] || 0); });
  return out;
}

function readTable_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const head = values.shift().map(String);
  return values.filter(r => r[0] !== '').map(r => {
    const o = {};
    head.forEach((h, i) => {
      if (!h) return;
      let v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd'); // someone typed a date in Sheets
      if (NUMERIC.indexOf(h) > -1) v = (v === '' || v == null) ? (h === 'actual' ? '' : 0) : Number(v);
      else v = v == null ? '' : String(v);
      o[h] = v;
    });
    if (o.u === undefined) o.u = 0;
    return o;
  });
}

/* ---------- Dashboard feed ---------- */

function summary_(s) {
  const items = s.items || [];
  const cost = i => (i.actual !== '' && i.actual != null) ? Number(i.actual) : Number(i.est || 0);
  const spent = items.filter(i => i.status === 'delivered').reduce((a, i) => a + cost(i), 0);
  const committed = items.filter(i => i.status === 'ordered').reduce((a, i) => a + cost(i), 0);
  const planned = items.filter(i => i.status === 'idea' || i.status === 'shortlist').reduce((a, i) => a + Number(i.est || 0), 0);
  const must = items.filter(i => i.priority === 'must');
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const overdue = (s.tasks || []).filter(t => t.lastDone && addMonths_(t.lastDone, t.interval) < today).length;
  const moveIn = (s.settings || {}).moveIn || '';
  return {
    app: 'Nest',
    moveIn: moveIn,
    daysToMoveIn: isDate_(moveIn) ? dayNum_(moveIn) - dayNum_(today) : null,
    budget: Number((s.settings || {}).budget || 0),
    spent: spent, committed: committed, planned: planned,
    mustDone: must.filter(i => i.status === 'delivered').length, mustTotal: must.length,
    overdueTasks: overdue,
    updatedAt: s.updatedAt
  };
}

/* Date-only maths on 'yyyy-mm-dd' strings, done in UTC so the script's own time zone can't shift a day. */
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function dayNum_(s) { const p = String(s).split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); }
function addMonths_(s, m) {
  if (!isDate_(s)) return '';
  const p = String(s).split('-').map(Number);
  const total = p[0] * 12 + (p[1] - 1) + Number(m || 0);
  const y = Math.floor(total / 12), mo = total % 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = Math.min(p[2], last);
  return y + '-' + ('0' + (mo + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
