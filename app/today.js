import { $, el } from './ui.js';
import { todayStr } from './lib.js';
import { client, currentUser, onInit } from './data.js';

var nsRow = null, priCache = [];

async function loadNorthStar() {
  const sb = client();
  const res = await sb.from('north_stars').select('*').eq('date', todayStr()).maybeSingle();
  nsRow = res.data || null;
  $('today-ns-text').value = nsRow ? nsRow.content : '';
}

async function saveNorthStar() {
  const sb = client(), u = currentUser();
  const content = $('today-ns-text').value.trim();
  if (!content) return;
  const payload = { user_id: u.id, content: content, date: todayStr() };
  if (nsRow) payload.id = nsRow.id;            // never send an undefined id
  const res = await sb.from('north_stars').upsert(payload).select().single();
  if (res.data) nsRow = res.data;
}

async function loadPriorities() {
  const sb = client();
  const res = await sb.from('priorities').select('*').eq('date', todayStr()).order('rank');
  priCache = res.data || [];
  renderPriorities();
}

function renderPriorities() {
  const host = $('today-priorities');
  host.innerHTML = '';
  for (let rank = 1; rank <= 3; rank++) {
    const row = priCache.find(function (p) { return p.rank === rank; }) || null;
    const d = el('div', { style: 'display:flex;gap:13px;align-items:center' });
    d.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--accent);min-width:18px">' + rank + '</div>' +
      '<div style="width:13px;height:13px;flex:none;border:1.5px solid ' + (row && row.done ? 'var(--accent)' : 'rgba(244,241,234,.28)') + ';background:' + (row && row.done ? 'var(--accent)' : 'transparent') + ';cursor:pointer" class="pri-check"></div>' +
      '<input class="pri-input" placeholder="—" spellcheck="false" style="flex:1;background:transparent;border:none;outline:none;font-size:15px;color:' + (row && row.done ? '#5A5752' : '#C9C5BC') + ';text-decoration:' + (row && row.done ? 'line-through' : 'none') + '">';
    const input = d.querySelector('.pri-input');
    input.value = row ? row.content : '';
    input.addEventListener('blur', function () { savePriority(rank, input.value.trim(), row); });
    d.querySelector('.pri-check').addEventListener('click', function () {
      if (row) togglePriority(row);
    });
    host.appendChild(d);
  }
}

async function savePriority(rank, content, existing) {
  if (!content) return;
  if (existing && existing.content === content) return;
  const sb = client(), u = currentUser();
  const payload = { user_id: u.id, rank: rank, content: content, date: todayStr(), done: existing ? existing.done : false };
  if (existing) payload.id = existing.id;      // never send an undefined id
  const res = await sb.from('priorities').upsert(payload).select().single();
  if (res.data) { await loadPriorities(); }
}

async function togglePriority(row) {
  const sb = client();
  await sb.from('priorities').update({ done: !row.done }).eq('id', row.id);
  await loadPriorities();
}

async function loadAgenda() {
  const sb = client();
  const res = await sb.from('agenda_items').select('*').eq('date', todayStr()).order('time');
  const rows = res.data || [];
  const host = $('today-blocks');
  host.innerHTML = '';
  rows.forEach(function (a) {
    const d = el('div', { style: 'display:flex;gap:16px;align-items:baseline' });
    d.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:var(--accent);min-width:46px"></div>' +
      '<div style="font-size:14px;color:#C9C5BC"></div>';
    d.children[0].textContent = a.time || '';
    d.children[1].textContent = a.title;
    host.appendChild(d);
  });
}

async function initToday() {
  $('today-ns-text').addEventListener('blur', saveNorthStar);
  await loadNorthStar();
  await loadPriorities();
  await loadAgenda();
}

onInit(initToday);
