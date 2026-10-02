'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));

test('boot: an ordinary tab asks before it monitors, then monitors and locks', async () => {
  const { window, close } = load({
    boot: true,
    html: fixture('queue-grid.html'),
    settings: { dateOrder: 'DMY' },
    storage: { 'atqm:enabled': true },
  });
  try {
    const doc = window.document;
    await sleep(400);
    assert.ok(doc.getElementById('atqm'), 'widget');
    const banner = doc.getElementById('atqm-page');
    assert.match(banner.textContent, /Nobody is monitoring My queue/);
    assert.equal(doc.getElementById('atqm-lock'), null, 'not locked before choosing');
    assert.equal(window.localStorage.getItem('atqm:lock:my-open-tickets'), null, 'not monitoring before choosing');
    // The workspace address is remembered for Quick start
    assert.match(JSON.parse(window.localStorage.getItem('atqm:quickstart:wsurl')), /autotask\.net/);

    button(banner, /Monitor in this tab/).click();
    await sleep(600);
    const state = JSON.parse(window.localStorage.getItem('atqm:state'));
    assert.equal(state.note, 'Baseline saved');
    assert.equal(state.count, 2);
    assert.equal(state.partial, true); // 2 of 5 visible
    assert.ok(doc.getElementById('atqm-lock'), 'locked once monitoring');
    const lockView = doc.getElementById('atqm-lockview');
    assert.ok(button(lockView, /Show up to 500 rows/), 'offers more rows instead of changing the view');
  } finally {
    close();
  }
});

test('boot: Start tracking opens the queue in a new tab to monitor it, leaving this tab free', async () => {
  const { window, close } = load({ boot: true, html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' }, storage: { 'atqm:queues': [] } });
  try {
    const doc = window.document;
    const opened = [];
    window.open = (url, name) => { opened.push({ url, name }); return {}; };
    await sleep(400);
    const banner = doc.getElementById('atqm-page');
    assert.match(banner.textContent, /My Workspace > Open Tickets isn't tracked/);

    button(banner, /Start tracking: all changes/).click();
    assert.equal(opened.length, 1);
    assert.equal(opened[0].url, window.location.href);
    assert.match(opened[0].name, /^atqm-my-workspace-open-tickets~/); // tells the new tab which queue it's for
    const queues = JSON.parse(window.localStorage.getItem('atqm:queues'));
    assert.deepEqual(queues.map(q => q.key), ['my-workspace-open-tickets']);
    assert.equal(window.localStorage.getItem('atqm:enabled'), 'true');

    await sleep(600);
    assert.match(banner.textContent, /Opening a tab to monitor Open Tickets/);
    assert.ok(button(banner, /Monitor in this tab instead/));
    assert.equal(window.localStorage.getItem('atqm:lock:q:my-workspace-open-tickets'), null, 'this tab does not monitor');
    assert.equal(doc.getElementById('atqm-lock'), null, 'this tab is not locked');
  } finally {
    close();
  }
});

test('boot: if the browser blocks the new tab, the banner offers both choices again', async () => {
  const { window, close } = load({ boot: true, html: fixture('queue-grid.html'), storage: { 'atqm:queues': [] } });
  try {
    const doc = window.document;
    window.open = () => null;
    await sleep(400);
    const banner = doc.getElementById('atqm-page');
    button(banner, /Start tracking: all changes/).click();
    await sleep(300);
    assert.match(doc.getElementById('atqm-health').textContent, /blocked the monitoring tab/);
    assert.match(banner.textContent, /Nobody is monitoring Open Tickets/);
    assert.ok(button(banner, /Open a separate monitoring tab/));
    assert.ok(button(banner, /Monitor in this tab/));
  } finally {
    close();
  }
});

test('boot: tabs and the minimise button are labelled for assistive tech', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    await sleep(200);
    const tabs = [...doc.querySelectorAll('#atqm-tabs [role=tab]')];
    assert.ok(tabs.every(t => t.getAttribute('aria-controls') === 'atqm-panel'));
    const selected = tabs.filter(t => t.getAttribute('aria-selected') === 'true');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].tabIndex, 0);
    assert.equal(doc.getElementById('atqm-panel').getAttribute('aria-labelledby'), selected[0].id);
    const min = doc.getElementById('atqm-min');
    assert.equal(min.getAttribute('aria-label'), 'Expand Queue monitor');
    assert.equal(min.getAttribute('aria-expanded'), 'false');

    // Next up is the first tab and selected to start with; there's no Changes tab
    assert.deepEqual(tabs.map(t => t.dataset.tab), ['next', 'overview', 'settings']);
    assert.equal(selected[0].dataset.tab, 'next');

    // Arrow keys move to the next tab
    selected[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(50);
    assert.equal(doc.querySelector('#atqm-tabs [aria-selected=true]').dataset.tab, 'overview');
  } finally {
    close();
  }
});

test('boot: Next up shows the moves, the queues it is based on, and the change history', async () => {
  const MIN = 60000, NOW = Date.UTC(2026, 9, 2, 12, 0);
  const T1 = 'T20261001.0001', T2 = 'T20261001.0002';
  const { window, close } = load({
    boot: true,
    now: NOW,
    storage: {
      'atqm:enabled': true,
      'atqm:tab': 'changes', // saved by an older version
      'atqm:state': { mode: 'ok', lastScan: NOW, ts: NOW, count: 2 },
      'atqm:snap:my-open-tickets': {
        [T1]: { status: 'In Progress', due: NOW - 10 * MIN, slaEvent: 'Resolution', title: 'Printer' },
        [T2]: { status: 'Customer Note Added', title: 'Laptop', firstSeen: NOW - 60 * MIN },
      },
      'atqm:alerts': [{ ts: NOW - 5 * MIN, q: 'my', type: 'status', ticket: T2, from: 'Waiting Customer', to: 'Customer Note Added',
        read: false, text: `${T2} – Laptop: Waiting Customer → Customer Note Added` }],
    },
  });
  try {
    const doc = window.document;
    await sleep(200);
    assert.equal(doc.querySelector('#atqm-tabs [aria-selected=true]').dataset.tab, 'next');
    assert.equal(doc.getElementById('atqm-tab-next').textContent, 'Next up (2)');
    const panel = doc.getElementById('atqm-panel');
    const heads = () => [...panel.querySelectorAll('.atqm-next-h')].map(h => h.textContent);
    assert.deepEqual(heads(), ['Overdue', 'Changed since you last looked']);
    assert.match(panel.querySelector('.atqm-basis').textContent, /Watching\s*My queue/);
    assert.match(panel.textContent, /Recent changes/);
    assert.match(panel.querySelector('.atqm-chg').textContent, /Waiting Customer → Customer Note Added/);
    // The minimised window shows the top move
    assert.match(doc.getElementById('atqm-mini').textContent, /Next: Resolution 10m overdue: T20261001\.0001/);

    button(panel, /^Seen$/).click();
    await sleep(50);
    assert.deepEqual(heads(), ['Overdue']);
    assert.equal(doc.getElementById('atqm-tab-next').textContent, 'Next up (1)');
  } finally {
    close();
  }
});

test('boot: Quick start explains itself when it has nowhere to open queues yet', async () => {
  const { window, close } = load({ boot: true });
  try {
    await sleep(200);
    const qs = window.document.getElementById('atqm-qs');
    assert.match(qs.textContent, /Open My Workspace & Queues once/);
    assert.ok(button(qs, /Turn on monitoring/));
    assert.equal(button(qs, /^Quick start$/), undefined);
  } finally {
    close();
  }
});
