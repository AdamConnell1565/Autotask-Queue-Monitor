'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const MIN = 60000, HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 2, 12, 20);
const plain = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Status colours ----

test('status colours are read off the grid, and plain statuses stay plain', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const [first] = window.document.querySelectorAll('tr.Display');
  first.cells[3].innerHTML = '<span style="color: rgb(0, 100, 0)">New</span>'; // how Autotask colours a status
  api.readGrid();
  assert.deepEqual(plain(api.get('atqm:status:colors', {})), { 'new': 'rgb(0, 100, 0)', 'in progress': null });
  assert.ok(api.statusColor('New'));
  assert.equal(api.statusColor('In Progress'), null);
  close();
});

test('dark Autotask colours are lightened until they read on the dark window', () => {
  const { api, close } = load();
  const lum = c => {
    const [r, g, b] = c.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bg = lum('rgb(30, 31, 34)');
  for (const c of ['rgb(0, 100, 0)', 'rgb(0, 0, 139)', 'rgb(128, 0, 0)']) {
    const out = api.readableColor(c);
    assert.ok((lum(out) + 0.05) / (bg + 0.05) >= 4.5, `${c} -> ${out}`);
  }
  assert.equal(api.readableColor('rgb(255, 200, 0)'), 'rgb(255, 200, 0)'); // already readable: unchanged
  assert.equal(api.readableColor('rgba(0, 0, 0, 0)'), null);
  close();
});

test('the change log shows statuses in their colours', () => {
  const { api, window, close } = load({ storage: { 'atqm:status:colors': { 'customer note added': 'rgb(200, 30, 30)' } } });
  const box = window.document.createElement('div');
  box.append(api.alertText({ type: 'status', ticket: 'T20261001.0001', from: 'Waiting Customer', to: 'Customer Note Added',
    text: 'T20261001.0001 – Printer: Waiting Customer → Customer Note Added' }, () => null));
  const words = [...box.querySelectorAll('.atqm-st')];
  assert.deepEqual(words.map(w => w.textContent), ['Waiting Customer', 'Customer Note Added']);
  assert.equal(words[0].style.color, '');
  assert.ok(words[1].style.color);
  assert.match(box.textContent, /^T20261001\.0001⧉ – Printer: Waiting Customer → Customer Note Added$/); // ⧉: the copy button
  close();
});

// ---- Response target for tickets without an SLA ----

const QUEUES = [{ key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' }];
const ids = items => plain(items.map(it => [it.g, it.t.id, it.what || it.dl?.what || null]));

test('tickets without an SLA get the response target as their deadline', () => {
  const { api, close } = load({ now: NOW, storage: {
    'atqm:queues': QUEUES,
    'atqm:snap:q:first-line': {
      'T20261002.0001': { status: 'New', created: NOW - 70 * MIN },               // 10 min past the 60 min target
      'T20261002.0002': { status: 'New', created: NOW - 50 * MIN },               // 10 min to go
      'T20261002.0003': { status: 'New', created: NOW - 20 * MIN },               // 40 min to go
      'T20261002.0004': { status: 'New', created: NOW - 90 * MIN, frDue: NOW + HOUR }, // has a first response SLA instead
      'T20261002.0005': { status: 'In Progress', created: NOW - 5 * HOUR },       // already responded to
    },
  } });
  assert.deepEqual(ids(api.nextUpItems()), [
    ['breached', 'T20261002.0001', 'Response target'],
    ['soon', 'T20261002.0002', 'Response target'],
    ['new', 'T20261002.0004', 'First response'],
    ['new', 'T20261002.0003', 'Response target'],
  ]);
  close();

  const off = load({ now: NOW, settings: { responseTarget: 0 }, storage: { 'atqm:queues': QUEUES,
    'atqm:snap:q:first-line': { 'T20261002.0001': { status: 'New', created: NOW - 70 * MIN } } } });
  assert.deepEqual(ids(off.api.nextUpItems()), [['new', 'T20261002.0001', null]]);
  off.close();
});

test('an alert when a ticket without an SLA passes its response target, once', async () => {
  const { api, window, close } = load({ now: NOW, storage: { 'atqm:queues': QUEUES } });
  const q = api.trackedQueues()[0];
  const ticket = { id: 'T20261002.0001', status: 'New', title: 'Printer', created: NOW - 40 * MIN, due: null, frDue: null };
  const grid = { tickets: [ticket], rowCount: 1 };
  api.scanIntake(q, grid);                                         // baseline: 20 min to go
  window.Date.now = () => NOW + 10 * MIN; api.scanIntake(q, grid); // 10 min to go: due soon
  window.Date.now = () => NOW + 25 * MIN; api.scanIntake(q, grid); // passed
  window.Date.now = () => NOW + 35 * MIN; api.scanIntake(q, grid);
  const alerts = api.get('atqm:alerts', []);
  assert.deepEqual(plain(alerts.map(a => a.type)), ['soon', 'overdue']);
  assert.match(alerts[1].text, /Response target passed .*no SLA/);
  close();
});

test('upgrading does not alert for every ticket already past the target', () => {
  const { api, close } = load({ now: NOW, storage: {
    'atqm:queues': QUEUES,
    'atqm:seen:q:first-line': { 'T20261002.0001': NOW - 3 * HOUR },
    // a snapshot saved before 0.11: no target state
    'atqm:snap:q:first-line': { 'T20261002.0001': { status: 'New', created: NOW - 3 * HOUR, firstSeen: NOW - 3 * HOUR } },
  } });
  const q = api.trackedQueues()[0];
  api.scanIntake(q, { tickets: [{ id: 'T20261002.0001', status: 'New', title: 'Printer', created: NOW - 3 * HOUR, due: null, frDue: null }], rowCount: 1 });
  assert.deepEqual(api.get('atqm:alerts', []), []);
  close();
});

// ---- Dashboard ----

const DASH_STORAGE = {
  'atqm:enabled': true,
  'atqm:queues': [
    { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' },
    ...QUEUES,
  ],
  'atqm:state': { mode: 'ok', lastScan: NOW, ts: NOW, count: 3 },
  'atqm:state:q:first-line': { mode: 'ok', lastScan: NOW, ts: NOW, count: 2 },
  'atqm:snap:my-open-tickets': {
    'T20261001.0001': { status: 'In Progress', due: NOW - 30 * MIN, slaEvent: 'Resolution', title: 'Printer', priority: 'High' },
    'T20261001.0002': { status: 'Action Required', due: NOW + 25 * MIN, slaEvent: 'Resolution', title: 'Laptop' },
    'T20261001.0004': { status: 'Waiting Customer', due: NOW - 2 * HOUR, slaEvent: 'Resolution', title: 'Monitor', priority: 'Low' },
    'T20261001.0003': { status: 'In Progress', due: NOW + 3 * HOUR, slaEvent: 'Resolution', title: 'VPN' },
  },
  'atqm:snap:q:first-line': {
    'T20261002.0001': { status: 'New', created: NOW - 70 * MIN, title: 'Email' },
    'T20261002.0002': { status: 'New', created: NOW - 10 * MIN, frDue: NOW + 2 * HOUR + 5 * MIN, title: 'Phones' },
  },
  'atqm:alerts': [{ ts: NOW - 5 * MIN, q: 'my', type: 'action', ticket: 'T20261001.0003', from: 'Waiting Customer', to: 'In Progress',
    read: false, text: 'T20261001.0003 – VPN: Waiting Customer → In Progress' }],
};

test('dashboard numbers: overdue, due within the hour, waiting for a first response', () => {
  const { api, close } = load({ now: NOW, storage: DASH_STORAGE });
  const stats = Object.fromEntries(api.dashboardStats(api.nextUpItems()).map(s => [s.label, s]));
  assert.equal(stats['Overdue'].value, 2);  // an SLA and a no-SLA response target, not the resting Waiting Customer one
  assert.equal(stats['Overdue'].status, 'critical');
  assert.equal(stats['Due in the next hour'].value, 1);
  assert.equal(stats['Waiting for a first response'].value, 2);
  assert.equal(stats['Waiting for a first response'].sub, '1 past your 1h target');
  assert.equal(stats['Changed since you looked'].value, 1);
  assert.equal(stats['Need action'].value, 5);
  assert.equal(stats['Need action'].sub, 'of 6 tickets · 1 high priority');
  close();
});

test('dashboard deadlines: hourly by the clock, overdue ones left to the numbers', () => {
  const { api, close } = load({ now: NOW, storage: DASH_STORAGE });
  const buckets = api.deadlineBuckets(api.nextUpItems());
  assert.equal(buckets.length, 8);
  assert.deepEqual(plain(buckets.map(b => b.label)), ['Now', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.deepEqual(plain(buckets.map(b => b.items.length)), [1, 0, 1, 1, 0, 0, 0, 0]); // 12:45, 14:25, 15:20
  close();
});

test('boot: the dashboard button opens the full-window dashboard; Esc closes it', async () => {
  const { window, close } = load({ boot: true, now: NOW, settings: { dashboard: true }, storage: DASH_STORAGE });
  try {
    const doc = window.document;
    await sleep(200);
    const btn = doc.getElementById('atqm-dashbtn');
    assert.equal(btn.hidden, false);
    btn.click();
    const dash = doc.getElementById('atqm-dash');
    assert.ok(dash);
    const text = dash.textContent;
    for (const s of ['Overdue', 'Due in the next hour', 'Waiting for a first response', 'Next up', 'Deadlines in the next 8 hours', 'Queues', 'Recent changes']) {
      assert.ok(text.includes(s), s);
    }
    const cols = [...dash.querySelectorAll('.dash-col')];
    assert.equal(cols.length, 8);
    assert.equal(cols[0].getAttribute('aria-label'), '1 deadline, Now–13:00');
    assert.equal(dash.querySelectorAll('.dash-cap').length, 1); // only the tallest column is labelled

    // The same numbers as a table
    // Every ticket in My queue, those needing action first, each with its status and priority
    const rows = [...dash.querySelectorAll('.dash-tt tr')].map(tr => tr.textContent);
    assert.deepEqual(rows.filter(r => /^(Needs action|No action needed) · /.test(r)), ['Needs action · 3', 'No action needed · 1']);
    const tickets = rows.filter(r => /^T\d{8}/.test(r)).map(r => r.slice(0, 14));
    assert.deepEqual(tickets, ['T20261001.0001', 'T20261001.0002', 'T20261001.0003', 'T20261001.0004']);
    const resting = [...dash.querySelectorAll('.dash-tt tr.resting')];
    assert.equal(resting.length, 1);
    assert.match(resting[0].textContent, /Waiting Customer/);
    assert.match(resting[0].textContent, /Low/);
    assert.match(dash.querySelector('.dash-tt tr.overdue').textContent, /In Progress.*High.*30m overdue/);

    // The deadlines chart as a table
    [...dash.querySelectorAll('button')].find(b => b.textContent === 'Table').click();
    assert.equal(doc.querySelectorAll('#atqm-dash .dash-table:not(.dash-tt) tr').length, 9);

    doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.getElementById('atqm-dash'), null);
  } finally {
    close();
  }
});

test('boot: no dashboard button unless the setting is on', async () => {
  const { window, close } = load({ boot: true, storage: DASH_STORAGE });
  try {
    await sleep(200);
    assert.equal(window.document.getElementById('atqm-dashbtn').hidden, true);
  } finally {
    close();
  }
});
