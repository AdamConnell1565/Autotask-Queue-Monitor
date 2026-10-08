'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, setNow } = require('./harness');

const MIN = 60000;
const NOW = Date.UTC(2026, 9, 2, 12, 0);
const grid = (tickets, rowCount = tickets.length) => ({ tickets, rowCount });
const t = (id, more = {}) => ({ id, status: 'New', title: 'Ticket ' + id, account: '', priority: '', slaEvent: '', due: null, frDue: null, created: null, ...more });
const alerts = api => api.get(api.K.alerts, []).map(a => ({ type: a.type, ticket: a.ticket }));
const plain = v => JSON.parse(JSON.stringify(v));

test('scanFull: baseline, then new, status changes and tickets leaving', () => {
  const { api, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  api.scanFull(q, grid([t('T20261001.0001'), t('T20261001.0002')]));
  assert.equal(api.get(q.state, {}).note, 'Baseline saved');
  assert.deepEqual(alerts(api), []);

  api.scanFull(q, grid([t('T20261001.0001', { status: 'In Progress' }), t('T20261001.0003')]));
  assert.deepEqual(plain(alerts(api)), [
    { type: 'status', ticket: 'T20261001.0001' },
    { type: 'new', ticket: 'T20261001.0003' },
    { type: 'removed', ticket: 'T20261001.0002' },
  ]);
  close();
});

test('a status change made while the ticket is open in front of you arrives already seen', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const scan = status => api.scanFull(q, grid([t('T20261001.0001', { status }), t('T20261001.0002', { status })]));
  scan('New'); // baseline
  // You have T20261001.0001 open and pick it up; someone else picks up the other one
  api.set(api.K.viewed, { 'T20261001.0001': NOW });
  setNow(window, NOW + 15000);
  scan('In Progress');
  // Closed a while ago: a change after that is news again
  setNow(window, NOW + 10 * MIN);
  scan('Action Required');
  assert.deepEqual(plain(api.get(api.K.alerts, []).map(a => [a.ticket, a.to, !!a.read, !!a.quiet])), [
    ['T20261001.0001', 'In Progress', true, true],
    ['T20261001.0002', 'In Progress', false, false],
    ['T20261001.0001', 'Action Required', false, false],
    ['T20261001.0002', 'Action Required', false, false],
  ]);
  close();
});

test('scanFull: with only part of the queue visible, "left queue" is not reported', () => {
  const html = '<!doctype html><body><div class="Pager"><span class="VisibleRows">1 - 2 of 10</span></div></body>';
  const { api, close } = load({ now: NOW, html });
  const q = api.trackedQueues()[0];
  api.scanFull(q, grid([t('T20261001.0001'), t('T20261001.0002')]));
  api.scanFull(q, grid([t('T20261001.0001')], 1));
  assert.deepEqual(alerts(api), []);
  assert.equal(api.get(q.state, {}).partial, true);
  close();
});

test('scanFull: SLA due soon, then breached, each alerted once', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const ticket = t('T20261001.0001', { due: NOW + 120 * MIN, slaEvent: 'Resolution', status: 'In Progress' });
  api.scanFull(q, grid([ticket]));
  setNow(window, NOW + 90 * MIN);
  api.scanFull(q, grid([ticket]));
  api.scanFull(q, grid([ticket]));
  setNow(window, NOW + 125 * MIN);
  api.scanFull(q, grid([ticket]));
  assert.deepEqual(plain(alerts(api).map(a => a.type)), ['soon', 'overdue']);
  close();
});

test('scanFull: paused statuses get no SLA alerts', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const ticket = t('T20261001.0001', { due: NOW + 120 * MIN, status: 'Scheduled' });
  api.scanFull(q, grid([ticket]));
  setNow(window, NOW + 125 * MIN);
  api.scanFull(q, grid([ticket]));
  assert.deepEqual(alerts(api), []);
  close();
});

