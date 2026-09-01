import { $, el, NAME, updateScroller } from './ui.js';
import { iso, todayStr, streakFrom } from './lib.js';
import { push as qpush, peek as qpeek, flush as qflush } from './queue.js';

// ── Supabase ──
var SBURL = window.SUPABASE_URL || '';
var KEY = window.SUPABASE_ANON_KEY || '';
var configured = KEY && KEY.indexOf('PASTE_') === -1 && !!window.supabase;
var sb = configured ? window.supabase.createClient(SBURL, KEY) : null;
var user = null, inited = false;
export function client() { return sb; }
export function currentUser() { return user; }

const TASK_LISTENERS = [];
export function onTaskChange(fn) { TASK_LISTENERS.push(fn); }
function notifyTaskChange() { TASK_LISTENERS.forEach(function (fn) { try { fn(); } catch (e) { console.error('task listener', e); } }); }

// ════════════ DATA LAYER ════════════
var pColor = { P1: 'var(--accent)', P2: '#8E8A82', P3: '#5A5752' };

var tasksCache = [];
var ventureNames = {};
async function initTasks() {
  var res = await sb.from('tasks').select('*').order('position', { ascending: true });
  tasksCache = res.data || [];
  var vres = await sb.from('ventures').select('id, name');
  ventureNames = {};
  (vres.data || []).forEach(function (v) { ventureNames[v.id] = v.name; });
  renderTasks();
}
function renderTasks() {
  var listEl = $('tasks-list'), sumEl = $('tasks-summary'), loopsEl = $('today-loops');
  listEl.innerHTML = ''; loopsEl.innerHTML = '';
  var done = 0;
  tasksCache.forEach(function (t) {
    if (t.done) done++;
    var row = el('div', { class: 'task-row' + (t.done ? ' done' : ''), style: 'display:grid;grid-template-columns:18px 40px 1fr;gap:14px;align-items:center;padding:18px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML = '<div class="check"></div><div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:' + (pColor[t.priority] || '#8E8A82') + '">' + t.priority + '</div><div class="task-label" style="font-size:16px;color:#C9C5BC"></div>';
    row.querySelector('.task-label').textContent = t.label;
    if (t.venture_id && ventureNames[t.venture_id]) {
      var vtag = el('span', { style: 'font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;margin-left:10px' });
      vtag.textContent = ventureNames[t.venture_id];
      row.querySelector('.task-label').appendChild(vtag);
    }
    row.addEventListener('click', function () { toggleTask(t); });
    listEl.appendChild(row);
  });
  qpeek().forEach(function (q) {
    var row = el('div', { class: 'task-row', style: 'display:grid;grid-template-columns:18px 40px 1fr;gap:14px;align-items:center;padding:18px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML = '<div class="check"></div><div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752">\u00b7\u00b7</div><div class="task-label" style="font-size:16px;color:#5A5752"></div>';
    row.querySelector('.task-label').textContent = q.label;
    listEl.appendChild(row);
  });
  sumEl.textContent = done + ' of ' + tasksCache.length + ' closed today';
  var open = tasksCache.filter(function (t) { return !t.done; }).slice(0, 4);
  if (open.length < 4) open = open.concat(tasksCache.filter(function (t) { return t.done; }).slice(0, 4 - open.length));
  open.forEach(function (t) {
    var d = el('div', { style: 'display:flex;gap:13px;align-items:center' });
    d.innerHTML = '<div style="width:13px;height:13px;flex:none;border:1.5px solid ' + (t.done ? 'var(--accent)' : 'rgba(244,241,234,.28)') + ';background:' + (t.done ? 'var(--accent)' : 'transparent') + '"></div><div class="lbl" style="font-size:14px;color:' + (t.done ? '#5A5752' : '#C9C5BC') + ';text-decoration:' + (t.done ? 'line-through' : 'none') + '"></div>';
    d.querySelector('.lbl').textContent = t.label; loopsEl.appendChild(d);
  });
  var pd = $('pulse-done'); if (pd) pd.textContent = done;
}
async function toggleTask(t) { t.done = !t.done; renderTasks(); await sb.from('tasks').update({ done: t.done }).eq('id', t.id); notifyTaskChange(); }
async function addTask(label) {
  var pos = tasksCache.length ? Math.max.apply(null, tasksCache.map(function (t) { return t.position; })) + 1 : 0;
  var sel = $('task-venture');
  var vid = sel && sel.value ? sel.value : null;
  try {
    var res = await sb.from('tasks').insert({ user_id: user.id, label: label, priority: 'P2', position: pos, venture_id: vid }).select().single();
    if (res.error) throw res.error;
    if (res.data) { tasksCache.push(res.data); renderTasks(); notifyTaskChange(); }
    return true;
  } catch (e) {
    // Offline, or the write was rejected: keep the capture and show it greyed.
    console.error('addTask queued', e);
    qpush(label);
    renderTasks();
    return false;
  }
}
$('task-add').addEventListener('click', function () { var inp = $('task-input'); var v = inp.value.trim(); if (v && sb && user) { addTask(v); inp.value = ''; } });
$('task-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('task-add').click(); });

var habitsCache = [], logsByHabit = {};
async function initHabits() {
  var res = await sb.from('habits').select('*').order('position', { ascending: true });
  habitsCache = res.data || [];
  var logs = (await sb.from('habit_logs').select('habit_id, log_date')).data || [];
  logsByHabit = {};
  logs.forEach(function (l) { (logsByHabit[l.habit_id] = logsByHabit[l.habit_id] || new Set()).add(l.log_date); });
  renderHabits();
}
function streakOf(id) {
  return streakFrom(logsByHabit[id] || new Set());
}
function renderHabits() {
  var listEl = $('habits-list'); listEl.innerHTML = ''; var top = 0;
  habitsCache.forEach(function (t) {
    var set = logsByHabit[t.id] || new Set(), done = set.has(todayStr()), streak = streakOf(t.id);
    if (streak > top) top = streak;
    var row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)' });
    var left = el('div', { style: 'display:flex;align-items:center;gap:16px' });
    var pip = el('div', { class: 'habit-pip' + (done ? ' done' : '') });
    var label = el('div', null, '<div style="font-family:\'Oswald\',sans-serif;font-weight:500;font-size:20px;text-transform:uppercase;letter-spacing:.4px;color:#E6E2DA"></div>');
    label.querySelector('div').textContent = t.name; left.appendChild(pip); left.appendChild(label);
    var se = el('div', { style: 'font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--accent)' }, streak + ' day streak');
    row.appendChild(left); row.appendChild(se);
    pip.addEventListener('click', function () { toggleHabit(t); });
    listEl.appendChild(row);
  });
  var ps = $('pulse-streak'); if (ps) ps.textContent = top + 'd';
}
async function toggleHabit(t) {
  var set = logsByHabit[t.id] = logsByHabit[t.id] || new Set(), today = todayStr();
  if (set.has(today)) { set.delete(today); renderHabits(); await sb.from('habit_logs').delete().eq('habit_id', t.id).eq('log_date', today); }
  else { set.add(today); renderHabits(); await sb.from('habit_logs').insert({ user_id: user.id, habit_id: t.id, log_date: today }); }
}

// HEALTH
var health = { water: 0, workout: false };
async function initHealth() {
  var res = await sb.from('health_logs').select('*').eq('log_date', todayStr()).maybeSingle();
  if (res.data) { health.water = res.data.water_glasses; health.workout = res.data.workout_done; } else { health.water = 0; health.workout = false; }
  renderHealth();
}
function renderHealth() {
  var pipsEl = $('water-pips'); pipsEl.innerHTML = '';
  for (var i = 0; i < 8; i++) pipsEl.appendChild(el('div', { class: 'water-pip' + (i < health.water ? ' full' : '') }));
  $('water-count').textContent = health.water + ' / 8';
  var wpip = $('workout-pip'), wlabel = $('workout-label');
  wpip.classList.toggle('done', health.workout);
  wlabel.textContent = health.workout ? 'Done — nice.' : 'Not done yet';
  wlabel.style.color = health.workout ? 'var(--accent)' : '#C9C5BC';
}
async function saveHealth() { await sb.from('health_logs').upsert({ user_id: user.id, log_date: todayStr(), water_glasses: health.water, workout_done: health.workout, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date' }); }
$('water-plus').addEventListener('click', function () { if (sb && user && health.water < 8) { health.water++; renderHealth(); saveHealth(); } });
$('water-minus').addEventListener('click', function () { if (sb && user && health.water > 0) { health.water--; renderHealth(); saveHealth(); } });
$('workout-pip').addEventListener('click', function () { if (sb && user) { health.workout = !health.workout; renderHealth(); saveHealth(); } });

export async function refreshVentureNames() {
  var vres = await sb.from('ventures').select('id, name');
  ventureNames = {};
  (vres.data || []).forEach(function (v) { ventureNames[v.id] = v.name; });
  renderTasks();
}

const SECTION_INITS = [];
export function onInit(fn) { SECTION_INITS.push(fn); }

async function initData() {
  if (inited) return; inited = true;
  var u = await sb.auth.getUser(); user = u.data.user;
  $('signout-rail').style.display = 'block';
  try { await initTasks(); await initHabits(); await initHealth(); } catch (e) { console.error('initData', e); }
  try { await qflush(addTask); } catch (e) { console.error('queue flush', e); }
  for (const fn of SECTION_INITS) {
    try { await fn(); } catch (e) { console.error('section init', e); }
  }
  updateScroller();
}

// ════════════ LOCK / AUTH ════════════
var lock = $('lock'), paneSignin = $('lock-signin'), paneHold = $('lock-hold'), liMsg = $('li-msg');
function showLock() { lock.classList.add('show'); }
function hideLock() { lock.classList.remove('show'); }
function liShow(t, cls) { liMsg.textContent = t || ''; liMsg.className = 'lock-msg' + (cls ? ' ' + cls : ''); }

// hold-to-enter ring
var CIRC = 339.292, prog = $('hb-prog'), holdbtn = $('holdbtn'), DUR = 1100, raf = null, startT = 0, holding = false;
function setProg(p) { prog.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(1); }
function holdStep() {
  var t = performance.now() - startT, p = Math.min(1, t / DUR); setProg(p);
  if (p >= 1) { holding = false; holdbtn.classList.remove('active'); enterApp(); return; }
  raf = requestAnimationFrame(holdStep);
}
function holdStart(e) { if (e) e.preventDefault(); if (holding) return; holding = true; holdbtn.classList.add('active'); $('hb-label').textContent = '···'; startT = performance.now(); cancelAnimationFrame(raf); holdStep(); }
function holdEnd() { if (!holding) return; holding = false; holdbtn.classList.remove('active'); $('hb-label').textContent = 'Hold'; cancelAnimationFrame(raf); setProg(0); }
holdbtn.addEventListener('pointerdown', holdStart);
holdbtn.addEventListener('pointerup', holdEnd);
holdbtn.addEventListener('pointerleave', holdEnd);
holdbtn.addEventListener('pointercancel', holdEnd);

function enterApp() { hideLock(); initData(); }

// sign-in (first run on a device)
if ($('li-email') && NAME) { $('li-email').value = 'mithun@noteos.in'; }
$('li-go').addEventListener('click', async function () {
  var email = $('li-email').value.trim(), pass = $('li-pass').value;
  if (!email || !pass) return liShow('Enter email and password.', 'err');
  liShow('Checking…');
  var r = await sb.auth.signInWithPassword({ email: email, password: pass });
  if (!r.error) { liShow('Welcome.', 'ok'); enterApp(); return; }
  // Single-user app: signups are disabled, so never fall back to signUp — doing so
  // replaced the real sign-in error with a misleading "Signups not allowed" message.
  liShow(r.error.message, 'err');
});
$('li-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('li-go').click(); });

// sign out
function signOut() { if (sb) sb.auth.signOut().then(function () { location.reload(); }); else location.reload(); }
$('signout-rail').addEventListener('click', signOut);
$('ns-signout').addEventListener('click', signOut);

// ════════════ BOOT ════════════
export async function boot() {
  if (!sb) {
    paneSignin.style.display = 'block'; showLock();
    liShow('Backend not configured. Add your Supabase anon key in supabase-config.js.', 'err');
    $('li-email').style.display = 'none'; $('li-pass').style.display = 'none'; $('li-go').style.display = 'none';
    return;
  }
  var s = await sb.auth.getSession();
  if (s.data.session) {
    hideLock();
    initData();
  } else {
    $('li-sub').textContent = 'Sign in to begin';
    paneSignin.style.display = 'block';
    showLock();
  }
  sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_OUT') location.reload(); });
}
