import { iso } from './lib.js';

export const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
export const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
export const NAME = 'MITHUN';

export function $(id) { return document.getElementById(id); }

export function el(tag, attrs, html) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (html != null) n.innerHTML = html;
  return n;
}

export var SECTIONS = ['TODAY','FOCUS','PROJECTS','FETS','TASKS','HABITS','HEALTH','LEARN','FINANCE','JOURNAL'];
var FLEX_SECTIONS = { TODAY: 1 };

// ════════════ NAV ════════════
var current = 'TODAY';
var navEl = $('rail-nav');
var nsList = $('ns-list');
SECTIONS.forEach(function (name, i) {
  var n = el('div', { class: 'nav-item' + (name === 'TODAY' ? ' active' : '') });
  n.textContent = name; n.dataset.section = name;
  n.addEventListener('click', function () { goTo(name); });
  navEl.appendChild(n);

  var item = el('div', { class: 'ns-item' + (name === 'TODAY' ? ' active' : ''), 'data-section': name });
  item.innerHTML = '<div class="ns-num">' + (i < 9 ? '0' : '') + (i + 1) + '</div><div class="ns-name"></div>';
  item.querySelector('.ns-name').textContent = name;
  item.addEventListener('click', function () { goTo(name); closeSheet(); });
  nsList.appendChild(item);
});
SECTIONS.forEach(function (name) { var s = $('sec-' + name); if (s && name !== 'TODAY') s.style.display = 'none'; });

