import { $, el } from './ui.js';
import { dueSoon } from './lib.js';
import { client, currentUser, onInit } from './data.js';

let billsCache = [];

export function upcomingBills() {
  return dueSoon(billsCache.filter(function (b) { return !b.paid; })
    .map(function (b) { return { name: b.name, due_date: b.due_date, amount: b.amount, kind: 'bill' }; }));
}

function inr(n) {
  if (n == null) return '';
  return '₹ ' + Number(n).toLocaleString('en-IN');
}

async function loadBills() {
  const sb = client();
  const res = await sb.from('bills').select('*').order('due_date');
  billsCache = res.data || [];
  const host = $('finance-list');
  if (!host) return;
  host.innerHTML = '';
  const flagged = dueSoon(billsCache.map(function (b) { return { id: b.id, due_date: b.due_date }; }));
  const urgent = {};
  flagged.forEach(function (f) { if (f.urgent) urgent[f.id] = true; });

  billsCache.forEach(function (b) {
    const hot = urgent[b.id] && !b.paid;
    const row = el('div', { style: 'display:grid;grid-template-columns:104px 1fr auto auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div class="b-date" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:' + (hot ? '#E8705B' : '#5A5752') + '"></div>' +
      '<div class="b-name" style="font-size:15px;color:' + (b.paid ? '#5A5752' : '#C9C5BC') + ';text-decoration:' + (b.paid ? 'line-through' : 'none') + '"></div>' +
      '<div class="b-amt" style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:' + (b.paid ? '#5A5752' : 'var(--accent)') + '"></div>' +
      '<div class="b-toggle" style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;cursor:pointer">' + (b.paid ? 'UNDO' : 'PAID') + '</div>';
    row.querySelector('.b-date').textContent = b.due_date || '';
    row.querySelector('.b-name').textContent = b.name;
    row.querySelector('.b-amt').textContent = inr(b.amount);
    row.querySelector('.b-toggle').addEventListener('click', function () { togglePaid(b); });
    host.appendChild(row);
  });
}

async function togglePaid(b) {
  const sb = client();
  await sb.from('bills').update({ paid: !b.paid }).eq('id', b.id);
  await loadBills();
}

async function addBill(name, amount, date) {
  const sb = client(), u = currentUser();
  const amt = amount ? Number(String(amount).replace(/[^0-9.]/g, '')) : null;
  const res = await sb.from('bills').insert({
    user_id: u.id, name: name,
    amount: (amt != null && !isNaN(amt)) ? amt : null,
    due_date: date || new Date().toISOString().slice(0, 10)
  }).select().single();
  if (res.error) { console.error('addBill', res.error); return; }
  await loadBills();
}

async function initFinance() {
  $('bill-add').addEventListener('click', function () {
    const n = $('bill-name').value.trim();
    if (!n) return;
    addBill(n, $('bill-amount').value, $('bill-date').value);
    $('bill-name').value = ''; $('bill-amount').value = ''; $('bill-date').value = '';
  });
  $('bill-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bill-add').click(); });
  await loadBills();
}

onInit(initFinance);
