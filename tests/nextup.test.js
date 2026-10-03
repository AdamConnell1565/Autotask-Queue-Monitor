'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const MIN = 60000, HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 2, 12, 0);
const plain = v => JSON.parse(JSON.stringify(v));

// Ticket numbers
const OVERDUE = 'T20261001.0001', SOON = 'T20261001.0002', LATER = 'T20261001.0003', REPLIED = 'T20261001.0004';
const ARRIVED = 'T20261001.0005', PAUSED = 'T20261001.0006', FR_SOON = 'T20261001.0007', WAITING = 'T20261001.0008';
const PICKED_UP = 'T20261001.0009';

// My queue tracked for all changes, plus a 1st line queue tracked for new tickets & first response
const queues = [
  { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' },
  { key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' },
];
const myQueue = {
  [OVERDUE]: { status: 'In Progress', due: NOW - 10 * MIN, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR },
  [SOON]: { status: 'In Progress', due: NOW + 30 * MIN, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR },
  [LATER]: { status: 'In Progress', due: NOW + 5 * HOUR, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR },
  [REPLIED]: { status: 'Action Required', due: NOW + 10 * HOUR, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR },
  [ARRIVED]: { status: 'New', firstSeen: NOW - 20 * MIN },
  [PAUSED]: { status: 'Scheduled', due: NOW - HOUR, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR },
};
const firstLine = {
  [FR_SOON]: { status: 'New', frDue: NOW + 5 * MIN, created: NOW - 10 * MIN },
  [WAITING]: { status: 'New', created: NOW - 30 * MIN },
  [PICKED_UP]: { status: 'In Progress', created: NOW - 40 * MIN },
  [OVERDUE]: { status: 'New', created: NOW - 6 * HOUR }, // also in My queue: listed once
};
const alerts = [
  { ts: NOW - 15 * MIN, q: 'my', type: 'action', ticket: REPLIED, from: 'Waiting Customer', to: 'Action Required', read: false,
    text: `${REPLIED}: Waiting Customer → Action Required` },
  { ts: NOW - 20 * MIN, q: 'my', type: 'new', ticket: ARRIVED, read: false, text: `New: ${ARRIVED}` },
  { ts: NOW - 5 * MIN, q: 'my', type: 'removed', ticket: 'T20261001.0099', read: false, text: 'Left queue: T20261001.0099' },
];
const storage = {
  'atqm:enabled': true,
  'atqm:queues': queues,
  'atqm:snap:my-open-tickets': myQueue,
  'atqm:snap:q:first-line': firstLine,
  'atqm:alerts': alerts,
};
const shape = items => plain(items.map(it => [it.g, it.kind === 'call' ? it.c.id : it.t.id]));

test('Next up: what you are doing first, then deadlines, then everything waiting by age', () => {
  const { api, close } = load({ now: NOW, storage });
  const items = api.nextUpItems();
  assert.deepEqual(shape(items), [
    ['doing', OVERDUE],     // In Progress in My queue, soonest deadline first
    ['doing', SOON],
    ['doing', LATER],
    ['soon', FR_SOON],      // first response due in 5 min (within 15)
    ['waiting', WAITING],   // New, no SLA: response target in 30 min
    ['waiting', ARRIVED],   // New, no SLA: response target in 40 min
    ['waiting', REPLIED],   // Action Required, resolution SLA in 10h: deadlines before age
  ]);
  // Scheduled rests, In Progress in a shared queue is someone else's, and a ticket that left the queue
  // is only in the history
  assert.equal(api.urgentCount(items), 7);
  assert.equal(api.nextSummary(items[0]), `Resolution 10m overdue: ${OVERDUE}`);
  const replied = items.find(it => it.t?.id === REPLIED);
  assert.equal(replied.changes.length, 1);
  assert.equal(replied.dl.due, NOW + 10 * HOUR);
  close();
});

test('Seen clears a ticket\'s changes; it keeps its place in the list', () => {
  const { api, close } = load({ now: NOW, storage });
  api.markTicketRead(REPLIED);
  api.markTicketRead(ARRIVED);
  const items = api.nextUpItems();
  assert.deepEqual(shape(items).filter(([g]) => g === 'waiting'), [['waiting', WAITING], ['waiting', ARRIVED], ['waiting', REPLIED]]);
  assert.equal(items.find(it => it.t?.id === REPLIED).changes.length, 0);
  assert.equal(api.urgentCount(items), 7);
  // Other unread changes are untouched
  assert.equal(api.get('atqm:alerts', []).filter(a => !a.read).length, 1);
  close();
});

test('Next up follows the settings: thresholds and statuses that need action', () => {
  const { api, close } = load({ now: NOW, storage, settings: { dueSoonMinutes: 15, actionStatuses: '' } });
  const items = api.nextUpItems();
  // With no list every status (Scheduled too) needs action, so its overdue SLA counts
  assert.equal(items.find(it => it.t?.id === PAUSED).g, 'breached');
  close();
});

test('Next up follows the "due soon" thresholds', () => {
  const { api, close } = load({ now: NOW, storage, settings: { frSoonMinutes: 3 } });
  const items = api.nextUpItems();
  // A first response 5 minutes away is no longer due soon: it waits its turn by age
  assert.equal(items.find(it => it.t?.id === FR_SOON).g, 'waiting');
  close();
});

test('Next up with only My queue tracked', () => {
  const { api, close } = load({ now: NOW, storage: { ...storage, 'atqm:queues': [queues[0]] } });
  assert.deepEqual(shape(api.nextUpItems()), [
    ['doing', OVERDUE],
    ['doing', SOON],
    ['doing', LATER],
    ['waiting', ARRIVED],
    ['waiting', REPLIED],
  ]);
  close();
});

test('service calls: the one in progress comes first, the rest of today last', () => {
  const calls = {
    501: { start: NOW - 10 * MIN, end: NOW + 50 * MIN, account: 'Example Dental', description: 'Replace switch' },
    502: { start: NOW + 3 * HOUR, end: NOW + 4 * HOUR, account: 'Sample Solicitors' },
    503: { start: NOW + 24 * HOUR, end: NOW + 25 * HOUR, account: 'Tomorrow Ltd' },
  };
  const { api, close } = load({
    now: NOW,
    settings: { serviceCalls: true },
    storage: {
      ...storage,
      'atqm:queues': [queues[0], { key: 'calls', nav: 'Service Calls', section: 'My Workspace', mode: 'calls' }],
      'atqm:snap:q:calls': calls,
    },
  });
  const items = api.nextUpItems();
  assert.deepEqual(shape(items)[0], ['now', '501']);
  assert.deepEqual(shape(items).at(-1), ['calls', '502']);
  assert.ok(!items.some(it => it.c?.id === '503'));
  assert.equal(api.nextSummary(items[0]), 'Service call now: Example Dental – Replace switch');
  close();
});

test('status changes record where they came from and went to', () => {
  const { api, close } = load({ now: NOW });
  const q = api.trackedQueues()[0];
  const t = status => ({ id: OVERDUE, status, title: 'Printer', due: null, frDue: null });
  api.scanFull(q, { tickets: [t('Waiting Customer')], rowCount: 1 });
  api.scanFull(q, { tickets: [t('Action Required')], rowCount: 1 });
  const [a] = api.get('atqm:alerts', []);
  assert.equal(a.from, 'Waiting Customer');
  assert.equal(a.to, 'Action Required');
  close();
});

test('waiting tickets: an SLA comes before age; without one, oldest first', () => {
  const { api, close } = load({ now: NOW, settings: { responseTarget: 0 }, storage: {
    'atqm:queues': [queues[0]],
    'atqm:snap:my-open-tickets': {
      'T20261001.0001': { status: 'Action Required', created: NOW - 7 * 24 * HOUR },                                     // a week old, no SLA
      'T20261001.0002': { status: 'Escalated', created: NOW - 2 * HOUR, due: NOW + 6 * HOUR, slaEvent: 'Resolution' },   // younger, SLA later
      'T20261001.0003': { status: 'Waiting Internal', created: NOW - HOUR, due: NOW + 3 * HOUR, slaEvent: 'Resolution' },// youngest, SLA sooner
      'T20261001.0004': { status: 'Action Required', created: NOW - 3 * 24 * HOUR },                                     // three days old, no SLA
    },
  } });
  assert.deepEqual(shape(api.nextUpItems()), [
    ['waiting', 'T20261001.0003'],
    ['waiting', 'T20261001.0002'],
    ['waiting', 'T20261001.0001'],
    ['waiting', 'T20261001.0004'],
  ]);
  close();
});
