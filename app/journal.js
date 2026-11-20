import { $, el } from './ui.js';
import { todayStr, iso } from './lib.js';
import { client, currentUser, onInit } from './data.js';

let reflRow = null;

async function loadEntries() {
  const sb = client();
  const res = await sb.from('journal_entries').select('*').order('entry_date', { ascending: false }).limit(50);
  const host = $('journal-list');
  if (!host) return;
  host.innerHTML = '';
  (res.data || []).forEach(function (e) {
    const row = el('div', { style: 'display:grid;grid-template-columns:104px 1fr;gap:22px;padding:26px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div class="j-date" style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:1.5px;color:var(--accent);padding-top:6px"></div>' +
      '<div><div class="j-body" style="font-size:15px;line-height:1.6;color:#9A968E"></div></div>';
    row.querySelector('.j-date').textContent = e.entry_date || '';
    row.querySelector('.j-body').textContent = e.content;
    host.appendChild(row);
  });
}

async function addEntry(content) {
  const sb = client(), u = currentUser();
  const res = await sb.from('journal_entries').insert({ user_id: u.id, content: content, entry_date: todayStr() }).select().single();
  if (res.error) { console.error('addEntry', res.error); return; }
  await loadEntries();
}

async function loadReflection() {
  const sb = client();
  const res = await sb.from('daily_reflections').select('*').eq('date', todayStr()).maybeSingle();
  reflRow = res.data || null;
  $('refl-one-line').value = reflRow ? (reflRow.one_line || '') : '';
  $('refl-tomorrow').value = reflRow ? (reflRow.tomorrow_star || '') : '';
}

async function saveReflection() {
  const sb = client(), u = currentUser();
  const one = $('refl-one-line').value.trim();
  const tom = $('refl-tomorrow').value.trim();
  if (!one && !tom) return;
  const res = await sb.from('daily_reflections')
    .upsert({ user_id: u.id, date: todayStr(), one_line: one, tomorrow_star: tom }, { onConflict: 'user_id,date' })
    .select().single();
  if (res.data) reflRow = res.data;

  // tomorrow_star writes forward into tomorrow's north star
  if (tom) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    await sb.from('north_stars')
      .upsert({ user_id: u.id, content: tom, date: iso(d) }, { onConflict: 'user_id,date' });
  }
}

async function initJournal() {
  $('journal-add').addEventListener('click', function () {
    const c = $('journal-input').value.trim();
    if (c) { addEntry(c); $('journal-input').value = ''; }
  });
  $('refl-one-line').addEventListener('blur', saveReflection);
  $('refl-tomorrow').addEventListener('blur', saveReflection);
  await loadEntries();
  await loadReflection();
}

onInit(initJournal);
