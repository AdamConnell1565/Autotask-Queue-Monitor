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

test('boot: the cog opens Settings over the whole window; Esc closes it', async () => {
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
    assert.equal(d.getAttribute('aria-modal'), 'true');
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

test('boot: Settings opens from the dashboard too, and Esc closes Settings first', async () => {
  const { window, close } = load({ boot: true, settings: { dashboard: true } });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-dashbtn').click();
    button(doc.getElementById('atqm-dash'), /^Settings$/).click();
    assert.ok(doc.getElementById('atqm-settings'));
    esc(window);
    assert.equal(doc.getElementById('atqm-settings'), null);
    assert.ok(doc.getElementById('atqm-dash'), 'dashboard still open');
    esc(window);
    assert.equal(doc.getElementById('atqm-dash'), null);
  } finally {
    close();
  }
});
