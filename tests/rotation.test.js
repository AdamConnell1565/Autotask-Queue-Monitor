'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const plain = v => JSON.parse(JSON.stringify(v));
const QUEUES = [
  { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' },
  { key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' },
];
const row = (id, title) =>
  `<tr class="Display"><td><input type="checkbox" value="${id.slice(-4)}"></td><td>${id}</td><td>${title}</td><td>New</td>` +
  '<td>Example Ltd</td><td>Low</td><td>02/10/2026 09:00</td><td>First Response</td><td>02/10/2026 18:00</td></tr>';
const FIRST_LINE_ROWS = [row('T20261002.0010', 'Email down'), row('T20261002.0011', 'VPN')];

// Stands in for Autotask: clicking a queue in the menu selects it and (unless told not to) redraws the
// grid with that queue's rows
function wireMenu(window, { redraw = true } = {}) {
  const doc = window.document;
  for (const span of doc.querySelectorAll('#menu li > span')) {
    span.addEventListener('click', () => {
      doc.querySelectorAll('#menu li').forEach(li => li.classList.remove('SelectedState'));
      span.parentElement.classList.add('SelectedState');
      if (!redraw || !/Support 1st Line/.test(span.textContent)) return;
      const body = doc.querySelector('#QueueGrid tr.Heading').parentElement;
      body.querySelectorAll('tr.Display').forEach(r => r.remove());
      body.insertAdjacentHTML('beforeend', FIRST_LINE_ROWS.join(''));
    });
  }
}

function oneTab(opts = {}) {
  const env = load({
    html: fixture('queue-grid.html'),
    settings: { dateOrder: 'DMY', postRefreshTimeoutMs: 300, ...opts.settings },
    storage: { 'atqm:enabled': true, 'atqm:queues': QUEUES },
  });
  env.window.sessionStorage.setItem('atqm:rotate', '1'); // this is the one-tab monitor
  wireMenu(env.window, opts);
  return env;
}

test('the one-tab monitor takes every queue and scans them in turn, switching in the menu', async () => {
  const { api, close } = oneTab();
  assert.equal(api.rotationTab(), true);
  const [my, firstLine] = api.trackedQueues();

  await api.rotate(); // My queue is showing: scanned where it is
  assert.deepEqual(Object.keys(api.readSnap(my)), ['T20260925.0001', 'T20261001.0002']);
  assert.equal(api.readSnap(firstLine), null);
  assert.deepEqual(plain(api.get('atqm:rotator', {}).queues), ['my', 'first-line']);

  await api.rotate(); // then it clicks Support 1st Line and scans that
  assert.equal(api.currentQueue().nav, 'Support 1st Line');
  assert.deepEqual(Object.keys(api.readSnap(firstLine)), ['T20261002.0010', 'T20261002.0011']);
  // My queue's snapshot is untouched by the other queue's rows
  assert.deepEqual(Object.keys(api.readSnap(my)), ['T20260925.0001', 'T20261001.0002']);
  assert.ok(api.get(firstLine.state, {}).lastScan);
  close();
});

test('the one-tab monitor does not scan a grid that still shows the previous queue', async () => {
  const { api, close } = oneTab({ redraw: false });
  const [, firstLine] = api.trackedQueues();
  await api.rotate();
  await api.rotate(); // the menu switches but the grid doesn't
  assert.equal(api.readSnap(firstLine), null);
  assert.match(api.get(firstLine.state, {}).note, /Waiting for the grid to switch/);
  close();
});

test('the one-tab monitor monitors whatever it shows; other tabs need asking', () => {
  const { api, window, close } = oneTab();
  assert.equal(api.mayMonitorHere({ key: 'anything' }), true);
  window.sessionStorage.removeItem('atqm:rotate');
  assert.equal(api.mayMonitorHere({ key: 'anything' }), false);
  close();
});

test('rounds: service calls come round on their own, longer refresh', async () => {
  const NOW = Date.UTC(2026, 9, 2, 12, 0), MIN = 60000;
  const calls = { key: 'calls', nav: 'Service Calls', section: 'My Workspace', mode: 'calls' };
  const env = load({
    html: fixture('queue-grid.html'),
    now: NOW,
    settings: { dateOrder: 'DMY', postRefreshTimeoutMs: 300, serviceCalls: true },
    storage: {
      'atqm:enabled': true, 'atqm:queues': [QUEUES[0], calls],
      'atqm:state': { mode: 'ok', lastScan: NOW - MIN, ts: NOW - MIN },
      'atqm:state:q:calls': { mode: 'ok', lastScan: NOW - 5 * MIN, ts: NOW - 5 * MIN },
    },
  });
  env.window.sessionStorage.setItem('atqm:rotate', '1');
  wireMenu(env.window);
  await env.api.rotate();
  // The calls were scanned longer ago, but My queue is due first: 2 minutes after its last scan, against 10
  assert.equal(env.api.get('atqm:state', {}).lastScan, NOW);
  assert.equal(env.api.get('atqm:state:q:calls', {}).lastScan, NOW - 5 * MIN);
  env.close();
});

test('rounds: each queue comes round about once per refresh, never faster than every 20 s', () => {
  const { api, close } = load({ settings: { refreshMs: 120000 } });
  assert.equal(api.rotationStep(1), 120000);
  assert.equal(api.rotationStep(3), 40000);
  assert.equal(api.rotationStep(10), 20000);
  close();
});

test('boot: a tab opened as the one-tab monitor does its first round and locks with the all-queues view', async () => {
  const { window, close } = load({
    boot: true,
    name: 'atqm-*~test',
    html: fixture('queue-grid.html'),
    settings: { dateOrder: 'DMY' },
    storage: { 'atqm:enabled': true, 'atqm:queues': QUEUES },
  });
  try {
    const doc = window.document;
    assert.equal(window.sessionStorage.getItem('atqm:rotate'), '1');
    assert.equal(window.name, ''); // nothing to click on the way
    await new Promise(r => setTimeout(r, 3800)); // first round starts 3 s after load
    assert.ok(JSON.parse(window.localStorage.getItem('atqm:snap:my-open-tickets')));
    assert.ok(doc.getElementById('atqm-lock'), 'locked');
    const view = doc.getElementById('atqm-lockview').textContent;
    assert.match(view, /One tab for all queues/);
    assert.match(view, /Checking 2 queues in turn/);
    assert.match(doc.getElementById('atqm-page').textContent, /This tab monitors all your queues/);
  } finally {
    close();
  }
});
