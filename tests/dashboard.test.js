'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const MIN = 60000, HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 2, 12, 20);
const plain = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
const esc = window => window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

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
    ['waiting', 'T20261002.0003', 'Response target'], // due in 40 min
    ['waiting', 'T20261002.0004', 'First response'],  // due in an hour
  ]);
  close();

  const off = load({ now: NOW, settings: { responseTarget: 0 }, storage: { 'atqm:queues': QUEUES,
    'atqm:snap:q:first-line': { 'T20261002.0001': { status: 'New', created: NOW - 70 * MIN } } } });
  assert.deepEqual(ids(off.api.nextUpItems()), [['waiting', 'T20261002.0001', null]]);
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
    const rows = [...dash.querySelectorAll('.dash-mq tr')].map(tr => tr.textContent);
    assert.deepEqual(rows.filter(r => /^(Needs action|No action needed) · /.test(r)), ['Needs action · 3', 'No action needed · 1']);
    const tickets = rows.filter(r => /^T\d{8}/.test(r)).map(r => r.slice(0, 14));
    assert.deepEqual(tickets, ['T20261001.0001', 'T20261001.0002', 'T20261001.0003', 'T20261001.0004']);
    const resting = [...dash.querySelectorAll('.dash-mq tr.resting')];
    assert.equal(resting.length, 1);
    assert.match(resting[0].textContent, /Waiting Customer/);
    assert.match(resting[0].textContent, /Low/);
    assert.match(dash.querySelector('.dash-mq tr.overdue').textContent, /In Progress.*High.*30m overdue/);

    // Next up as a table, grouped, with a queue column as more than one queue is tracked
    const nt = dash.querySelector('.dash-nt');
    assert.deepEqual([...nt.querySelectorAll('th')].map(th => th.textContent), ['When', 'Ticket', 'Status', 'Priority', 'Queue', 'Title', 'Deadline']);
    assert.deepEqual([...nt.querySelectorAll('tr.dash-grp')].map(tr => tr.textContent.replace(/ · \d+$/, '')),
      ['In progress', 'Overdue', 'Due soon', 'Waiting for you']);

    // The deadlines chart as a table
    [...dash.querySelectorAll('button')].find(b => b.textContent === 'Table').click();
    assert.equal(doc.querySelectorAll('#atqm-dash .dash-table:not(.dash-tt) tr').length, 9);

    doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.getElementById('atqm-dash'), null);
  } finally {
    close();
  }
});

test('boot: the red count is the tickets that need you within the hour, not unread changes', async () => {
  const { window, close } = load({ boot: true, now: NOW, storage: DASH_STORAGE });
  try {
    await sleep(200);
    const badge = window.document.getElementById('atqm-badge');
    // Two overdue (an SLA and a passed response target) and one due in 25 minutes; the unread change doesn't count
    assert.equal(badge.textContent, '3');
    assert.equal(badge.title, '3 tickets need you within the hour: 2 overdue, 1 due soon');
  } finally {
    close();
  }
  const calm = load({ boot: true, now: NOW, storage: { ...DASH_STORAGE, 'atqm:snap:my-open-tickets': {}, 'atqm:snap:q:first-line': {} } });
  try {
    await sleep(200);
    assert.equal(calm.window.document.getElementById('atqm-badge').style.display, 'none');
  } finally {
    calm.close();
  }
});