export function goTo(name) {
  if (name === current) { closeSheet(); return; }
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.section === name); });
  document.querySelectorAll('.ns-item').forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-section') === name); });
  document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); s.style.display = 'none'; });
  var next = $('sec-' + name);
  if (next) { next.style.display = FLEX_SECTIONS[name] ? 'flex' : 'block'; next.classList.add('active'); }
  $('mb-title').textContent = name;
  var main = $('main'); main.scrollTop = 0;
  main.animate([{ opacity: 0.35, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
  current = name;
  updateScroller();
}

// mobile sheet
function openSheet() { $('navsheet').classList.add('show'); }
function closeSheet() { $('navsheet').classList.remove('show'); }
$('mb-menu').addEventListener('click', openSheet);
$('ns-close').addEventListener('click', closeSheet);

// ════════════ SCROLL CONTROLS ════════════
var mainEl = $('main'), scroller = $('scroller'), scUp = $('sc-up'), scDown = $('sc-down');
export function updateScroller() {
  var sc = mainEl.scrollTop, max = mainEl.scrollHeight - mainEl.clientHeight;
  if (max > 60) scroller.classList.add('show'); else scroller.classList.remove('show');
  scUp.disabled = sc <= 4;
  scDown.disabled = sc >= max - 4;
}
scUp.addEventListener('click', function () { mainEl.scrollBy({ top: -Math.round(mainEl.clientHeight * 0.8), behavior: 'smooth' }); });
scDown.addEventListener('click', function () { mainEl.scrollBy({ top: Math.round(mainEl.clientHeight * 0.8), behavior: 'smooth' }); });
mainEl.addEventListener('scroll', function () { window.requestAnimationFrame(updateScroller); });
window.addEventListener('resize', updateScroller);

// ════════════ CLOCK / GREETING / ORB ════════════
function tick() {
  var now = new Date(), h = now.getHours();
  var greeting = h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : h < 21 ? 'GOOD EVENING' : 'GOOD NIGHT';
  $('today-date').textContent = DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();
  $('today-greeting').innerHTML = greeting + ',<br><span style="color:var(--accent)">' + NAME + '</span>';
  var frac = (h * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
  $('orb-inner').style.transform = 'rotate(' + Math.round(frac * 360) + 'deg)';
}
export function startClock() {
  tick();
  setInterval(tick, 30000);
}

// ════════════ STATIC SECTIONS ════════════
(function renderProjects() {
  var sc = { BUILDING: 'var(--accent)', ACTIVE: '#C9C5BC', STEADY: '#8E8A82', PAUSED: '#5A5752' };
  var rows = [
    { idx: 'P-01', name: 'NoteOS', desc: 'Personal command suite — the thing you are looking at.', status: 'BUILDING', metric: 'main · 71% to v2' },
    { idx: 'P-02', name: 'FETS Portal', desc: 'Student, batch & exam portal for the company.', status: 'ACTIVE', metric: 'feat/exams · in review' },
    { idx: 'P-03', name: 'Salt & Static', desc: 'Site + weekly newsletter engine.', status: 'STEADY', metric: '1,420 readers' },
    { idx: 'P-04', name: 'Archive 47', desc: 'A photo project. Shelved, not dead.', status: 'PAUSED', metric: 'last · Apr 2026' }
  ];
  var c = $('projects-list');
  rows.forEach(function (v) {
    var r = el('div', { class: 'venture-row', style: 'display:grid;grid-template-columns:54px 1fr auto;gap:18px;align-items:center;padding:24px 4px 24px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752">' + v.idx + '</div>' +
      '<div><div style="font-family:\'Oswald\',sans-serif;font-weight:600;font-size:26px;letter-spacing:.5px;text-transform:uppercase;color:#F4F1EA">' + v.name + '</div>' +
      '<div style="font-size:14px;color:#8E8A82;margin-top:4px">' + v.desc + '</div></div>' +
      '<div style="text-align:right"><div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' + sc[v.status] + '">' + v.status + '</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;margin-top:6px">' + v.metric + '</div></div>';
    c.appendChild(r);
  });
})();

(function renderLearn() {
  var items = [
    { when: 'In progress', title: 'System Design — ByteByteGo', pct: 62 },
    { when: 'For FETS', title: 'Building automated test banks', pct: 80 },
    { when: 'Slow burn', title: 'The Rust Book', pct: 40 },
    { when: 'Next up', title: 'Postgres Internals', pct: 25 }
  ];
  var c = $('learn-list');
  items.forEach(function (g) {
    var r = el('div', { style: 'padding:24px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML = '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px">' +
      '<div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap"><div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6A675F;min-width:96px">' + g.when + '</div>' +
      '<div style="font-family:\'Oswald\',sans-serif;font-weight:500;font-size:24px;text-transform:uppercase;letter-spacing:.3px;color:#F4F1EA">' + g.title + '</div></div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:var(--accent)">' + g.pct + '%</div></div>' +
      '<div style="margin-top:14px;height:2px;width:100%;background:rgba(244,241,234,.09)"><div style="height:2px;width:' + g.pct + '%;background:var(--accent)"></div></div>';
    c.appendChild(r);
  });
})();

(function renderFinance() {
  var e = [
    { d: '21 JUN', label: 'FETS — June batch fees', amt: '+ ₹ 96,000', up: true },
    { d: '20 JUN', label: 'Studio Tideline — retainer', amt: '+ ₹ 60,000', up: true },
    { d: '19 JUN', label: 'AWS + Vercel', amt: '− ₹ 4,210', up: false },
    { d: '18 JUN', label: 'Exam hall rent — FETS', amt: '− ₹ 12,000', up: false },
    { d: '15 JUN', label: 'Rent — Calicut', amt: '− ₹ 22,000', up: false }
  ];
  var c = $('finance-list');
  e.forEach(function (x) {
    var r = el('div', { style: 'display:grid;grid-template-columns:74px 1fr auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752">' + x.d + '</div>' +
      '<div style="font-size:15px;color:#C9C5BC">' + x.label + '</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:' + (x.up ? 'var(--accent)' : '#8E8A82') + '">' + x.amt + '</div>';
    c.appendChild(r);
  });
})();

(function renderJournal() {
  var items = [
    { d: '21 JUN 2026', t: 'The rail finally clicks', body: 'Rotated the navigation onto its side. Suddenly the whole thing reads like an instrument instead of a webpage.' },
    { d: '20 JUN 2026', t: 'FETS exams to review', body: 'Pushed the exam module of the FETS portal for review. The evaluation backlog is the real bottleneck now.' },
    { d: '18 JUN 2026', t: 'First corporate testing client', body: 'Signed a corporate testing contract for FETS. Small money, but it changes how the whole thing feels.' }
  ];
  var c = $('journal-list');
  items.forEach(function (d) {
    var r = el('div', { style: 'display:grid;grid-template-columns:104px 1fr;gap:22px;padding:26px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:1.5px;color:var(--accent);padding-top:6px">' + d.d + '</div>' +
      '<div><div style="font-family:\'Oswald\',sans-serif;font-weight:500;font-size:23px;text-transform:uppercase;letter-spacing:.3px;color:#F4F1EA">' + d.t + '</div>' +
      '<div style="font-size:15px;line-height:1.6;color:#9A968E;margin-top:8px">' + d.body + '</div></div>';
    c.appendChild(r);
  });
})();
