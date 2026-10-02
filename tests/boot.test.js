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

    // Arrow keys move to the next tab
    selected[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(50);
    assert.equal(doc.querySelector('#atqm-tabs [aria-selected=true]').dataset.tab, 'changes');
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
