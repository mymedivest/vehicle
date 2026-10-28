/**
 * Workshop2U backend (Google Apps Script bound to your sheet).
 * Setup: 1) edit INITIAL_WEBMASTER below  2) run setupCredentials() once from the editor (authorise when asked)
 *        3) Deploy > New deployment > Web app > Execute as: Me > Access: Anyone  4) paste URL into script.js and form.html
 * Roles: webmaster, manager, staff, others (viewer)
 */
const SHEET_ID = '1i5lNH0k5OpI2CnD1MW2Yv1mLqSEfrOPqQX-_EoFTy00';
const TAB = 'Summary', CRED = 'Credentials', FIRST = 7, COLS = 24;
const INITIAL_WEBMASTER = { username: 'webmaster', email: 'you@example.com', password: 'ChangeMe#2026' };

const ROLES = ['webmaster', 'manager', 'staff', 'others'];
const ADMIN = ['data', 'add', 'update', 'listUsers', 'addUser', 'setUser'];
const PERM = { webmaster: ADMIN, manager: ADMIN, staff: ['data', 'add', 'update'], others: ['data'] };
const CREATE = { webmaster: ROLES, manager: ['manager', 'staff', 'others'] };   // roles each admin may create or manage

/* ---------- entry point ---------- */
function doPost(e) {
  let out;
  try {
    const q = JSON.parse(e.postData.contents), cache = CacheService.getScriptCache();
    if (q.action === 'login') out = login_(q, cache);
    else if (q.action === 'submit') out = publicSubmit_(q, cache);
    else if (q.action === 'ver') {                   // cheap change check used by the website every few seconds
      if (!cache.get('t_' + q.token)) throw new Error('Session expired. Please sign in again.');
      out = { ok: true, ver: ver_() };
    }
    else {
      const sess = JSON.parse(cache.get('t_' + q.token) || 'null');
      const u = sess && users_().find(x => x.username === sess.user);
      if (!u || !u.active) throw new Error('Session expired. Please sign in again.');
      if (!(PERM[u.role] || []).includes(q.action)) throw new Error('Your role is not permitted to do this.');
      const a = { user: u.username, role: u.role };
      out = q.action === 'data' ? getData_()
        : q.action === 'add' ? addRow_(q.row)
        : q.action === 'update' ? updateRow_(q.row)
        : q.action === 'listUsers' ? listUsers_()
        : q.action === 'addUser' ? addUser_(a, q)
        : setUser_(a, q);
    }
  } catch (err) { out = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- credentials ---------- */
const hash_ = (salt, pw) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
const cap_ = s => s.charAt(0).toUpperCase() + s.slice(1);
const credSheet_ = () => SpreadsheetApp.openById(SHEET_ID).getSheetByName(CRED);

function setupCredentials() {                       // run once from the Apps Script editor
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let s = ss.getSheetByName(CRED);
  if (!s) { s = ss.insertSheet(CRED); s.appendRow(['Username', 'Email', 'Salt', 'PasswordHash', 'Role', 'Active', 'Created', 'CreatedBy']); s.setFrozenRows(1); }
  if (s.getLastRow() < 2) saveUser_(s, INITIAL_WEBMASTER.username, INITIAL_WEBMASTER.email, INITIAL_WEBMASTER.password, 'webmaster', 'setup');
  s.hideSheet();
  Logger.log('Credentials tab ready. Sign in as "' + INITIAL_WEBMASTER.username + '" and change the password.');
}
function saveUser_(s, user, email, pw, role, by) {
  const salt = Utilities.getUuid();
  s.appendRow([user, email, salt, hash_(salt, pw), cap_(role), 'Yes', new Date(), by]);
}
function users_() {
  return credSheet_().getDataRange().getValues().slice(1).filter(r => r[0]).map((r, i) => ({ row: i + 2, username: String(r[0]), email: String(r[1]), salt: String(r[2]), hash: String(r[3]), role: String(r[4]).toLowerCase(), active: String(r[5]).toLowerCase() === 'yes' }));
}
function login_(q, cache) {
  const u = users_().find(x => x.username.toLowerCase() === String(q.user).trim().toLowerCase());
  if (!u || !u.active || u.hash !== hash_(u.salt, String(q.pass))) { Utilities.sleep(700); throw new Error('Wrong username or password.'); }
  const token = Utilities.getUuid();
  cache.put('t_' + token, JSON.stringify({ user: u.username }), 21600);   // 6 hours
  return { ok: true, token, role: u.role, user: u.username };
}
function listUsers_() { return { ok: true, users: users_().map(u => ({ username: u.username, email: u.email, role: u.role, active: u.active })) }; }
function addUser_(a, q) {
  if (!(CREATE[a.role] || []).includes(q.role)) throw new Error('You cannot create that role.');
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(q.username || '')) throw new Error('Username: 3-30 letters, numbers, . _ -');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.email || '')) throw new Error('Enter a valid email address.');
  if (String(q.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (users_().some(u => u.username.toLowerCase() === q.username.toLowerCase())) throw new Error('That username already exists.');
    saveUser_(credSheet_(), q.username, q.email, q.password, q.role, a.user);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function setUser_(a, q) {
  const t = users_().find(u => u.username === q.username);
  if (!t || !(CREATE[a.role] || []).includes(t.role) || t.username === a.user) throw new Error('You cannot change this account.');
  const s = credSheet_();
  if (q.password) {
    if (String(q.password).length < 8) throw new Error('Password must be at least 8 characters.');
    const salt = Utilities.getUuid(); s.getRange(t.row, 3, 1, 2).setValues([[salt, hash_(salt, q.password)]]);
  }
  if (typeof q.active === 'boolean') s.getRange(t.row, 6).setValue(q.active ? 'Yes' : 'No');
  return { ok: true };
}

/* ---------- public form (no login, write only) ---------- */
function publicSubmit_(q, cache) {
  const key = PropertiesService.getScriptProperties().getProperty('FORM_KEY');
  if (key && q.formKey !== key) throw new Error('Form is not authorised.');
  if (q.row.website) throw new Error('Rejected.');
  const hr = 'h_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH'), n = Number(cache.get(hr) || 0);
  if (n >= 60) throw new Error('Too many submissions this hour. Try again later.');
  cache.put(hr, String(n + 1), 3600);
  addRow_(q.row);
  return { ok: true };
}

/* ---------- change tracking (lets the website refresh within seconds of any edit) ---------- */
const bump_ = () => PropertiesService.getScriptProperties().setProperty('VER', String(Date.now()));
const ver_ = () => PropertiesService.getScriptProperties().getProperty('VER') || '0';
function onSheetChange() { bump_(); }               // run by the installable triggers below
function setupTriggers() {                          // run once from the editor
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'onSheetChange').forEach(t => ScriptApp.deleteTrigger(t));
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  bump_();
}

