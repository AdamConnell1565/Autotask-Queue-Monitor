'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
const esc = window => window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const type = (window, input, value) => { input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
const saved = window => JSON.parse(window.localStorage.getItem('atqm:settings'));

test('boot: the cog opens Settings, with the Queue monitor window put away meanwhile; Esc closes it', async () => {
  const { window, close } = load({ boot: true, storage: { 'atqm:tab': '"settings"' } }); // the tab Settings had before 0.14
  try {
    const doc = window.document;
    await sleep(200);
    assert.equal(doc.querySelector('#atqm-tabs [aria-selected=true]').dataset.tab, 'next');
    assert.equal(doc.getElementById('atqm-tab-settings'), null);

    const cog = doc.getElementById('atqm-setbtn');
    assert.equal(cog.getAttribute('aria-label'), 'Open settings');
    cog.click();
    const d = doc.getElementById('atqm-settings');
    assert.ok(d, 'settings window');
    assert.equal(d.getAttribute('role'), 'dialog');
    assert.ok(doc.documentElement.classList.contains('atqm-set-open'), 'the Queue monitor window is hidden');
    assert.equal(d.style.top, '', 'no Autotask top bar on this page: the whole window');
    assert.deepEqual([...d.querySelectorAll('.set-nav button')].map(b => b.textContent), ['Tracked queues', 'Deadlines and statuses',
      'Alerts', 'Service calls', 'Monitoring', 'Window and display', 'Dates and times', 'Backup and help']);
    assert.equal(d.querySelector('.set-nav [aria-current=true]').textContent, 'Tracked queues');
    for (const key of ['refreshMs', 'callRefreshMs', 'actionStatuses', 'timeZone', 'sound', 'dashboard']) assert.ok(d.querySelector('#atqm-f-' + key), key);

    // Each queue's tracking style switches in place
    const seg = d.querySelector('.set-q .set-seg');
    assert.equal(seg.querySelector('[aria-pressed=true]').textContent, 'All changes');
    button(seg, /^New & first response$/).click();
    assert.equal(JSON.parse(window.localStorage.getItem('atqm:queues'))[0].mode, 'intake');
    assert.equal(d.querySelector('.set-q .set-seg [aria-pressed=true]').textContent, 'New & first response');

    esc(window);
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.ok(!doc.documentElement.classList.contains('atqm-set-open'), 'the Queue monitor window is back');
  } finally {
    close();
  }
});

test("boot: Settings sits below Autotask's top bar like the dashboard, in its place, with a button back to it", async () => {
  const html = '<!doctype html><body><div data-slot="header" id="hdr"><button type="button">New</button></div>' +
    '<div id="content" style="position:relative;z-index:2"><p id="grid">Tickets</p></div></body>';
  const { window, close } = load({ boot: true, html });
  try {
    const doc = window.document, W = window.innerWidth;
    // jsdom has no layout: a 56 px bar, the page below it at z-index 2
    const at = (el, top, bottom) => { el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, width: W, left: 0, right: W }); };
    at(doc.getElementById('hdr'), 0, 56);
    at(doc.getElementById('content'), 56, 800);
    doc.elementsFromPoint = (x, y) => (y < 56 ? [doc.getElementById('hdr')] : [doc.getElementById('grid'), doc.getElementById('content')]);
    await sleep(200);

    // From the cog: below the bar, a step above where the dashboard goes
    doc.getElementById('atqm-setbtn').click();
    let s = doc.getElementById('atqm-settings');
    assert.equal(s.style.top, '56px');
    assert.equal(s.style.zIndex, '4');
    // Its Dashboard button opens the dashboard in its place
    button(s, /^Dashboard$/).click();
    assert.equal(doc.getElementById('atqm-settings'), null);
    const dash = doc.getElementById('atqm-dash');
    assert.equal(dash.style.top, '56px');
    assert.equal(dash.style.zIndex, '3');

    // From the dashboard: in its place, and Back to dashboard closes Settings to it
    button(dash, /^Settings$/).click();
    s = doc.getElementById('atqm-settings');
    assert.equal(doc.getElementById('atqm-dash'), null);
    assert.equal(button(s, /^Dashboard$/), undefined);
    button(s, /^Back to dashboard$/).click();
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.equal(doc.getElementById('atqm-dash').style.top, '56px');
  } finally {
    close();
  }
});

