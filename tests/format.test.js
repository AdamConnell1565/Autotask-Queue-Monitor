'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, setNow } = require('./harness');

const MIN = 60000;

test('dur', () => {
  const { api, close } = load();
  assert.equal(api.dur(30 * MIN), '30m');
  assert.equal(api.dur(90 * MIN), '1h 30m');
  assert.equal(api.dur(120 * MIN), '2h');
  assert.equal(api.dur(3 * 86400000), '3d');
  assert.equal(api.dur(-5 * MIN), '5m');
  close();
});

test('dueState', () => {
  const now = Date.UTC(2026, 9, 2, 12, 0);
  const { api, close } = load({ now });
  assert.equal(api.dueState(null, 60), null);
  assert.equal(api.dueState(now - MIN, 60), 'overdue');
  assert.equal(api.dueState(now + 30 * MIN, 60), 'soon');
  assert.equal(api.dueState(now + 61 * MIN, 60), 'ok');
  close();
});

test('reminderSlot: lead times before the start, then every minute after', () => {
  const start = Date.UTC(2026, 9, 2, 14, 0);
  const { api, window, close } = load({ now: start - 20 * MIN });
  const call = { start, end: start + 60 * MIN };
  assert.equal(api.reminderSlot(call), null);
  setNow(window, start - 12 * MIN);
  assert.equal(api.reminderSlot(call), 'b15');
  setNow(window, start - 3 * MIN);
  assert.equal(api.reminderSlot(call), 'b5');
  setNow(window, start + 30000);
  assert.equal(api.reminderSlot(call), 'b0');
  setNow(window, start + 3 * MIN);
  assert.equal(api.reminderSlot(call), 'a3');
  close();

  const quiet = load({ now: start + 3 * MIN, settings: { callPingAfterStart: false } });
  assert.equal(quiet.api.reminderSlot(call), null);
  quiet.close();
});

test('reminder lead times are cleaned up', () => {
  const { api, close } = load();
  const field = api.FIELDS.find(f => f.key === 'callLeadTimes');
  assert.equal(field.sanitize('5, 15, x, 300, 5'), '15, 5');
  assert.equal(field.sanitize('nonsense'), api.DEFAULTS.callLeadTimes);
  close();
});

test('cleanSetting keeps imported or typed values safe', () => {
  const { api, close } = load();
  const f = key => api.FIELDS.find(x => x.key === key);
  assert.equal(api.cleanSetting(f('refreshMs'), 1), 30000);              // below the 0.5 min minimum
  assert.equal(api.cleanSetting(f('refreshMs'), 'abc'), api.DEFAULTS.refreshMs);
  assert.equal(api.cleanSetting(f('refreshMs'), 300000), 300000);
  assert.equal(api.cleanSetting(f('dateOrder'), 'XYZ'), 'auto');
  assert.equal(api.cleanSetting(f('dateOrder'), 'YMD'), 'YMD');
  assert.equal(api.cleanSetting(f('sound'), 'yes'), api.DEFAULTS.sound);
  assert.equal(api.cleanSetting(f('sound'), false), false);
  assert.equal(api.cleanSetting(f('actionStatuses'), ' New ,, In Progress '), 'New, In Progress');
  close();
});

test('new defaults: grid changes are opt-in, dates are detected', () => {
  const { api, close } = load();
  assert.equal(api.CONFIG.autoColumns, false);
  assert.equal(api.CONFIG.autoPageSize, false);
  assert.equal(api.CONFIG.dateOrder, 'auto');
  assert.equal(api.CONFIG.timeZone, '');
  close();
});