test("boot: the dashboard opens below Autotask's top bar and under its menus, and only reopens on the same page", async () => {
  const html = '<!doctype html><body><div id="nav" style="position:fixed;z-index:50"><a id="new">New</a></div>' +
    '<div id="content" style="position:relative;z-index:2"><p id="grid">Tickets</p></div></body>';
  const { window, close } = load({ boot: true, now: NOW, html, storage: DASH_STORAGE });
  try {
    const doc = window.document;
    // jsdom has no layout: say where things are, as a browser would (an 800 px window, a 48 px bar)
    const nav = doc.getElementById('nav'), content = doc.getElementById('content');
    nav.getBoundingClientRect = () => ({ top: 0, bottom: 48, height: 48, width: window.innerWidth, left: 0, right: window.innerWidth });
    content.getBoundingClientRect = () => ({ top: 48, bottom: 800, height: 752, width: window.innerWidth, left: 0, right: window.innerWidth });
    doc.elementsFromPoint = (x, y) => (y < 48 ? [doc.getElementById('new'), nav] : [doc.getElementById('grid'), content]);
    await sleep(200);
    doc.getElementById('atqm-dashbtn').click();
    const dash = doc.getElementById('atqm-dash');
    assert.equal(dash.style.top, '48px');
    assert.equal(dash.style.zIndex, '3'); // just over the page it covers, under the bar (50) and its menus
    assert.equal(window.sessionStorage.getItem('atqm:dash'), window.location.pathname + window.location.search);

    // Opened on another page: not reopened here
    window.sessionStorage.setItem('atqm:dash', '/Mvc/Somewhere/Else.mvc');
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'atqm:alerts' }));
    await sleep(200);
    assert.equal(doc.getElementById('atqm-dash'), null);
  } finally {
    close();
  }
});

// Autotask's top bar as it's built today, structure only (see docs/autotask-pages.md)
const HEADER = '<div class="relative min-h-3.5rem h-3.5rem flex justify-between" data-slot="header" id="hdr">' +
  '<div class="min-w-0 min-h-0 flex"><div class="flex-none flex items-center" data-slot="header:logo"><img alt=""></div>' +
  '<div class="relative min-w-0 flex" data-slot="header:navigation-section"><button class="h-full min-w-4.5rem max-w-12rem flex-none flex ' +
  'items-center px-4 text-body color-text-primary truncate cursor-pointer outline-none" type="button" data-slot="header:navigation-menu-button">' +
  '<div class="flex-grow">Dashboards</div><span class="fa-chevron-down fa-regular flex"></span></button></div></div>' +
  '<div class="relative flex justify-end"><div data-slot="header:search-bar-container"><input placeholder="Search"></div>' +
  '<div class="flex" data-slot="header:utility-buttons"><button type="button" data-slot="header:utility-menu-button" id="plus"></button></div></div></div>';

test("boot: the dashboard opens below Autotask's header, with a notice above it and something laid over the page", async () => {
  const html = '<!doctype html><body><div id="notice">Scheduled maintenance tonight</div>' + HEADER +
    '<div id="content" style="position:relative;z-index:2"><p id="grid">Tickets</p></div><div id="layer" style="position:fixed;inset:0"></div></body>';
  const { window, close } = load({ boot: true, now: NOW, html, storage: DASH_STORAGE });
  try {
    const doc = window.document, W = window.innerWidth;
    const at = (el, top, bottom) => { el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, width: W, left: 0, right: W }); };
    const [notice, hdr, content, layer] = ['notice', 'hdr', 'content', 'layer'].map(id => doc.getElementById(id));
    // A 30 px notice, the 56 px bar under it, the page below, and a transparent layer over everything
    at(notice, 0, 30); at(hdr, 30, 86); at(content, 86, 800); at(layer, 0, 800);
    doc.elementsFromPoint = (x, y) => [layer, ...(y < 30 ? [notice] : y < 86 ? [doc.getElementById('plus'), hdr] : [doc.getElementById('grid'), content])];
    await sleep(200);
    doc.getElementById('atqm-dashbtn').click();
    assert.equal(doc.getElementById('atqm-dash').style.top, '86px');

    // A page without that header: found by where it is, through the layer and past the notice
    hdr.removeAttribute('data-slot');
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'atqm:alerts' }));
    await sleep(200);
    assert.equal(doc.getElementById('atqm-dash').style.top, '86px');
  } finally {
    close();
  }
});

