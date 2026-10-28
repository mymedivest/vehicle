/* ===== CONFIG: paste your deployed Google Apps Script web app URL ===== */
const CONFIG = { API_URL: 'https://script.google.com/macros/s/AKfycbzQ2wErd2e6oo64MIEI6kHdeRcmEOdsh3Vs6zA1DNM8L5s9-2SpfzQ5P3M9LoXMRUwH/exec', POLL_SEC: 10 };

const CATS = ['Engine','Aircond System','Transmission System','Steering System','Door','Wiring','Wheel System','Tyre','Exhaust System','Electronic System','Radio','PPM','Gearbox','Clutch','Immobiliser','Others','Multiple Issues'];
const KW = [['Engine',/eng|enj|enig/],['Aircond System',/air ?cond|a\/c/],['Transmission System',/transmission/],['Steering System',/steering/],['Door',/door|pintu/],['Wiring',/wiring|wayar/],['Wheel System',/wheel/],['Tyre',/tyre|tayar/],['Exhaust System',/exhaust|ekzos/],['Electronic System',/electronic/],['Radio',/radio/],['PPM',/ppm/],['Gearbox',/gear ?box/],['Clutch',/clutch/],['Immobiliser',/immobili/]];
const C = { g:'#2fb67c', y:'#f0a020', r:'#e5484d', b:'#3b82f6' };
const BUCKETS = [['< 7 days', C.g], ['7–30 days', C.y], ['> 30 days', C.r]];

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let lastVer = null, tok = sessionStorage.getItem('tok'), role = sessionStorage.getItem('role'), me = sessionStorage.getItem('me'), rows = [], charts = {};
const ACCESS = { dash: ['webmaster', 'manager', 'others'], list: ['webmaster', 'manager', 'staff', 'others'], form: ['webmaster', 'manager', 'staff'], users: ['webmaster', 'manager'] };
const ROLE_LABEL = { webmaster: 'Webmaster', manager: 'Manager', staff: 'Staff', others: 'Viewer' };
const CREATABLE = { webmaster: ['webmaster', 'manager', 'staff', 'others'], manager: ['manager', 'staff', 'others'] };
const can = t => (ACCESS[t] || []).includes(role), canEdit = () => can('form');

Chart.defaults.font.family = "'JetBrains Mono',monospace";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#667085';

/* ---------- API ---------- */
async function api(action, payload = {}) {
  if (CONFIG.API_URL.startsWith('PASTE')) throw new Error('Set API_URL in script.js first.');
  const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: tok, ...payload }) });
  const j = await res.json();
  if (!j.ok) { if (/expired|login/i.test(j.error)) logout(); throw new Error(j.error); }
  return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500); }

/* ---------- auth ---------- */
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const b = e.target.querySelector('button'); b.disabled = true; $('#loginErr').textContent = '';
  try {
    const j = await api('login', { user: $('#u').value.trim(), pass: $('#p').value });
    tok = j.token; role = j.role; me = j.user; sessionStorage.setItem('tok', tok); sessionStorage.setItem('role', role); sessionStorage.setItem('me', me); start();
  } catch (err) { $('#loginErr').textContent = err.message; }
  b.disabled = false;
};
function logout() { sessionStorage.clear(); tok = role = me = null; $('#app').hidden = true; $('#login').hidden = false; $('#p').value = ''; }
$('#logout').onclick = logout;