test('boot: settings changes wait for Save, and closing asks before dropping them', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    const d = doc.getElementById('atqm-settings');
    const msg = d.querySelector('.set-msg');
    const save = button(d, /^Save changes$/);
    assert.equal(save.disabled, true);
    assert.equal(msg.textContent, 'No unsaved changes');

    const due = d.querySelector('#atqm-f-dueSoonMinutes');
    const sound = d.querySelector('#atqm-f-sound');
    type(window, due, '30');
    sound.click();
    assert.equal(msg.textContent, '2 unsaved changes');
    assert.ok(d.querySelector('[data-key=dueSoonMinutes]').classList.contains('changed'));
    assert.equal(window.localStorage.getItem('atqm:settings'), null, 'nothing saved yet');

    // Discard puts back what's saved
    button(d, /^Discard$/).click();
    assert.equal(due.value, '60');
    assert.equal(sound.checked, true);
    assert.equal(msg.textContent, 'No unsaved changes');

    type(window, due, '30');
    save.click();
    assert.equal(saved(window).dueSoonMinutes, 30);
    assert.equal(saved(window).sound, true);
    assert.equal(save.disabled, true);
    assert.match(msg.textContent, /^Saved/);

    // Out-of-range values are saved within range
    type(window, due, '99999');
    save.click();
    assert.equal(saved(window).dueSoonMinutes, 1440);
    assert.equal(due.value, '1440');

    type(window, due, '45');
    let asked = 0;
    window.confirm = () => { asked++; return false; };
    d.querySelector('.set-x').click();
    assert.equal(asked, 1);
    assert.ok(doc.getElementById('atqm-settings'), 'kept open with the change');
    window.confirm = () => true;
    esc(window);
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.equal(saved(window).dueSoonMinutes, 1440, 'the unsaved change was dropped');
  } finally {
    close();
  }
});

test('boot: finding a setting shows only the rows that match', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    const d = doc.getElementById('atqm-settings');
    const find = d.querySelector('.set-find input');
    const shown = () => [...d.querySelectorAll('.set-row[data-find]')].filter(r => !r.hidden && !r.closest('section').hidden);

    type(window, find, 'time zone');
    assert.deepEqual(shown().map(r => r.dataset.key), ['timeZone']);
    assert.deepEqual([...d.querySelectorAll('.set-nav button')].filter(b => !b.hidden).map(b => b.textContent), ['Dates and times']);

    type(window, find, 'service calls'); // a section's name shows all of it, and the queue refresh that points to it
    assert.deepEqual(shown().map(r => r.dataset.key), ['serviceCalls', 'callRefreshMs', 'callReminders', 'callLeadTimes', 'callPingAfterStart', 'refreshMs']);

    type(window, find, 'zzz');
    assert.equal(shown().length, 0);
    assert.match(d.querySelector('.set-none').textContent, /No settings match/);

    // Esc clears the search first, then closes
    find.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(find.value, '');
    assert.ok(doc.getElementById('atqm-settings'));
    assert.ok(shown().length > 20);
  } finally {
    close();
  }
});