test("boot: a Queue monitor menu in Autotask's top bar, built like Autotask's own, opens the dashboard and Settings and shows or hides things", async () => {
  const html = '<!doctype html><body>' + HEADER + '<div id="content"><p id="grid">Tickets</p></div></body>';
  const { window, close } = load({ boot: true, now: NOW, html, storage: DASH_STORAGE });
  try {
    const doc = window.document;
    await sleep(200);
    const btn = doc.getElementById('atqm-navbtn');
    const theirs = doc.querySelector('[data-slot="header:navigation-menu-button"]');
    // After Autotask's own menus, with their button's classes and chevron
    assert.equal(doc.querySelector('[data-slot="header:navigation-section"]').nextElementSibling, btn);
    assert.equal(btn.className, theirs.className + ' max-sm:hidden');
    assert.equal(btn.querySelector('span').className, theirs.querySelector('span').className);
    assert.match(btn.querySelector('.atqm-navname').textContent, /^Autotask Queue Monitor (v\d+\.\d+\.\d+|\(dev\))$/);
    assert.match(btn.querySelector('.atqm-navby').textContent, /^By \S/);

    const menu = () => doc.getElementById('atqm-navmenu');
    const items = () => [...menu().querySelectorAll('[role=menuitem]')].map(b => b.textContent);
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(items(), ['Dashboard', 'Settings', 'Hide Queue monitor window', 'Hide Macros button on ticket pop-ups', 'Update']);
    // Update: a link to the latest release, the same address Tampermonkey updates from (the header's @downloadURL)
    const update = [...menu().querySelectorAll('[role=menuitem]')].pop();
    const header = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'autotaskQueueMonitor.user.js'), 'utf8');
    assert.equal(update.tagName, 'A');
    assert.equal(update.href, header.match(/^\/\/ @downloadURL\s+(\S+)$/m)[1]);
    assert.equal(update.target, '_blank');
    // Esc closes it, back to its button; so does a click anywhere else
    menu().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(menu(), null);
    assert.equal(doc.activeElement, btn);
    btn.click();
    doc.getElementById('grid').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    assert.equal(menu(), null);

    btn.click();
    button(menu(), /^Dashboard$/).click();
    assert.equal(menu(), null);
    assert.ok(doc.getElementById('atqm-dash'));
    btn.click();
    button(menu(), /^Settings$/).click();
    assert.ok(doc.getElementById('atqm-settings'));
    esc(window);

    // The window: hidden, saved for every tab, and back again
    const w = doc.getElementById('atqm');
    btn.click();
    button(menu(), /^Hide Queue monitor window$/).click();
    assert.ok(w.classList.contains('atqm-off'));
    assert.equal(JSON.parse(window.localStorage.getItem('atqm:settings')).showWindow, false);
    btn.click();
    button(menu(), /^Show Queue monitor window$/).click();
    assert.ok(!w.classList.contains('atqm-off'));
    // The ticket pop-ups' Macros button
    btn.click();
    button(menu(), /^Hide Macros button on ticket pop-ups$/).click();
    assert.equal(JSON.parse(window.localStorage.getItem('atqm:settings')).ticketMacroButton, false);
    btn.click();
    assert.ok(items().includes('Show Macros button on ticket pop-ups'));

    // Autotask redraws its bar: the menu goes back in
    btn.remove();
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'atqm:alerts' }));
    await sleep(200);
    assert.ok(doc.querySelector('[data-slot="header"] #atqm-navbtn'));
  } finally {
    close();
  }
});

test('boot: the Queue monitor window is put away while the dashboard is open', async () => {
  const { window, close } = load({ boot: true, now: NOW, storage: DASH_STORAGE });
  try {
    const doc = window.document, open = () => doc.documentElement.classList.contains('atqm-dash-open');
    await sleep(200);
    assert.ok(!open());
    doc.getElementById('atqm-dashbtn').click();
    assert.ok(open());
    esc(window);
    assert.equal(doc.getElementById('atqm-dash'), null);
    assert.ok(!open());
  } finally {
    close();
  }
});

