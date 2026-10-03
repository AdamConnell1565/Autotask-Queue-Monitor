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
