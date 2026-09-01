// Offline quick-capture queue.
//
// Every localStorage access is wrapped: the API throws outright in Safari's
// private mode and when the origin quota is full, and a capture failing is
// never a reason to take the app down.

import { QUEUE_KEY, enqueue, drainable } from './lib.js';

function read() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

export function peek() {
  return drainable(read());
}

export function push(label) {
  const list = enqueue(read(), { label: label, at: new Date().toISOString() });
  write(list);
  return list;
}

let lastInsert = null;
let flushing = false;

// Retry every queued capture through insertFn, which resolves truthy on a
// real write. Anything that fails again stays queued for the next attempt.
export async function flush(insertFn) {
  if (insertFn) lastInsert = insertFn;
  if (!lastInsert || flushing) return;
  const pending = peek();
  if (!pending.length) return;
  flushing = true;
  const left = [];
  try {
    for (const item of pending) {
      try {
        const ok = await lastInsert(item.label);
        if (!ok) left.push(item);
      } catch (e) {
        left.push(item);
      }
    }
    write(left);
  } finally {
    flushing = false;
  }
}

// ── offline indicator ──
// The header dot goes warm-red while offline. No new CSS: clearing the inline
// background hands the element back to its own .mb-dot rule.
function paintDot() {
  const dot = document.querySelector('.mb-dot');
  if (!dot) return;
  dot.style.background = navigator.onLine ? '' : '#E8705B';
}

window.addEventListener('online', function () { paintDot(); flush(); });
window.addEventListener('offline', paintDot);
paintDot();
