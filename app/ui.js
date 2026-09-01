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

export const SECTIONS = ['TODAY','WORK','TASKS','PERSONAL','FINANCE','JOURNAL'];
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
