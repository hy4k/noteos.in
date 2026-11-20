import { $, el, MONTHS } from './ui.js';
import {
  dueSoon, todayStr, monthKey, summarise, byCategory, monthlyTotals,
  runwayMonths, financeInsights, EXPENSE_CATEGORIES, INCOME_CATEGORIES
} from './lib.js';
import { client, currentUser, onInit } from './data.js';

let billsCache = [];
let txnCache = [];
let settingsRow = null;
let currentKind = 'expense';

export function upcomingBills() {
  return dueSoon(billsCache.filter(function (b) { return !b.paid; })
    .map(function (b) { return { name: b.name, due_date: b.due_date, amount: b.amount, kind: 'bill' }; }));
}

function inr(n) {
  if (n == null) return '';
  return '₹ ' + Number(n).toLocaleString('en-IN');
}

// ════════════ BILLS ════════════

async function loadBills() {
  const sb = client();
  const res = await sb.from('bills').select('*').order('due_date');
  billsCache = res.data || [];
  renderBills();
}

function renderBills() {
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
  await refreshAll();
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
  await refreshAll();
}

// ════════════ CAPTURE ════════════

function populateCategories() {
  const sel = $('txn-category');
  if (!sel) return;
  const list = currentKind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = '';
  list.forEach(function (c) {
    const o = el('option', { value: c });
    o.textContent = c;
    sel.appendChild(o);
  });
}

function setKind(kind) {
  currentKind = kind === 'income' ? 'income' : 'expense';
  const ex = $('txn-kind-expense'), inc = $('txn-kind-income');
  if (ex) ex.classList.toggle('active', currentKind === 'expense');
  if (inc) inc.classList.toggle('active', currentKind === 'income');
  populateCategories();
}

function captureMessage(text) {
  const host = $('fin-insights');
  if (!host) return;
  const row = insightRow({ level: 'alert', text: text });
  host.insertBefore(row, host.firstChild);
}

async function loadTransactions() {
  const sb = client();
  const res = await sb.from('transactions').select('*').order('txn_date', { ascending: false }).limit(500);
  if (res.error) { console.error('loadTransactions', res.error); txnCache = []; return; }
  txnCache = res.data || [];
}

async function addTransaction() {
  const sb = client(), u = currentUser();
  const raw = $('txn-amount').value.trim();
  const amt = Number(raw.replace(/[^0-9.]/g, ''));
  // amount has CHECK (amount > 0) in the database — never send a value it will reject.
  if (!raw || isNaN(amt) || amt <= 0) {
    captureMessage('Enter an amount greater than zero.');
    $('txn-amount').focus();
    return;
  }
  const note = $('txn-note').value.trim();
  const res = await sb.from('transactions').insert({
    user_id: u.id,
    kind: currentKind,
    amount: amt,
    category: $('txn-category').value || 'Other',
    note: note || null,
    txn_date: $('txn-date').value || todayStr()
  }).select().single();
  if (res.error) { console.error('addTransaction', res.error); captureMessage('Could not save that — ' + res.error.message); return; }
  $('txn-amount').value = ''; $('txn-note').value = ''; $('txn-date').value = '';
  await refreshAll();
}

async function removeTransaction(t) {
  const sb = client();
  const res = await sb.from('transactions').delete().eq('id', t.id);
  if (res.error) { console.error('removeTransaction', res.error); return; }
  await refreshAll();
}

// ════════════ RENDER ════════════

// The same burn the insights use: complete prior months that actually have spending.
function avgRecentExpense(today) {
  const recent = monthlyTotals(txnCache, 4, today).slice(0, 3);
  const withData = recent.filter(function (m) { return m.expense > 0; });
  if (!withData.length) return 0;
  return withData.reduce(function (a, m) { return a + m.expense; }, 0) / withData.length;
}

function renderSummary() {
  const today = new Date();
  const s = summarise(txnCache, monthKey(today));
  const inc = $('fin-income'), exp = $('fin-expense'), net = $('fin-net'), run = $('fin-runway');
  if (inc) inc.textContent = inr(s.income);
  if (exp) exp.textContent = inr(s.expense);
  if (net) {
    net.textContent = inr(s.net);
    net.style.color = s.net > 0 ? 'var(--accent)' : (s.net < 0 ? '#E8705B' : '#F4F1EA');
  }
  if (run) {
    const m = runwayMonths(settingsRow ? settingsRow.cash_on_hand : null, avgRecentExpense(today));
    run.textContent = m == null ? '—' : m.toFixed(1) + ' mo';
  }
}

function insightRow(o) {
  const color = o.level === 'alert' ? '#E8705B' : (o.level === 'warn' ? 'var(--accent)' : '#5A5752');
  const row = el('div', { style: 'display:flex;gap:13px;align-items:center' });
  row.innerHTML =
    '<div style="width:13px;height:13px;flex:none;background:' + color + '"></div>' +
    '<div class="i-text" style="font-size:14px;color:#C9C5BC"></div>';
  row.querySelector('.i-text').textContent = o.text;
  return row;
}

function renderInsights() {
  const host = $('fin-insights');
  if (!host) return;
  host.innerHTML = '';
  const out = financeInsights({ txns: txnCache, bills: billsCache, settings: settingsRow || {}, today: new Date() });
  if (!out.length) {
    const empty = el('div', { style: 'font-size:14px;color:#5A5752' });
    empty.textContent = 'Log a few transactions and this fills in.';
    host.appendChild(empty);
    return;
  }
  out.forEach(function (o) { host.appendChild(insightRow(o)); });
}