/* ---------- data ---------- */
function norm(t) {
  t = String(t || '').toLowerCase();
  const m = KW.filter(k => k[1].test(t)).map(k => k[0]);
  return m.length > 1 || /multiple/.test(t) ? 'Multiple Issues' : m[0] || 'Others';
}
function parse(a) {
  const iso = /^\d{4}-\d\d-\d\d$/.test(a[5]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const age = iso ? Math.round((today - new Date(a[5] + 'T00:00:00')) / 864e5) + 1 : Number(a[7]) || 0;   // today - complaint date + 1
  const n = parseFloat(a[10]);
  const loan = isNaN(n) ? (/[a-z0-9]/i.test(String(a[10])) ? 1 : 0) : n;
  return {
    no: a[0], veh: String(a[1]).trim(), ws: String(a[2]).trim().toUpperCase(), site: String(a[3]).trim().toUpperCase() || 'N/A',
    wo: String(a[4]).replace(/\s+/g, ' '), nWo: (String(a[4]).match(/F\d+/gi) || []).length || 1,
    cdate: iso ? a[5] : String(a[5]), age, b: age < 7 ? 0 : age <= 30 ? 1 : 2, loan,
    cat: norm(a[11]), raw: a, row: a[24], complaint: String(a[12]), pr: String(a[13]).replace(/\s+/g, ' '), status: String(a[15]), mech: a[16]
  };
}
async function load(quiet) {
  try {
    const j = await api('data'); lastVer = j.ver;
    rows = j.rows.map(parse);
    $('#asof').textContent = 'updated ' + new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' });
    fillFilters(); if (can('dash')) render(); renderList();
    $('#siteList').innerHTML = [...new Set(rows.map(r => r.site))].sort().map(s => `<option value="${esc(s)}">`).join('');
  } catch (e) { if (!quiet) toast(e.message); }
}

/* ---------- dashboard ---------- */
const uniq = k => [...new Set(rows.map(r => r[k]))].sort();
function fillFilters() {
  const keep = [$('#fSite').value, $('#fWs').value];
  $('#fSite').innerHTML = '<option value="">All sites</option>' + uniq('site').map(s => `<option>${esc(s)}</option>`).join('');
  $('#fWs').innerHTML = '<option value="">All workshops</option>' + uniq('ws').map(s => `<option>${esc(s)}</option>`).join('');
  $('#fSite').value = keep[0] || ''; $('#fWs').value = keep[1] || '';
}
const filtered = () => rows.filter(r => (!$('#fSite').value || r.site === $('#fSite').value) && (!$('#fWs').value || r.ws === $('#fWs').value));
const cnt = (l, b) => l.filter(r => r.b === b).length;

function mk(id, cfg) {
  charts[id]?.destroy();
  cfg.options = { responsive: true, maintainAspectRatio: false, ...cfg.options };
  charts[id] = new Chart(document.getElementById(id), cfg);
}
function stacked(id, key, list) {
  const keys = uniqBy(list, key);
  mk(id, { type: 'bar', data: { labels: keys, datasets: BUCKETS.map((d, i) => ({ label: d[0], backgroundColor: d[1], data: keys.map(k => list.filter(r => r[key] === k && r.b === i).length) })) },
    options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } } });
}
const uniqBy = (list, key) => [...new Set(list.map(r => r[key]))].sort((a, b) => list.filter(r => r[key] === b).length - list.filter(r => r[key] === a).length);