/* ---------- Summary sheet ---------- */
const sheet_ = () => SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
const d_ = v => { if (!v) return ''; const p = String(v).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
function lastDataRow_(s) {
  const v = s.getRange(FIRST, 1, Math.max(1, s.getMaxRows() - FIRST + 1), 2).getValues();
  let last = FIRST - 1;
  v.forEach((r, i) => { if (typeof r[0] === 'number' && String(r[1]).trim()) last = FIRST + i; });
  return last;
}
function getData_() {
  const s = sheet_(), last = lastDataRow_(s), tz = s.getParent().getSpreadsheetTimeZone();
  const ver = ver_();
  if (last < FIRST) return { ok: true, rows: [], ver };
  const rows = [];
  s.getRange(FIRST, 1, last - FIRST + 1, COLS).getValues().forEach((r, i) => {
    if (String(r[1]).trim()) rows.push(r.map(c => c instanceof Date ? Utilities.formatDate(c, tz, 'yyyy-MM-dd') : c).concat(FIRST + i));   // last item = sheet row number
  });
  return { ok: true, rows, ver };
}
function clean_(r) {                                 // stop text being treated as a formula; cap length
  const o = {};
  Object.keys(r).forEach(k => { let v = String(r[k] == null ? '' : r[k]).slice(0, 2000); if (/^[=+@-]/.test(v) && !/^-?\d/.test(v)) v = "'" + v; o[k] = v; });
  return o;
}
function writeRow_(s, n, r) {
  r = clean_(r);
  ['veh', 'ws', 'site', 'wo', 'cdate', 'cat', 'complaint'].forEach(k => { if (!r[k].trim()) throw new Error('Missing field: ' + k); });
  const loan = r.loan !== '' && isNaN(Number(r.loan)) ? r.loan : (Number(r.loan) || '');   // keeps text such as ZAR / MEDIVEST
  s.getRange(n, 2, 1, 6).setValues([[r.veh.trim(), r.ws, r.site.trim().toUpperCase(), r.wo.trim(), d_(r.cdate), d_(r.edate)]]);
  s.getRange(n, 8, 1, 3).setFormulas([[`=TODAY()-F${n}+1`, `=IF(H${n}<=30,1,"")`, `=IF(H${n}>30,1,"")`]]);   // H ageing, I <=30d, J >30d
  s.getRange(n, 11, 1, 14).setValues([[loan, r.cat, r.complaint, r.prNo, d_(r.prDate), r.status, r.mech, r.mechTel, r.panel, r.panelTel, r.rTitle, r.rNo, d_(r.rDate), r.price === '' ? '' : Number(r.price)]]);
}
function addRow_(r) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = sheet_(), last = lastDataRow_(s), n = last + 1;
    s.insertRowAfter(last);
    s.getRange(last, 1, 1, COLS).copyTo(s.getRange(n, 1, 1, COLS), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    s.getRange(n, 1).setValue((Number(s.getRange(last, 1).getValue()) || 0) + 1);
    writeRow_(s, n, r);
    bump_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function updateRow_(r) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = sheet_(), n = Number(r.row);
    if (!(n >= FIRST && n <= lastDataRow_(s)) || String(s.getRange(n, 2).getValue()).trim() !== String(r.orig).trim()) throw new Error('This row has changed. Refresh and try again.');
    writeRow_(s, n, r);
    bump_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