function renderCategories() {
  const host = $('fin-categories');
  if (!host) return;
  host.innerHTML = '';
  const rows = byCategory(txnCache, monthKey(new Date()), 'expense');
  if (!rows.length) {
    const empty = el('div', { style: 'font-size:14px;color:#5A5752' });
    empty.textContent = 'Nothing spent yet this month.';
    host.appendChild(empty);
    return;
  }
  rows.forEach(function (c) {
    const row = el('div', { style: 'padding:14px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px">' +
      '<div class="c-name" style="font-size:15px;color:#C9C5BC"></div>' +
      '<div class="c-amt" style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:#8E8A82"></div>' +
      '</div>' +
      '<div style="height:2px;width:100%;background:rgba(244,241,234,.09);margin-top:12px">' +
      '<div style="height:2px;width:' + c.pct + '%;background:var(--accent)"></div>' +
      '</div>';
    row.querySelector('.c-name').textContent = c.category;
    row.querySelector('.c-amt').textContent = inr(c.total);
    host.appendChild(row);
  });
}

function monthLabel(key) {
  const parts = key.split('-');
  return MONTHS[Number(parts[1]) - 1].slice(0, 3) + ' ' + parts[0].slice(2);
}

function renderTrend() {
  const host = $('fin-trend');
  if (!host) return;
  host.innerHTML = '';
  const months = monthlyTotals(txnCache, 6);
  const max = months.reduce(function (a, m) { return Math.max(a, m.expense); }, 0);
  months.forEach(function (m) {
    const pct = max ? Math.round(m.expense / max * 100) : 0;
    const row = el('div', { style: 'padding:14px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px">' +
      '<div class="t-key" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752"></div>' +
      '<div class="t-net" style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:' + (m.net < 0 ? '#E8705B' : 'var(--accent)') + '"></div>' +
      '</div>' +
      '<div style="height:2px;width:100%;background:rgba(244,241,234,.09);margin-top:12px">' +
      '<div style="height:2px;width:' + pct + '%;background:var(--accent)"></div>' +
      '</div>';
    row.querySelector('.t-key').textContent = monthLabel(m.key);
    row.querySelector('.t-net').textContent = inr(m.net);
    host.appendChild(row);
  });
}

function renderRecent() {
  const host = $('fin-recent');
  if (!host) return;
  host.innerHTML = '';
  if (!txnCache.length) {
    const empty = el('div', { style: 'font-size:14px;color:#5A5752' });
    empty.textContent = 'Nothing logged yet.';
    host.appendChild(empty);
    return;
  }
  txnCache.slice(0, 12).forEach(function (t) {
    const income = t.kind === 'income';
    const row = el('div', { style: 'display:grid;grid-template-columns:104px 1fr auto auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)' });
    row.innerHTML =
      '<div class="t-date" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752"></div>' +
      '<div class="t-label" style="font-size:15px;color:#C9C5BC"></div>' +
      '<div class="t-amt" style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:' + (income ? 'var(--accent)' : '#8E8A82') + '"></div>' +
      '<div class="t-del" style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;cursor:pointer">REMOVE</div>';
    row.querySelector('.t-date').textContent = t.txn_date || '';
    row.querySelector('.t-label').textContent = (t.category || 'Other') + (t.note ? ' — ' + t.note : '');
    row.querySelector('.t-amt').textContent = (income ? '+' : '−') + inr(t.amount);
    row.querySelector('.t-del').addEventListener('click', function () { removeTransaction(t); });
    host.appendChild(row);
  });
}

// ════════════ SETTINGS ════════════

async function loadSettings() {
  const sb = client();
  const res = await sb.from('finance_settings').select('*').maybeSingle();
  if (res.error) { console.error('loadSettings', res.error); settingsRow = null; }
  else settingsRow = res.data || null;
  const cash = $('fin-cash'), tax = $('fin-tax');
  if (cash) cash.value = (settingsRow && settingsRow.cash_on_hand != null) ? String(settingsRow.cash_on_hand) : '';
  if (tax) tax.value = (settingsRow && settingsRow.tax_rate != null) ? String(settingsRow.tax_rate) : '';
}

async function saveSettings() {
  const sb = client(), u = currentUser();
  const rawCash = $('fin-cash').value.trim();
  const rawTax = $('fin-tax').value.trim();
  const cash = rawCash ? Number(rawCash.replace(/[^0-9.]/g, '')) : null;
  const taxN = rawTax ? Number(rawTax.replace(/[^0-9.]/g, '')) : 0;
  const res = await sb.from('finance_settings').upsert({
    user_id: u.id,
    cash_on_hand: (cash != null && !isNaN(cash)) ? cash : null,
    tax_rate: isNaN(taxN) ? 0 : taxN,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (res.error) { console.error('saveSettings', res.error); return; }
  await refreshAll();
}

// ════════════ WIRING ════════════

// One path in, so the tiles, insights, categories and trend never go stale.
async function refreshAll() {
  await loadBills();
  await loadTransactions();
  await loadSettings();
  renderSummary();
  renderInsights();
  renderCategories();
  renderTrend();
  renderRecent();
}

async function initFinance() {
  $('bill-add').addEventListener('click', function () {
    const n = $('bill-name').value.trim();
    if (!n) return;
    addBill(n, $('bill-amount').value, $('bill-date').value);
    $('bill-name').value = ''; $('bill-amount').value = ''; $('bill-date').value = '';
  });
  $('bill-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bill-add').click(); });

  $('txn-kind-expense').addEventListener('click', function () { setKind('expense'); });
  $('txn-kind-income').addEventListener('click', function () { setKind('income'); });
  $('txn-add').addEventListener('click', function () { addTransaction(); });
  $('txn-amount').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('txn-add').click(); });
  $('txn-note').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('txn-add').click(); });
  $('fin-save-settings').addEventListener('click', function () { saveSettings(); });

  setKind(currentKind);
  await refreshAll();
}

onInit(initFinance);