test("boot: reloaded with the dashboard open, it moves below Autotask's top bar as soon as Autotask builds it", async () => {
  const url = 'https://ww5.autotask.net/Mvc/Framework/Navigation.mvc/Landing';
  const { window, close } = load({ boot: true, now: NOW, url, storage: DASH_STORAGE, session: { 'atqm:dash': '/Mvc/Framework/Navigation.mvc/Landing' } });
  try {
    const doc = window.document;
    await sleep(200);
    const dash = doc.getElementById('atqm-dash');
    assert.ok(dash, 'reopened');
    assert.equal(dash.style.top, '', 'no bar yet: the whole window');
    // Autotask builds its bar a moment later
    const hdr = doc.createElement('div');
    hdr.setAttribute('data-slot', 'header');
    hdr.getBoundingClientRect = () => ({ top: 0, bottom: 56, height: 56, width: window.innerWidth, left: 0, right: window.innerWidth });
    doc.body.prepend(hdr);
    await sleep(300);
    assert.equal(dash.style.top, '56px');
    assert.ok(hdr.querySelector('#atqm-navbtn'), 'and the Queue monitor menu is in it');
  } finally {
    close();
  }
});

test("boot: without Autotask's top bar there's no menu, so the window stays even with the setting off", async () => {
  const { window, close } = load({ boot: true, now: NOW, settings: { showWindow: false }, storage: DASH_STORAGE });
  try {
    await sleep(200);
    assert.equal(window.document.getElementById('atqm-navbtn'), null);
    assert.ok(!window.document.getElementById('atqm').classList.contains('atqm-off'));
  } finally {
    close();
  }
});

test('boot: the dashboard button is there by default, and gone with the setting off', async () => {
  const on = load({ boot: true, storage: DASH_STORAGE });
  try {
    await sleep(200);
    assert.equal(on.window.document.getElementById('atqm-dashbtn').hidden, false);
  } finally {
    on.close();
  }
  const { window, close } = load({ boot: true, settings: { dashboard: false }, storage: DASH_STORAGE });
  try {
    await sleep(200);
    assert.equal(window.document.getElementById('atqm-dashbtn').hidden, true);
  } finally {
    close();
  }
});

test('priority colours are read off the grid and used wherever a priority shows', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const [first] = window.document.querySelectorAll('tr.Display');
  first.cells[5].innerHTML = '<span style="color: rgb(220, 0, 0)">High</span>';
  api.readGrid();
  assert.deepEqual(plain(api.get('atqm:priority:colors', {})), { high: 'rgb(220, 0, 0)', medium: null });
  assert.ok(api.priorityWord('High').style.color);
  assert.equal(api.priorityWord('Medium').style.color, '');
  close();
});

test('before its colour is known, a high priority is picked out anyway', () => {
  const { api, close } = load();
  assert.match(api.priorityWord('Critical').className, /\bhi\b/);
  assert.doesNotMatch(api.priorityWord('Low').className, /\bhi\b/);
  close();
});

test('boot: the dashboard leaves out what has nothing to show', async () => {
  const quiet = {
    'atqm:enabled': true,
    'atqm:state': { mode: 'ok', lastScan: NOW, ts: NOW, count: 2 },
    'atqm:snap:my-open-tickets': {
      'T20261001.0001': { status: 'In Progress', title: 'Printer' },
      'T20261001.0002': { status: 'Waiting Customer', title: 'Laptop' },
    },
  };
  const { window, close } = load({ boot: true, now: NOW, settings: { dashboard: true }, storage: quiet });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-dashbtn').click();
    const dash = doc.getElementById('atqm-dash');
    assert.ok(!dash.textContent.includes('Deadlines in the next 8 hours'), 'no deadlines, no chart card');
    const heads = [...dash.querySelectorAll('.dash-mq th')].map(th => th.textContent);
    assert.deepEqual(heads, ['Ticket', 'Status', 'Priority', 'Title', 'Age'], 'no deadline column when no ticket has one');
    assert.equal(dash.querySelectorAll('.dash-mq tr').length, 5); // header, 2 groups, 2 tickets
  } finally {
    close();
  }
});
