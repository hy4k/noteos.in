import { startClock, updateScroller } from './ui.js';
import { boot } from './data.js';
import './today.js';
import './work.js';
import './personal.js';
import './journal.js';
import './finance.js';
import './queue.js';

startClock();
boot();
updateScroller();

if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
