import { $, el } from './ui.js';
import { dueSoon } from './lib.js';
import { client, currentUser, onInit } from './data.js';

let remindersCache = [];

export function upcomingReminders() {
  return dueSoon(remindersCache.map(function (r) {
    return { name: r.title, due_date: r.event_date, kind: 'reminder' };
  }));
}

async function loadReminders() {
  const sb = client();
  const res = await sb.from('reminders').select('*').order('event_date');
  remindersCache = res.data || [];
  const host = $('reminders-list');
  if (!host) return;
  host.innerHTML = '';
  remindersCache.forEach(function (r) {
    const row = el('div', { style: 'display:grid;grid-template-columns:104px 1fr auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div class="r-date" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--accent)"></div>' +
      '<div class="r-title" style="font-size:15px;color:#C9C5BC"></div>' +
      '<div class="r-del" style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;cursor:pointer">REMOVE</div>';
    row.querySelector('.r-date').textContent = r.event_date || '';
    row.querySelector('.r-title').textContent = r.title;
    row.querySelector('.r-del').addEventListener('click', function () { removeReminder(r.id); });
    host.appendChild(row);
  });
}

async function addReminder(title, date) {
  const sb = client(), u = currentUser();
  // reminders.event_date is NOT NULL — fall back to today rather than failing silently
  const when = date || new Date().toISOString().slice(0, 10);
  const res = await sb.from('reminders').insert({ user_id: u.id, title: title, event_date: when }).select().single();
  if (res.error) { console.error('addReminder', res.error); return; }
  await loadReminders();
}

async function removeReminder(id) {
  const sb = client();
  await sb.from('reminders').delete().eq('id', id);
  await loadReminders();
}

async function loadFamily() {
  const sb = client();
  const res = await sb.from('family_notes').select('*').order('created_at', { ascending: false });
  const host = $('family-list');
  if (!host) return;
  host.innerHTML = '';
  (res.data || []).forEach(function (n) {
    const row = el('div', { style: 'padding:16px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML = '<div class="f-body" style="font-size:15px;line-height:1.6;color:#C9C5BC"></div>';
    row.querySelector('.f-body').textContent = n.content;
    host.appendChild(row);
  });
}

async function addFamilyNote(content) {
  const sb = client(), u = currentUser();
  const res = await sb.from('family_notes').insert({ user_id: u.id, content: content, type: 'note' }).select().single();
  if (res.error) { console.error('addFamilyNote', res.error); return; }
  await loadFamily();
}

async function initPersonal() {
  $('reminder-add').addEventListener('click', function () {
    const t = $('reminder-input').value.trim(), d = $('reminder-date').value;
    if (t) { addReminder(t, d); $('reminder-input').value = ''; $('reminder-date').value = ''; }
  });
  $('reminder-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('reminder-add').click(); });
  $('family-add').addEventListener('click', function () {
    const c = $('family-input').value.trim();
    if (c) { addFamilyNote(c); $('family-input').value = ''; }
  });
  $('family-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('family-add').click(); });
  await loadReminders();
  await loadFamily();
}

onInit(initPersonal);
