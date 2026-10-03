'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const plain = v => JSON.parse(JSON.stringify(v));

test('the read cache still sees writes made by other tabs', () => {
  const { api, window, close } = load();
  assert.equal(api.get('atqm:x', null), null);
  window.localStorage.setItem('atqm:x', JSON.stringify({ n: 1 }));
  assert.equal(api.get('atqm:x', null).n, 1);
  const first = api.get('atqm:x', null);
  assert.equal(api.get('atqm:x', null), first); // parsed once, same object while unchanged
  window.localStorage.setItem('atqm:x', JSON.stringify({ n: 2 }));
  assert.equal(api.get('atqm:x', null).n, 2);
  close();
});

test('when storage is full, the older half of the history is dropped and the write retried', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ ts: i, text: 'change ' + i }));
  const { api, window, close } = load({ storage: { 'atqm:alerts': history } });
  const setItem = window.Storage.prototype.setItem;
  let failed = false;
  window.Storage.prototype.setItem = function (k, v) {
    if (k === 'atqm:big' && !failed) { failed = true; throw new window.DOMException('full', 'QuotaExceededError'); }
    return setItem.call(this, k, v);
  };
  assert.equal(api.set('atqm:big', { ok: true }), true);
  assert.equal(api.get('atqm:big', null).ok, true);
  const kept = api.get('atqm:alerts', []);
  assert.equal(kept.length, 10);
  assert.equal(kept[0].ts, 10); // the newest half
  assert.equal(api.storageFail(), null);
  close();
});

test('a failed write is reported', () => {
  const { api, window, close } = load();
  window.Storage.prototype.setItem = function () { throw new window.DOMException('blocked', 'SecurityError'); };
  assert.equal(api.set('atqm:y', 1), false);
  assert.equal(api.storageFail().key, 'atqm:y');
  close();
});

test('claim: one tab acts on an event, once', async () => {
  const { api, close } = load();
  assert.equal(await api.claim('atqm:claims', 'call-1', 'b15'), true);
  assert.equal(await api.claim('atqm:claims', 'call-1', 'b15'), false);
  assert.equal(await api.claim('atqm:claims', 'call-1', 'b10'), true);
  close();
});

test('ordinary tabs need a go-ahead to monitor; Quick start tabs do not', () => {
  const { api, window, close } = load();
  const q = api.trackedQueues()[0];
  assert.equal(api.mayMonitorHere(q), false);
  api.consentHere(q);
  assert.equal(api.mayMonitorHere(q), true);
  close();

  const launched = load();
  launched.window.sessionStorage.setItem('atqm:launched', '1');
  assert.equal(launched.api.mayMonitorHere(launched.api.trackedQueues()[0]), true);
  launched.close();
});

test('a tab opened for one queue does not monitor another queue it passes on the way', () => {
  const { api, window, close } = load();
  const my = api.trackedQueues()[0];
  window.sessionStorage.setItem('atqm:launched', '1');
  window.sessionStorage.setItem('atqm:launchKey', 'first-line'); // opened for the 1st line queue
  assert.equal(api.mayMonitorHere(my), false);
  assert.equal(api.mayMonitorHere({ key: 'first-line' }), true);
  window.sessionStorage.removeItem('atqm:launchKey'); // arrived
  assert.equal(api.mayMonitorHere(my), true);
  close();
});

test('import checks everything in the file', () => {
  const { api, close } = load();
  const file = {
    app: 'atqm',
    settings: { refreshMs: 1, sound: 'loud', dateOrder: 'MDY', notAField: 1 },
    queues: [
      { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' },
      { key: 'first-line', nav: 'Support 1st Line', section: 'All', mode: 'intake' },
      { key: 'bad', nav: 'Bad', mode: 'everything' },
      { key: 'my', nav: 'Duplicate', mode: 'full' },
    ],
    urls: { my: 'https://ww5.autotask.net/Mvc/Workspace', 'first-line': 'javascript:alert(1)' },
    wsUrl: 'https://evil.example.com/autotask.net/',
    pos: { right: 40, top: 'x' },
  };
  assert.match(api.importSettings(JSON.stringify(file)), /2 tracked queues/);
  assert.deepEqual(plain(api.trackedQueues().map(q => q.key)), ['my', 'first-line']);
  const settings = api.get('atqm:settings', {});
  assert.deepEqual(plain(settings), { refreshMs: 30000, sound: true, dateOrder: 'MDY' });
  assert.equal(api.CONFIG.dateOrder, 'MDY');
  const [my, first] = api.trackedQueues();
  assert.equal(api.get(my.state, {}).url, 'https://ww5.autotask.net/Mvc/Workspace');
  assert.equal(api.get(first.state, {}).url, undefined);
  assert.equal(api.get('atqm:quickstart:wsurl', null), null);
  assert.equal(api.get('atqm:pos', null), null);

  assert.match(api.importSettings('{"not":"ours"}'), /isn't a Queue monitor settings file/);
  assert.match(api.importSettings('not json'), /isn't a Queue monitor settings file/);
  close();
});

test('a tab the browser closes straight after opening counts as a blocked pop-up', async () => {
  const { api, window, close } = load();
  window.open = () => ({ closed: true });
  assert.equal(api.openQueueTab({ key: 'my' }, 'https://ww5.autotask.net/x'), true);
  assert.equal(api.popupsBlocked(), false);
  await new Promise(r => setTimeout(r, 1700));
  assert.equal(api.popupsBlocked(), true);
  close();
});