test('a snapshot that cannot be saved does not make every scan repeat the same alerts', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  api.scanFull(q, grid([t('T20261001.0001')]));

  const setItem = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = function (k, v) {
    if (String(k).includes('snap:')) throw new window.DOMException('full', 'QuotaExceededError');
    return setItem.call(this, k, v);
  };
  const two = grid([t('T20261001.0001'), t('T20261001.0002')]);
  api.scanFull(q, two);
  assert.equal(alerts(api).length, 1);
  api.scanFull(q, two);
  api.scanFull(q, two);
  assert.equal(alerts(api).length, 1);
  assert.ok(api.storageFail());
  assert.ok(api.globalWarnings().some(w => /storage is full/.test(w)));
  close();
});

test('scanIntake: new arrivals once, and tickets moving between grid pages do not re-alert', () => {
  const queues = [{ key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' }];
  const { api, close } = load({ now: NOW, storage: { 'atqm:queues': queues } });
  const q = api.trackedQueues()[0];
  const [A, B, C] = ['T20261001.0001', 'T20261001.0002', 'T20261001.0003'].map(id => t(id));
  api.scanIntake(q, grid([A, B]));
  assert.equal(api.get(q.state, {}).note, 'Baseline saved');
  api.scanIntake(q, grid([A, B, C]));
  api.scanIntake(q, grid([A, C]));       // B drops off the visible page
  api.scanIntake(q, grid([A, B, C]));    // and comes back
  assert.deepEqual(plain(alerts(api)), [{ type: 'new', ticket: C.id }]);
  close();
});

test('scanIntake: first response due soon and breached', () => {
  const queues = [{ key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' }];
  const { api, window, close } = load({ now: NOW, storage: { 'atqm:queues': queues } });
  const q = api.trackedQueues()[0];
  const ticket = t('T20261001.0001', { frDue: NOW + 30 * MIN });
  api.scanIntake(q, grid([ticket]));
  setNow(window, NOW + 20 * MIN);
  api.scanIntake(q, grid([ticket]));
  setNow(window, NOW + 31 * MIN);
  api.scanIntake(q, grid([ticket]));
  assert.deepEqual(plain(alerts(api).map(a => a.type)), ['soon', 'overdue']);
  close();
});

test('health offers buttons instead of changing the grid by itself', () => {
  const state = { mode: 'ok', lastScan: NOW, ts: NOW, count: 2 };
  const cols = load({ now: NOW, storage: {
    'atqm:enabled': true,
    'atqm:state': { ...state, colNote: 'Missing column: Next SLA Event Due.', colMissing: ['slaDue'] },
  } });
  const h1 = cols.api.health(cols.api.trackedQueues()[0]);
  assert.equal(h1.cls, 'warn');
  assert.equal(h1.action.label, 'Add missing columns');
  cols.close();

  const rows = load({ now: NOW, storage: {
    'atqm:enabled': true,
    'atqm:state': { ...state, partial: true, total: 120, size: 50, max: 500 },
  } });
  const h2 = rows.api.health(rows.api.trackedQueues()[0]);
  assert.equal(h2.action.label, 'Show up to 500 rows');
  rows.close();

  const stale = load({ now: NOW + 10 * MIN, storage: { 'atqm:enabled': true, 'atqm:state': state } });
  assert.match(stale.api.health(stale.api.trackedQueues()[0]).text, /put it to sleep/);
  stale.close();
});

test('service calls refresh on their own, longer interval (10 min unless set)', () => {
  const queues = [
    { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' },
    { key: 'calls', nav: 'Service Calls', section: 'My Workspace', mode: 'calls' },
  ];
  const scanned = { mode: 'ok', lastScan: NOW, ts: NOW, count: 2 };
  const { api, window, close } = load({ now: NOW, storage: {
    'atqm:enabled': true, 'atqm:queues': queues, 'atqm:state': scanned, 'atqm:state:q:calls': scanned,
  } });
  const [my, calls] = api.trackedQueues();
  setNow(window, NOW + 4 * MIN);
  assert.match(api.health(my).text, /next scan due now/);   // queues: every 2 min
  assert.match(api.health(calls).text, /next in 6m/);       // calls: every 10
  // 12 minutes on: the queue's tab looks stopped, the calls tab is only just due
  setNow(window, NOW + 12 * MIN);
  assert.match(api.health(my).text, /put it to sleep/);
  assert.equal(api.health(calls).cls, 'ok');
  // 2.5 of its own refreshes without a scan: the calls tab has stopped too
  setNow(window, NOW + 26 * MIN);
  assert.match(api.health(calls).text, /put it to sleep/);
  close();

  const quick = load({ now: NOW + 4 * MIN, settings: { callRefreshMs: 3 * MIN }, storage: {
    'atqm:enabled': true, 'atqm:queues': queues, 'atqm:state:q:calls': scanned,
  } });
  assert.match(quick.api.health(quick.api.trackedQueues()[1]).text, /next scan due now/);
  quick.close();
});

test('health allows for a background tab scanning slower than the refresh setting', () => {
  const queues = [{ key: 'calls', nav: 'Service Calls', section: '', mode: 'calls' }];
  const { api, window, close } = load({ now: NOW, settings: { callRefreshMs: 2 * MIN }, storage: { 'atqm:enabled': true, 'atqm:queues': queues } });
  const q = api.trackedQueues()[0];
  // Refresh is every 2 min, but the browser holds the tab's timers back: scans land about 3.5 min apart
  for (let i = 0; i < 6; i++) {
    setNow(window, NOW + i * 3.5 * MIN);
    api.scanCalls(q, { calls: [], rowCount: 0 });
  }
  // One slow cycle (5.5 min) is not "stopped"
  setNow(window, NOW + 5 * 3.5 * MIN + 5.5 * MIN);
  assert.equal(api.health(q).cls, 'ok');
  // A tab that really stopped still shows up
  setNow(window, NOW + 5 * 3.5 * MIN + 20 * MIN);
  assert.match(api.health(q).text, /put it to sleep/);
  // An outage doesn't count as the queue's usual pace
  api.scanCalls(q, { calls: [], rowCount: 0 });
  assert.ok(api.get(q.state, {}).every < 4 * MIN);
  close();
});

test('statuses that need action: waking up alerts, settling into a resting status is logged quietly', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const notes = [];
  window.Notification = function (title) { notes.push(title); };
  window.Notification.permission = 'granted';
  const scan = status => api.scanFull(q, grid([t('T20261001.0001', { status })]));
  scan('In Progress');        // baseline
  scan('Waiting Customer');   // you set it waiting: logged, read, no ping
  scan('Action Required');    // the customer replied: needs action again
  scan('Escalated');          // between two action statuses: an ordinary change
  const log = api.get(api.K.alerts, []);
  assert.deepEqual(plain(log.map(a => [a.type, a.to, a.read])), [
    ['status', 'Waiting Customer', true],
    ['action', 'Action Required', false],
    ['status', 'Escalated', false],
  ]);
  assert.deepEqual(notes, ['My queue: 1 ticket needs action', 'My queue: 1 change']);
  close();
});

test('a resting ticket asks for nothing: no SLA alerts, not in Next up', () => {
  const { api, window, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const ticket = t('T20261001.0001', { status: 'Waiting Customer', due: NOW + 30 * MIN, slaEvent: 'Resolution' });
  api.scanFull(q, grid([ticket]));
  setNow(window, NOW + 40 * MIN);
  api.scanFull(q, grid([ticket]));
  assert.deepEqual(alerts(api), []);
  assert.deepEqual(plain(api.nextUpItems()), []);
  close();
});

test('a 1st line queue reports the status change that means a ticket needs action again', () => {
  const queues = [{ key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' }];
  const { api, close } = load({ now: NOW, storage: { 'atqm:queues': queues } });
  const q = api.trackedQueues()[0];
  const scan = status => api.scanIntake(q, grid([t('T20261001.0001', { status })]));
  scan('In Progress');
  scan('Waiting Vendor');     // not reported in this kind of queue
  scan('Action Required');
  assert.deepEqual(plain(alerts(api).map(a => a.type)), ['action']);
  close();
});
