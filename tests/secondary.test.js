'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const MIN = 60000, HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 2, 12, 0);
const plain = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Made-up people: you (Doe, Jane) and a colleague (Smith, John)
const ME = 'Doe, Jane', OTHER = 'Smith, John';
const MINE = 'T20261001.0001', SECOND = 'T20261001.0002', SECOND_DUE = 'T20261001.0003', SHARED = 'T20261001.0004';

test('parseResources: the primary resource is the one marked, or the only one', () => {
  const { api, close } = load();
  assert.deepEqual(plain(api.parseResources(`${OTHER} (primary) | ${ME}`)), { names: [OTHER, ME], primary: OTHER });
  assert.deepEqual(plain(api.parseResources(`${ME} (Primary)`)), { names: [ME], primary: ME });
  assert.deepEqual(plain(api.parseResources(ME)), { names: [ME], primary: ME });
  assert.deepEqual(plain(api.parseResources(`${ME} | ${OTHER}`)), { names: [ME, OTHER], primary: '' });
  assert.deepEqual(plain(api.parseResources('')), { names: [], primary: '' });
  close();
});

test('readGrid reads the Resources column; My queue tells whose name is yours', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const doc = window.document;
  doc.querySelector('tr.Heading').insertAdjacentHTML('beforeend', '<td>Resources</td>');
  const rows = doc.querySelectorAll('tr.Display');
  rows[0].insertAdjacentHTML('beforeend', `<td>${ME} (primary)</td>`);
  rows[1].insertAdjacentHTML('beforeend', `<td>${OTHER} (primary) | ${ME}</td>`);
  const grid = api.readGrid();
  assert.deepEqual(plain(grid.tickets.map(t => t.resources)), [`${ME} (primary)`, `${OTHER} (primary) | ${ME}`]);

  assert.equal(api.myName(), '');
  api.scanFull(api.trackedQueues()[0], grid);
  assert.equal(api.myName(), ME); // on both tickets; the colleague on one
  assert.equal(api.secondaryOf(grid.tickets[0]), null);
  assert.equal(api.secondaryOf(grid.tickets[1]), OTHER);
  close();
});

test('learnMyName: a tie keeps the name already worked out, and never guesses one', () => {
  const { api, close } = load();
  const both = [{ resources: `${OTHER} (primary) | ${ME}` }];
  api.learnMyName(both);
  assert.equal(api.myName(), ''); // both on the only ticket: can't tell
  api.learnMyName([...both, { resources: `${ME} (primary)` }]);
  assert.equal(api.myName(), ME);
  api.learnMyName(both);
  assert.equal(api.myName(), ME);
  close();
});

test('the name in Settings wins over the one worked out', () => {
  const { api, close } = load({ settings: { myName: ` ${OTHER} ` }, storage: { 'atqm:me': { name: ME, ts: 1 } } });
  assert.equal(api.myName(), OTHER);
  assert.equal(api.secondaryOf({ resources: `${OTHER} (primary) | ${ME}` }), null);
  assert.equal(api.secondaryOf({ resources: `${ME} (primary) | ${OTHER}` }), ME);
  close();
});

const STORAGE = {
  'atqm:enabled': true,
  'atqm:me': { name: ME, ts: 1 },
  'atqm:queues': [{ key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' }],
  'atqm:snap:my-open-tickets': {
    [MINE]: { status: 'Action Required', due: NOW + 2 * HOUR, slaEvent: 'Resolution', firstSeen: NOW - 5 * HOUR, resources: `${ME} (primary)` },
    [SECOND]: { status: 'In Progress', firstSeen: NOW - 3 * HOUR, resources: `${OTHER} (primary) | ${ME}` },
    [SECOND_DUE]: { status: 'Action Required', due: NOW - 10 * MIN, slaEvent: 'Resolution', firstSeen: NOW - 4 * HOUR,
      resources: `${OTHER} (primary) | ${ME}` },
    [SHARED]: { status: 'Action Required', firstSeen: NOW - 6 * HOUR }, // no Resources column: as before
  },
};

test('Next up: tickets you are a secondary resource on are listed on their own and do not count as needing you', () => {
  const { api, close } = load({ now: NOW, storage: STORAGE });
  const items = api.nextUpItems();
  assert.deepEqual(plain(items.map(it => [it.g, it.t.id])), [
    ['waiting', MINE],
    ['waiting', SHARED],
    ['second', SECOND_DUE], // overdue, but its primary resource's to meet: deadline first
    ['second', SECOND],     // In Progress, but not yours
  ]);
  assert.equal(api.urgentCount(items), 2);
  const stats = Object.fromEntries(plain(api.dashboardStats(items)).map(s => [s.label, s.value]));
  assert.equal(stats.Overdue, 0);
  assert.equal(stats['Need action'], 2);
  close();
});

test('boot: secondary resource tickets are marked Secondary in Next up and the dashboard, in a group of their own', async () => {
  const { window, close } = load({ boot: true, now: NOW, settings: { dashboard: true }, storage: STORAGE });
  try {
    const doc = window.document;
    await sleep(200);
    const next = [...doc.querySelectorAll('#atqm .atqm-next li')];
    assert.ok(next.some(li => li.textContent === 'Secondary resource'));
    const second = next.filter(li => li.classList.contains('second'));
    assert.equal(second.length, 2);
    for (const li of second) assert.match(li.querySelector('.atqm-2nd').title, /Smith, John is the primary resource/);
    assert.match(second[1].textContent, /in progress/);
    assert.ok(!doc.querySelector(`#atqm li:not(.second) .atqm-2nd`));

    doc.getElementById('atqm-dashbtn').click();
    const dash = doc.getElementById('atqm-dash');
    const groups = [...dash.querySelectorAll('.dash-mq tr.dash-grp')].map(tr => tr.textContent);
    assert.deepEqual(groups, ['Needs action · 2', 'Secondary resource · 2']);
    assert.deepEqual([...dash.querySelectorAll('.dash-mq tr.second')].map(tr => tr.textContent.slice(0, 14)), [SECOND_DUE, SECOND]);
    assert.ok([...dash.querySelectorAll('.dash-mq tr.second')].every(tr => tr.querySelector('.atqm-2nd')));
    assert.deepEqual([...dash.querySelectorAll('.dash-nt tr.dash-grp')].map(tr => tr.textContent.replace(/ · \d+$/, '')),
      ['Waiting for you', 'Secondary resource']);
    assert.equal(dash.querySelectorAll('.dash-nt tr.second').length, 2);
  } finally { close(); }
});