test('boot: statuses that need action are chips, with the other statuses in your queues to add', async () => {
  const { window, close } = load({
    boot: true,
    settings: { actionStatuses: 'New, In Progress' },
    storage: {
      'atqm:snap:my-open-tickets': {
        'T20261001.0001': { status: 'In Progress', title: 'Printer' },
        'T20261001.0002': { status: 'Waiting Customer', title: 'Laptop' },
      },
    },
  });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    const d = doc.getElementById('atqm-settings');
    const row = d.querySelector('[data-key=actionStatuses]');
    const chips = () => [...row.querySelectorAll('.set-chip')].map(c => c.textContent.replace('×', ''));
    assert.deepEqual(chips(), ['New', 'In Progress']);
    assert.deepEqual([...row.querySelectorAll('.set-sugg button')].map(b => b.textContent), ['+ Waiting Customer']);

    button(row, /^\+ Waiting Customer$/).click();
    row.querySelector('[aria-label="Remove New"]').click();
    const input = row.querySelector('.set-chip-in');
    input.value = 'Escalated';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(chips(), ['In Progress', 'Waiting Customer', 'Escalated']);
    assert.equal(row.querySelector('.set-sugg').hidden, true, 'nothing left to suggest');

    button(d, /^Save changes$/).click();
    assert.equal(saved(window).actionStatuses, 'In Progress, Waiting Customer, Escalated');
  } finally {
    close();
  }
});

test('boot: Settings and the dashboard are open one at a time; Esc in Settings goes back to the dashboard it came from', async () => {
  const { window, close } = load({ boot: true, settings: { dashboard: true } });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-dashbtn').click();
    button(doc.getElementById('atqm-dash'), /^Settings$/).click();
    assert.ok(doc.getElementById('atqm-settings'));
    assert.equal(doc.getElementById('atqm-dash'), null, 'the dashboard closes for Settings');
    esc(window);
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.ok(doc.getElementById('atqm-dash'), 'back to the dashboard');
    esc(window);
    assert.equal(doc.getElementById('atqm-dash'), null);
  } finally {
    close();
  }
});

test('boot: a switch turned from the Queue monitor menu while Settings has unsaved changes stays turned when you Save', async () => {
  const html = '<!doctype html><body><div data-slot="header"><div data-slot="header:navigation-section"></div></div></body>';
  const { window, close } = load({ boot: true, html });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    type(window, doc.getElementById('atqm-f-refreshMs'), '5');
    doc.getElementById('atqm-navbtn').click();
    button(doc.getElementById('atqm-navmenu'), /^Hide Macros button on ticket pop-ups$/).click();
    assert.equal(doc.getElementById('atqm-f-ticketMacroButton').checked, false, 'the row shows it');
    button(doc.getElementById('atqm-settings'), /^Save changes$/).click();
    assert.equal(saved(window).ticketMacroButton, false);
    assert.equal(saved(window).refreshMs, 5 * 60000);
  } finally {
    close();
  }
});

test("boot: opening the dashboard while Settings is open (from Autotask's top bar) closes Settings, asking about unsaved changes", async () => {
  const html = '<!doctype html><body><div data-slot="header"><div data-slot="header:navigation-section"></div></div></body>';
  const { window, close } = load({ boot: true, html, settings: { dashboard: true } });
  try {
    const doc = window.document;
    await sleep(200);
    const toDashboard = () => {
      doc.getElementById('atqm-navbtn').click();
      button(doc.getElementById('atqm-navmenu'), /^Dashboard$/).click();
    };
    doc.getElementById('atqm-setbtn').click();
    // An unsaved change, kept: Settings stays and the dashboard waits
    type(window, doc.getElementById('atqm-f-refreshMs'), '5');
    let asked = 0;
    window.confirm = () => { asked++; return false; };
    toDashboard();
    assert.equal(asked, 1);
    assert.ok(doc.getElementById('atqm-settings'));
    assert.equal(doc.getElementById('atqm-dash'), null);
    // Dropped: Settings closes and the dashboard opens, on its own
    window.confirm = () => true;
    toDashboard();
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.ok(doc.getElementById('atqm-dash'));
    assert.ok(!doc.documentElement.classList.contains('atqm-set-open'));
  } finally {
    close();
  }
});