function render() {
  const l = filtered(), n = l.length, avg = n ? Math.round(l.reduce((s, r) => s + r.age, 0) / n) : 0;
  const loans = l.reduce((s, r) => s + r.loan, 0);
  const k = (t, v, s, c) => `<div class="kpi" style="--c:${c}"><small>${t}</small><b>${v}</b><span>${s}</span></div>`;
  $('#kpis').innerHTML =
    k('Open vehicles', n, `${l.reduce((s, r) => s + r.nWo, 0)} work orders`, C.b) +
    k('Under 7 days', cnt(l, 0), pct(cnt(l, 0), n) + '% of open', C.g) +
    k('7 – 30 days', cnt(l, 1), pct(cnt(l, 1), n) + '% of open', C.y) +
    k('Over 30 days', cnt(l, 2), pct(cnt(l, 2), n) + '% of open', C.r) +
    k('Loaners out', loans, `${l.filter(r => r.loan).length} vehicles with loaner`, '#8b5cf6') +
    k('Avg ageing', avg, 'days since complaint', '#0ea5e9');

  mk('cAge', { type: 'doughnut', data: { labels: BUCKETS.map(b => b[0]), datasets: [{ data: [0, 1, 2].map(i => cnt(l, i)), backgroundColor: BUCKETS.map(b => b[1]), borderWidth: 0 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} (${pct(c.raw, n)}%)` } } } } });
  stacked('cSite', 'site', l);
  stacked('cWs', 'ws', l);
  loaner(); category();
}
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;

function loaner() {
  const key = $('#loanBy').value, l = filtered(), keys = uniqBy(l, key);
  mk('cLoan', { type: 'bar', data: { labels: keys, datasets: [{ label: 'Loaner ambulances', backgroundColor: '#8b5cf6', data: keys.map(x => l.filter(r => r[key] === x).reduce((s, r) => s + r.loan, 0)) }] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } });
}
function category() {
  const sc = $('#catScope').value, item = $('#catItem');
  if (sc === 'all') item.hidden = true;
  else {
    const opts = uniq(sc), cur = item.value;
    item.innerHTML = opts.map(o => `<option>${esc(o)}</option>`).join(''); item.hidden = false;
    item.value = opts.includes(cur) ? cur : opts[0];
  }
  const l = sc === 'all' ? rows : rows.filter(r => r[sc] === item.value), n = l.length;
  const data = CATS.map(c => [c, l.filter(r => r.cat === c).length]).filter(d => d[1]).sort((a, b) => b[1] - a[1]);
  mk('cCat', { type: 'bar', data: { labels: data.map(d => `${d[0]} (${pct(d[1], n)}%)`), datasets: [{ backgroundColor: C.b, data: data.map(d => d[1]) }] },
    options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } });
  $('#catTable').innerHTML = `<table><tr><th>Category</th><th>Count</th><th>%</th><th></th></tr>${data.map(d => `<tr><td>${esc(d[0])}</td><td>${d[1]}</td><td>${pct(d[1], n)}%</td><td style="width:90px"><div class="bar" style="width:${pct(d[1], n)}%"></div></td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${n}</b></td><td><b>100%</b></td><td></td></tr></table>`;
}

/* ---------- work order list ---------- */
const cell = (r, i) => String(r.raw[i] ?? '').replace(/\s+/g, ' ').trim();
const lastLine = r => r.status.split('\n').filter(x => x.trim()).pop() || '';
const priceOf = r => r.raw[23] === '' || isNaN(Number(r.raw[23])) ? cell(r, 23) : Number(r.raw[23]);
/* h = header, v = value used for sorting, t = table cell. Order matches the Summary sheet. */
const COLS = [
  { h: 'No', v: r => Number(r.no), t: r => `<td>${esc(r.no)}</td>` },
  { h: 'Vehicle', v: r => r.veh, t: r => `<td><b>${esc(r.veh)}</b></td>` },
  { h: 'WS', v: r => r.ws, t: r => `<td>${esc(r.ws)}</td>` },
  { h: 'Site', v: r => r.site, t: r => `<td>${esc(r.site)}</td>` },
  { h: 'WO no', v: r => r.wo, t: r => `<td>${esc(r.wo)}</td>` },
  { h: 'Complaint date', v: r => r.cdate, t: r => `<td>${esc(r.cdate)}</td>` },
  { h: 'Entry date', v: r => cell(r, 6), t: r => `<td>${esc(cell(r, 6))}</td>` },
  { h: 'Age', v: r => r.age, t: r => `<td><span class="pill ${['g', 'y', 'r'][r.b]}">${r.age}</span></td>` },
  { h: 'Loaner', v: r => r.loan || '', t: r => `<td>${r.loan || ''}</td>` },
  { h: 'Category', v: r => r.cat, t: r => `<td>${esc(r.cat)}</td>` },
  { h: 'Complaint', v: r => r.complaint, t: r => `<td>${esc(r.complaint)}</td>` },
  { h: 'PR no', v: r => cell(r, 13), t: r => `<td>${esc(cell(r, 13))}</td>` },
  { h: 'Latest status', v: r => lastLine(r), t: r => `<td class="st" title="${esc(r.status)}">${esc(lastLine(r).slice(0, 140))}</td>` },
  { h: 'Mechanic', v: r => cell(r, 16), t: r => `<td>${esc(cell(r, 16))}</td>` },
  { h: 'Panel workshop', v: r => cell(r, 18), t: r => `<td>${esc(cell(r, 18))}</td>` },
  { h: 'Price', v: priceOf, t: r => { const p = priceOf(r); return `<td>${esc(typeof p === 'number' ? p.toLocaleString('en-MY') : p)}</td>`; } }
];
let sort = { i: 7, d: -1 };                          // default: Age, oldest first
const isEmpty = v => v === '' || v == null || (typeof v === 'number' && isNaN(v));

function renderList() {
  const q = $('#q').value.toLowerCase(), col = COLS[sort.i];
  const l = rows.filter(r => !q || Object.values(r).join(' ').toLowerCase().includes(q)).sort((x, y) => {
    const a = col.v(x), b = col.v(y), ea = isEmpty(a), eb = isEmpty(b);
    if (ea || eb) return ea - eb;                    // blanks always last
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return c * sort.d || x.row - y.row;
  });
  $('#count').textContent = l.length + ' vehicles';
  $('#list').innerHTML = '<tr>' + COLS.map((c, i) => `<th aria-sort="${i === sort.i ? (sort.d > 0 ? 'ascending' : 'descending') : 'none'}"><button class="sortbtn" data-i="${i}" title="Sort by ${esc(c.h)}">${esc(c.h)}<span>${i === sort.i ? (sort.d > 0 ? '▲' : '▼') : ''}</span></button></th>`).join('') + (canEdit() ? '<th></th>' : '') + '</tr>' +
    l.map(r => '<tr>' + COLS.map(c => c.t(r)).join('') + (canEdit() ? `<td><button class="btn sm" data-row="${r.row}">Edit</button></td>` : '') + '</tr>').join('');
}

/* ---------- form ---------- */
$('#catSel').innerHTML = '<option value="">Select</option>' + CATS.map(c => `<option>${c}</option>`).join('');
$('#woForm').onsubmit = async e => {
  e.preventDefault();
  const b = $('#saveBtn'); b.disabled = true; b.textContent = 'Saving...';
  try {
    await api('add', { row: Object.fromEntries(new FormData(e.target)) });
    toast('Work order added to the Summary sheet'); e.target.reset(); $('#newDlg').close(); await load();
  } catch (err) { toast('Could not save: ' + err.message); }
  b.disabled = false; b.textContent = 'Add to Summary sheet';
};

/* ---------- ui wiring ---------- */
function showTab(t) {
  $$('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  $$('.tab').forEach(x => x.hidden = x.id !== 'tab-' + t);
  if (t === 'users') loadUsers();
}
$$('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
['#fSite', '#fWs'].forEach(s => $(s).onchange = render);
$('#reset').onclick = () => { $('#fSite').value = $('#fWs').value = ''; render(); };
$('#loanBy').onchange = loaner; $('#catScope').onchange = category; $('#catItem').onchange = category;
$('#submitNew').onclick = () => $('#newDlg').showModal(); $('#newCancel').onclick = () => $('#newDlg').close();
$('#q').oninput = renderList; $('#refresh').onclick = load;
setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) + ' MYT', 1000);

function start() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${me} (${ROLE_LABEL[role]})`;
  $$('nav button').forEach(b => b.hidden = !can(b.dataset.tab));
  $('#submitNew').hidden = !canEdit();
  showTab(['dash', 'list'].find(can)); load();
}
if (tok && role) start();
async function poll() {                              // refresh only when the sheet has changed
  if (!tok || document.hidden) return;
  try { const j = await api('ver'); if (j.ver !== lastVer) await load(true); } catch (e) { /* keep quiet; next poll retries */ }
}
setInterval(poll, CONFIG.POLL_SEC * 1000);
document.addEventListener('visibilitychange', poll);

/* ---------- edit a row (Webmaster, Manager, Staff) ---------- */
const MAP = { veh: 1, ws: 2, site: 3, wo: 4, cdate: 5, edate: 6, loan: 10, complaint: 12, prNo: 13, prDate: 14, status: 15, mech: 16, mechTel: 17, panel: 18, panelTel: 19, rTitle: 20, rNo: 21, rDate: 22, price: 23 };
let editing = null;
$('#list').onclick = e => {
  const h = e.target.closest('[data-i]');
  if (h) { const i = +h.dataset.i; sort = { i, d: sort.i === i ? -sort.d : 1 }; renderList(); return; }   // click a header to sort; click again to reverse
  const b = e.target.closest('[data-row]'); if (b) openEdit(rows.find(r => r.row == b.dataset.row));
};
function openEdit(r) {
  editing = r; const f = $('#editForm');
  f.innerHTML = $('#woForm').innerHTML;
  f.querySelector('#saveBtn').parentElement.innerHTML = '<button class="btn primary">Save changes</button> <button type="button" class="btn" id="editCancel">Cancel</button>';
  for (const [name, i] of Object.entries(MAP)) {
    const v = r.raw[i], el = f.elements[name];
    el.value = /date$/i.test(name) ? (/^\d{4}-\d\d-\d\d$/.test(v) ? v : '') : name === 'loan' ? (isNaN(parseFloat(v)) ? '' : v) : v;
    if (name === 'loan' && isNaN(parseFloat(v)) && v) el.placeholder = String(v);
  }
  f.elements.cat.value = r.cat;
  $('#editCancel').onclick = () => $('#editDlg').close();
  f.onsubmit = async e => {
    e.preventDefault();
    const row = Object.fromEntries(new FormData(f));
    if (row.loan === '' && editing.raw[10] !== '' && isNaN(parseFloat(editing.raw[10]))) row.loan = editing.raw[10];   // keep text such as ZAR
    row.row = editing.row; row.orig = editing.veh;
    try { await api('update', { row }); $('#editDlg').close(); toast('Work order updated'); load(); }
    catch (err) { toast('Could not save: ' + err.message); }
  };
  $('#editDlg').showModal();
}

/* ---------- users (Webmaster, Manager) ---------- */
async function loadUsers() {
  try {
    $('#roleSel').innerHTML = CREATABLE[role].map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('');
    const j = await api('listUsers');
    $('#userList').innerHTML = '<tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>' + j.users.map(u => {
      const mine = CREATABLE[role].includes(u.role) && u.username.toLowerCase() !== me.toLowerCase();
      return `<tr><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${ROLE_LABEL[u.role] || esc(u.role)}</td><td>${u.active ? 'Active' : 'Disabled'}</td><td>${mine ? `<button class="btn sm" data-u="${esc(u.username)}" data-a="${u.active ? 'off' : 'on'}">${u.active ? 'Disable' : 'Enable'}</button> <button class="btn sm" data-u="${esc(u.username)}" data-a="pw">Reset password</button>` : ''}</td></tr>`;
    }).join('');
  } catch (e) { toast(e.message); }
}
$('#userForm').onsubmit = async e => {
  e.preventDefault();
  try { await api('addUser', Object.fromEntries(new FormData(e.target))); toast('User added'); e.target.reset(); loadUsers(); }
  catch (err) { toast(err.message); }
};
$('#userList').onclick = async e => {
  const b = e.target.closest('[data-u]'); if (!b) return;
  const p = { username: b.dataset.u };
  if (b.dataset.a === 'pw') { p.password = prompt('New password for ' + p.username + ' (min 8 characters):'); if (!p.password) return; }
  else p.active = b.dataset.a === 'on';
  try { await api('setUser', p); toast('Updated ' + p.username); loadUsers(); } catch (err) { toast(err.message); }
};
