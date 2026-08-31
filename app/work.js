import { $, el } from './ui.js';
import { isQuiet, iso } from './lib.js';
import { client, currentUser, onInit, onTaskChange } from './data.js';

const STAGE_COLOR = { BUILDING: 'var(--accent)', ACTIVE: '#C9C5BC', STEADY: '#8E8A82', PAUSED: '#5A5752' };

export async function loadWork() {
  const sb = client();
  const vres = await sb.from('ventures').select('*').order('sort_order');
  const ventures = vres.data || [];
  const tres = await sb.from('tasks').select('id, venture_id, done, label, created_at');
  const tasks = tres.data || [];

  const host = $('projects-list');
  if (!host) return;
  host.innerHTML = '';
  ventures.forEach(function (v, i) {
    const mine = tasks.filter(function (t) { return t.venture_id === v.id; });
    const open = mine.filter(function (t) { return !t.done; });
    const last = mine.reduce(function (acc, t) {
      const d = iso(new Date(t.created_at));
      return !acc || d > acc ? d : acc;
    }, null);
    const quiet = isQuiet(last);
    const stage = (v.stage || 'ACTIVE').toUpperCase();
    const idx = 'P-' + (i < 9 ? '0' : '') + (i + 1);

    const r = el('div', { class: 'venture-row', style: 'display:grid;grid-template-columns:54px 1fr auto;gap:18px;align-items:center;padding:24px 4px 24px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752">' + idx + '</div>' +
      '<div><div class="v-name" style="font-family:\'Oswald\',sans-serif;font-weight:600;font-size:26px;letter-spacing:.5px;text-transform:uppercase;color:#F4F1EA"></div>' +
      '<div class="v-next" style="font-size:14px;color:#8E8A82;margin-top:4px"></div></div>' +
      '<div style="text-align:right"><div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' + (quiet ? '#E8705B' : (STAGE_COLOR[stage] || '#C9C5BC')) + '">' + (quiet ? 'QUIET' : stage) + '</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;margin-top:6px">' + open.length + ' open</div></div>';
    r.querySelector('.v-name').textContent = v.name;
    r.querySelector('.v-next').textContent = v.next_milestone || (open[0] ? open[0].label : 'No next action');
    host.appendChild(r);
  });
}

async function addVenture(name) {
  const sb = client(), u = currentUser();
  const res = await sb.from('ventures').insert({ user_id: u.id, name: name, stage: 'ACTIVE', sort_order: Date.now() % 100000 }).select().single();
  if (res.error) { console.error('addVenture', res.error); return; }
  await loadWork();
  await refreshVentureOptions();
}

// Keep the Tasks section's venture selector in sync.
export async function refreshVentureOptions() {
  const sel = $('task-venture');
  if (!sel) return;
  const sb = client();
  const res = await sb.from('ventures').select('id, name').order('sort_order');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Personal</option>';
  (res.data || []).forEach(function (v) {
    const o = el('option'); o.value = v.id; o.textContent = v.name;
    sel.appendChild(o);
  });
  sel.value = keep;
}

async function initWork() {
  $('venture-add').addEventListener('click', function () {
    const inp = $('venture-input'), v = inp.value.trim();
    if (v) { addVenture(v); inp.value = ''; }
  });
  $('venture-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('venture-add').click(); });
  await loadWork();
  await refreshVentureOptions();
}

onInit(initWork);
onTaskChange(function () { loadWork(); });
