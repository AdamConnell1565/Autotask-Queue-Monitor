'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const NOW = Date.UTC(2026, 9, 7, 12, 0);
const plain = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
const type = (window, input, value) => { input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
const tick = (window, box) => { box.checked = !box.checked; box.dispatchEvent(new window.Event('change', { bubbles: true })); };
const esc = window => window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const stored = window => JSON.parse(window.localStorage.getItem('atqm:macros') || '[]');
// The steps as the builder lists them: each step's block, and in brackets the lines between them
const lines = mb => [...mb.querySelectorAll('.mb-steps > li:not(.mb-drop)')]
  .map(li => (li.classList.contains('mb-step') ? li.querySelector('.mb-step-h b').textContent : `(${li.textContent})`));
const steps = mb => lines(mb).filter(l => !l.startsWith('('));
// A block on the left, by its name
const block = (mb, name) => [...mb.querySelectorAll('.mb-pal .mb-blk')].find(b => b.querySelector('b').textContent === name);
const ticketPage = '<!doctype html><body><div class="TitleBarItem Title"><span class="Text">Ticket </span>' +
  '<span class="SecondaryText">- T20261007.0081 - Laptop</span></div></body>';
const b = (type, more) => ({ type, ...more });

// The Macros tab, with its window expanded
async function macrosTab(window) {
  const doc = window.document;
  await sleep(400);
  doc.getElementById('atqm-min').click();
  doc.getElementById('atqm-tab-macros').click();
  await sleep(50);
  return doc.getElementById('atqm-panel');
}

test('a macro you build is kept clean: only the blocks the script knows, each with just the values it takes', () => {
  const { api, close } = load();
  const def = api.cleanMacroDef({ id: 'm1', v: 2, name: '  Password   reset ', about: 5, scope: 'everywhere', blocks: [
    b('edit', { extra: 'x' }),
    b('speedCode', { code: ' PWR ', ask: true }),
    b('runScript', { code: 'alert(1)' }),
    b('wait', { seconds: 600, ask: true }),
    b('summary', { text: '  Line one\r\nLine two  ', mode: 'sideways' }),
    b('setField', { field: 'Work Type', value: 'Onsite', empty: 'yes' }),
    null,
    b('saveTicket'),
  ] });
  assert.deepEqual(plain(def), { id: 'm1', v: 2, name: 'Password reset', about: '', scope: 'queue', blocks: [
    { type: 'edit' },
    { type: 'speedCode', code: 'PWR', ask: true },
    { type: 'wait', seconds: 60 },
    { type: 'summary', text: 'Line one\nLine two', mode: 'replace' },
    { type: 'setField', field: 'Work Type', value: 'Onsite', empty: false },
    { type: 'saveTicket' },
  ] });
  assert.equal(api.cleanMacroDef({ name: '  ', blocks: [] }), null, 'a name is needed');
  assert.equal(api.cleanMacroDef('x'), null);
  assert.match(api.cleanMacroDef({ id: 'not an id!', name: 'X' }).id, /^m[a-z0-9]+$/);
  assert.equal(api.cleanMacroDef({ id: 'm3', name: 'X', scope: 'page' }).scope, 'page');
  // Storage holding something else is no macros at all; one stored without its id isn't ours
  api.set('atqm:macros', { not: 'a list' });
  assert.deepEqual(plain(api.macroDefs()), []);
  api.set('atqm:macros', [{ name: 'No id', blocks: [] }, { id: 'm2', name: 'Kept', blocks: [] }]);
  assert.deepEqual(plain(api.macroDefs().map(d => d.id)), ['m2']);
  close();
});

test("a macro from 0.18, which pressed Edit and Save by itself, gets them put in", () => {
  const { api, close } = load();
  const def = api.cleanMacroDef({ id: 'm1', name: 'Old', blocks: [b('onlyIf', { field: 'Status', op: 'is', value: 'New' }), b('speedCode', { code: 'PWR' }),
    b('wait', { seconds: 3 }), b('setField', { field: 'Status', value: 'In Progress' }), b('onlyIf', { field: 'Status', op: 'set' })] });
  assert.deepEqual(plain(def.blocks.map(x => x.type)), ['onlyIf', 'edit', 'speedCode', 'wait', 'setField', 'saveTicket', 'onlyIf']);
  assert.equal(def.scope, 'queue');
  assert.equal(api.macroProblem(def), '', 'and it runs as it did');
  close();
});

test("the macro follows the pages its blocks lead to; a block on the wrong page, or an ending that isn't saved, says how to fix it", () => {
  const { api, close } = load();
  const flow = blocks => plain(api.macroFlow(blocks.map(t => b(t))));
  // Edit, the edit page's blocks, Save & Enter Time, the time entry's, Save time entry: back on the ticket's page
  let f = flow(['onlyIf', 'wait', 'edit', 'speedCode', 'wait', 'saveAndTime', 'timeCode', 'summary', 'saveEntry', 'quickNote']);
  assert.deepEqual([f.pages, f.end, f.problem], [['ticket', 'ticket', 'ticket', 'edit', 'edit', 'edit', 'time', 'time', 'time', 'ticket'], 'ticket', null]);
  f = flow(['newTime', 'hours', 'cancelEntry']);
  assert.deepEqual([f.pages, f.problem], [['ticket', 'time', 'time'], null]);
  // A ticket speed code straight away: Enter edit mode goes before it
  f = flow(['speedCode', 'saveTicket']);
  assert.deepEqual(f.problem, { i: 0, fix: ['edit'], text: "Step 1, Ticket speed code, works on the edit page, but the macro is on the ticket's page by then." });
  // A time entry speed code in edit mode: Save ticket & enter time goes before it
  assert.deepEqual(flow(['edit', 'timeCode']).problem.fix, ['saveAndTime']);
  // Ending in edit mode, or in a time entry: unsaved
  assert.deepEqual(flow(['edit', 'speedCode']).problem, { i: 2, fix: ['saveTicket'], text: "It ends on the edit page, so that wouldn't be saved: finish with Save ticket." });
  assert.deepEqual(flow(['newTime', 'hours']).problem.fix, ['saveEntry']);

  // What it needs before it can be saved
  const problem = blocks => api.macroProblem({ name: 'X', blocks });
  assert.equal(api.macroProblem({ name: ' ', blocks: [] }), 'Give the macro a name.');
  assert.match(problem([]), /^Drag blocks into the list/);
  assert.match(problem([b('onlyIf', { field: 'Status', op: 'is', value: 'New' })]), /a block that changes the ticket/);
  assert.match(problem([b('edit'), b('cancelEdit')]), /a block that changes the ticket/, "cancelling isn't changing it");
  assert.equal(problem([b('edit'), b('speedCode', { code: '' }), b('saveTicket')]), 'Step 2, Ticket speed code: Type the speed code.');
  assert.equal(problem([b('edit'), b('speedCode', { code: '', ask: true }), b('saveTicket')]), '', 'asked each time, it can start empty');
  assert.equal(problem([b('onlyIf', { field: 'Status', op: 'empty', value: '' }), b('quickNote', { text: 'Hi' })]), '', 'is empty takes no value');
  assert.match(problem([b('speedCode', { code: 'PWR' }), b('saveTicket')]), /^Step 1, Ticket speed code, works on the edit page/);
  close();
});

test('a macro you build asks, in its window, for the values set to ask each time', () => {
  const { api, close } = load();
  const params = api.askedParams({ blocks: [
    b('speedCode', { code: 'PWR', ask: true }), b('setField', { field: 'Work Type', value: 'Remote Support', empty: true, ask: true }),
    b('timeCode', { code: '', ask: true }), b('onlyIf', { field: 'Status', op: 'not', value: 'Complete', ask: true }),
    b('summary', { text: 'Done', ask: true }), b('speedCode', { code: 'X', ask: true }), b('wait', { seconds: 3 }),
  ] });
  assert.deepEqual(plain(params.map(p => [p.id, p.label, p.value, p.type])), [
    ['b0', 'Ticket speed code (step 1)', 'PWR', 'text'], ['b1', 'Work Type, if empty', 'Remote Support', 'text'],
    ['b2', 'Time entry speed code', '', 'text'], ['b3', "Only if Status isn't", 'Complete', 'text'], ['b4', 'Summary notes', 'Done', 'textarea'],
    ['b5', 'Ticket speed code (step 6)', 'X', 'text']]);
  assert.equal(params[0].required, 'Fill in Ticket speed code (step 1).');
  close();
});

test('boot: New macro opens the Macro builder; a block on the wrong page is fixed in a click, and saved it becomes a square', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    const panel = await macrosTab(window);
    const add = panel.querySelector('.mc-grid [data-macro=new]');
    assert.match(add.textContent, /New macro/);
    add.click();
    const mb = doc.getElementById('atqm-mb');
    assert.equal(mb.querySelector('[role=dialog]').getAttribute('aria-modal'), 'true');
    const save = button(mb, /^Save macro$/), msg = () => mb.querySelector('.mb-msg').textContent;
    const name = mb.querySelector('.mb-meta input');
    assert.equal(doc.activeElement, name);
    assert.ok(save.disabled);
    assert.equal(msg(), 'Give the macro a name.');
    // A queue selection macro to start with
    const kinds = [...mb.querySelectorAll('.mb-kind button')];
    assert.deepEqual(kinds.map(k => [k.textContent, k.getAttribute('aria-pressed')]), [['Queue selection', 'true'], ['On page', 'false']]);
    assert.match(mb.querySelector('.mb-kind').textContent, /each in a tab of its own, up to 5 at once/);
    // The blocks, by the page they work on
    assert.deepEqual([...mb.querySelectorAll('.mb-pal .mb-grp')].map(e => e.textContent), ["On the ticket's page", 'In edit mode', 'In a time entry', 'Anywhere']);
    assert.deepEqual([...mb.querySelectorAll('.mb-pal .mb-blk b')].map(e => e.textContent), ['Only if', 'Enter edit mode', 'New time entry', 'Quick note',
      'Ticket speed code', 'Set a ticket field', 'Save ticket', 'Save ticket & enter time', 'Cancel edit', 'Time entry speed code', 'Hours worked',
      'Summary notes', 'Internal notes', 'Set a time entry field', 'Save time entry', 'Cancel time entry', 'Wait']);
    assert.match(block(mb, 'Enter edit mode').textContent, /Then on the edit page/);
    type(window, name, 'Password reset');
    assert.match(mb.querySelector('.mb-empty').textContent, /Drag blocks here/);

    // A ticket speed code first: it works in edit mode, so the step says so, with a fix
    block(mb, 'Ticket speed code').click();
    assert.equal(doc.activeElement.id, 'atqm-mb-0-code', 'its box ready to type in');
    type(window, doc.activeElement, 'PWR');
    assert.ok(mb.querySelector('.mb-step[data-i="0"]').classList.contains('bad'));
    assert.match(mb.querySelector('.mb-step[data-i="0"] .mb-bad').textContent, /works on the edit page, but the macro is on the ticket's page by then/);
    assert.ok(save.disabled);
    button(mb.querySelector('.mb-bad'), /^Put in Enter edit mode before it$/).click();
    // Now it ends in edit mode, unsaved: the end says so
    assert.deepEqual(lines(mb).slice(0, 4), ['(Opens the ticket in a tab of its own)', 'Enter edit mode', '(Now in edit mode)', 'Ticket speed code']);
    assert.match(mb.querySelector('.mb-steps > li:last-child.mb-end').textContent, /^It ends on the edit page, so that wouldn't be saved/);
    button(mb.querySelector('.mb-end'), /^Put in Save ticket at the end$/).click();
    assert.deepEqual(lines(mb), ['(Opens the ticket in a tab of its own)', 'Enter edit mode', '(Now in edit mode)', 'Ticket speed code', 'Save ticket',
      "(Back on the ticket's page)", "(Done: closes the ticket's tab)"]);
    assert.deepEqual([...mb.querySelectorAll('.mb-step .mb-tag')].map(t => t.textContent), ['Ticket page', 'Edit mode', 'Edit mode']);

    // Only if, Enter on it: at the end; moved to the top with its arrow, it's checked before editing
    block(mb, 'Only if').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(doc.getElementById('atqm-mb-3-field').value, 'Status', 'starts on Status');
    type(window, doc.getElementById('atqm-mb-3-value'), 'New, In Progress');
    for (let i = 3; i > 0; i--) mb.querySelector(`.mb-step[data-i="${i}"] [data-act=up]`).click();
    assert.deepEqual(steps(mb), ['Only if', 'Enter edit mode', 'Ticket speed code', 'Save ticket']);
    assert.equal(doc.activeElement, mb.querySelector('.mb-step[data-i="0"] [data-act=down]'), 'at the top: on its other arrow');
    assert.equal(doc.getElementById('atqm-mb-0-value').value, 'New, In Progress', 'its values went with it');
    // "is empty" takes no value: its box goes, and comes back
    const op = doc.getElementById('atqm-mb-0-op');
    op.value = 'empty';
    op.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.getElementById('atqm-mb-0-value'), null);
    assert.equal(doc.activeElement.id, 'atqm-mb-0-op', 'redrawn, focus kept');
    doc.getElementById('atqm-mb-0-op').value = 'is';
    doc.getElementById('atqm-mb-0-op').dispatchEvent(new window.Event('change', { bubbles: true }));

    // An on page macro instead
    kinds[1].click();
    assert.equal(lines(mb)[0], '(On the ticket in the page you run it from)');
    assert.equal(lines(mb).at(-1), '(Done)');
    assert.match(mb.querySelector('.mb-head').textContent, /A new macro · 4 steps/);
    assert.equal(save.disabled, false);
    assert.equal(msg(), 'Ready to save: it goes in the Macros tab as Password reset.');

    save.click();
    assert.equal(doc.getElementById('atqm-mb'), null);
    const [def] = stored(window);
    assert.deepEqual({ ...def, id: 'x' }, { id: 'x', v: 2, name: 'Password reset', about: '', scope: 'page', blocks: [
      { type: 'onlyIf', field: 'Status', op: 'is', value: 'New, In Progress' }, { type: 'edit' }, { type: 'speedCode', code: 'PWR' }, { type: 'saveTicket' }] });
    // Its square: after Change account, before New macro, with focus on it
    const squares = [...panel.querySelectorAll('.mc-grid .mc-sq')];
    assert.deepEqual(squares.map(s => s.dataset.macro), ['account', 'c:' + def.id, 'new']);
    assert.equal(squares[1].textContent, 'Password resetOn pageDouble-click to run', 'it asks nothing: a double-click runs it');
    assert.equal(squares[1].title, 'Only if Status is New, In Progress, then Enter edit mode, then Ticket speed code PWR, then Save ticket');
    assert.equal(doc.activeElement, squares[1]);
  } finally {
    close();
  }
});

test('the Macro builder: blocks dragged into place, steps dragged by their handle to move them, or back onto the blocks to take them out', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    (await macrosTab(window)).querySelector('[data-macro=new]').click();
    const mb = doc.getElementById('atqm-mb'), list = mb.querySelector('.mb-steps'), pal = mb.querySelector('.mb-pal');
    // jsdom has no layout: each step 40 px tall, 50 px apart
    const layout = () => list.querySelectorAll('.mb-step').forEach((s, i) => {
      s.getBoundingClientRect = () => ({ top: i * 50, bottom: i * 50 + 40, height: 40, left: 0, right: 400, width: 400 });
    });
    const fire = (target, type, y = 0) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }));
    const dragIn = (name, y) => {
      const blk = block(mb, name);
      fire(blk, 'dragstart');
      layout();
      fire(list, 'dragover', y);
      const shown = list.querySelector('.mb-drop');
      fire(list, 'drop', y);
      fire(blk, 'dragend');
      return shown;
    };
    const dragStep = (i, onto, y) => {
      const li = list.querySelector(`.mb-step[data-i="${i}"]`);
      fire(li.querySelector('.mb-grip'), 'mousedown');
      fire(li, 'dragstart');
      layout();
      fire(onto, 'dragover', y);
      fire(onto, 'drop', y);
      fire(li, 'dragend');
    };

    dragIn('Ticket speed code', 0);
    dragIn('Save ticket', 100); // below the last step: at the end
    const shown = dragIn('Enter edit mode', 10); // above the first step's middle: before it
    assert.ok(shown, 'a line shows where it goes while it is dragged');
    assert.equal(list.querySelector('.mb-drop'), null, 'and goes once it is dropped');
    assert.deepEqual(steps(mb), ['Enter edit mode', 'Ticket speed code', 'Save ticket']);

    dragStep(0, list, 500); // to the end
    assert.deepEqual(steps(mb), ['Ticket speed code', 'Save ticket', 'Enter edit mode']);
    dragStep(2, list, 10); // above the first's middle
    assert.deepEqual(steps(mb), ['Enter edit mode', 'Ticket speed code', 'Save ticket']);
    // Dropped back on the blocks: taken out
    const li = list.querySelector('.mb-step[data-i="1"]');
    fire(li.querySelector('.mb-grip'), 'mousedown');
    fire(li, 'dragstart');
    fire(pal, 'dragover');
    assert.ok(pal.classList.contains('bin'));
    fire(pal, 'drop');
    fire(li, 'dragend');
    assert.deepEqual(steps(mb), ['Enter edit mode', 'Save ticket']);
    assert.ok(!pal.classList.contains('bin'));
    // Not by its boxes (their text can be selected), only its handle
    fire(list.querySelector('.mb-step[data-i="0"]'), 'dragstart');
    fire(list, 'dragover', 500);
    fire(list, 'drop', 500);
    assert.deepEqual(steps(mb), ['Enter edit mode', 'Save ticket']);
    // × takes one out too
    mb.querySelector('.mb-step[data-i="0"] [data-act=out]').click();
    assert.deepEqual(steps(mb), ['Save ticket']);
    assert.equal(doc.activeElement, mb.querySelector('.mb-step[data-i="0"] [data-act=out]'));
  } finally {
    close();
  }
});

test('the Macro builder asks before closing with unsaved changes; Esc closes it first, not what it was opened over', async () => {
  const { window, close } = load({ boot: true });
  try {
    const doc = window.document;
    const add = (await macrosTab(window)).querySelector('[data-macro=new]');
    add.click();
    let asked = 0, answer = false;
    window.confirm = () => { asked++; return answer; };
    // Nothing changed: closes without asking, focus back on New macro
    esc(window);
    assert.equal(doc.getElementById('atqm-mb'), null);
    assert.equal(asked, 0);
    assert.equal(doc.activeElement, add);

    add.click();
    type(window, doc.querySelector('#atqm-mb .mb-meta input'), 'Half done');
    esc(window);
    assert.equal(asked, 1);
    assert.ok(doc.getElementById('atqm-mb'), 'kept: you said no');
    button(doc.getElementById('atqm-mb'), /^Cancel$/).click();
    assert.equal(asked, 2);
    answer = true;
    esc(window);
    assert.equal(doc.getElementById('atqm-mb'), null);
    assert.deepEqual(stored(window), [], 'nothing kept');
  } finally {
    close();
  }
});

test("a ticket pop-up's Macros box has your on page macros and New macro; Edit in a macro's window changes it in the builder, and Delete deletes it", async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage });
  api.saveMacroDefs([
    { id: 'm1', v: 2, name: 'Password reset', about: 'Resets the password.', scope: 'page', blocks: [b('edit'), b('speedCode', { code: 'PWR', ask: true }), b('saveTicket')] },
    { id: 'm2', v: 2, name: 'Bulk close', scope: 'queue', blocks: [b('edit'), b('saveTicket')] },
  ]);
  const doc = window.document;
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  assert.deepEqual([...pill.querySelectorAll('.mc-sq')].map(s => s.dataset.macro), ['account', 'c:m1', 'new']);
  pill.querySelector('[data-macro="c:m1"]').click();
  const win = doc.getElementById('atqm-mcwin');
  assert.match(win.textContent, /Resets the password\./);
  assert.equal(doc.getElementById('atqm-mc-b1').value, 'PWR');
  button(win, /^Edit$/).click();
  assert.equal(doc.getElementById('atqm-mcwin'), null, 'its window gives way to the builder');

  const mb = doc.getElementById('atqm-mb');
  assert.match(mb.querySelector('.mb-head').textContent, /Changing Password reset · 3 steps/);
  assert.equal(mb.querySelector('.mb-meta input').value, 'Password reset');
  assert.equal(mb.querySelector('.mb-kind [aria-pressed=true]').textContent, 'On page');
  assert.ok(doc.getElementById('atqm-mb-1-code-ask').checked);
  assert.match(mb.querySelector('label[for=atqm-mb-1-code]').textContent, /Speed code, to start with/);
  const save = button(mb, /^Save macro$/);
  assert.ok(save.disabled, 'nothing changed yet');
  assert.equal(mb.querySelector('.mb-msg').textContent, 'No changes yet.');
  // Renamed, and it stops asking
  type(window, mb.querySelector('.mb-meta input'), 'Reset password');
  tick(window, doc.getElementById('atqm-mb-1-code-ask'));
  assert.equal(doc.activeElement.id, 'atqm-mb-1-code-ask', 'redrawn, focus kept');
  save.click();
  assert.deepEqual(plain(api.macroDefs()[0]), { id: 'm1', v: 2, name: 'Reset password', about: 'Resets the password.', scope: 'page',
    blocks: [{ type: 'edit' }, { type: 'speedCode', code: 'PWR' }, { type: 'saveTicket' }] });
  let sq = pill.querySelector('[data-macro="c:m1"]');
  assert.equal(sq.textContent, 'Reset passwordOn pageDouble-click to run');
  assert.equal(doc.activeElement, sq, 'back on its square');

  // Delete, from the builder
  sq.click(); // a keyboard press (no click count): straight to its window
  button(doc.getElementById('atqm-mcwin'), /^Edit$/).click();
  window.confirm = () => true;
  button(doc.getElementById('atqm-mb'), /^Delete macro$/).click();
  assert.equal(doc.getElementById('atqm-mb'), null);
  assert.deepEqual(plain(api.macroDefs().map(d => d.id)), ['m2']);
  assert.deepEqual([...pill.querySelectorAll('.mc-sq')].map(s => s.dataset.macro), ['account', 'new']);

  // New macro in the pop-up opens it too
  pill.querySelector('[data-macro=new]').click();
  assert.match(doc.querySelector('#atqm-mb .mb-head').textContent, /A new macro/);
  close();
});

test('boot: Settings lists your macros with Edit and Delete, and Tickets at once; New macro opens the Macro builder over it', async () => {
  const { window, close } = load({ boot: true, storage: { 'atqm:macros': [{ id: 'm1', v: 2, name: 'Password reset', blocks: [b('edit'), b('speedCode', { code: 'PWR' }), b('saveTicket')] }] } });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    const d = doc.getElementById('atqm-settings'), sec = d.querySelector('#atqm-set-macros');
    const rows = () => [...sec.querySelectorAll('.set-group .set-row')];
    assert.deepEqual(rows().map(r => r.querySelector('.set-label').textContent), ['Password resetQueue selection', 'Change account', 'Build a macro']);
    assert.equal(rows()[0].querySelector('.set-hint').textContent, 'Enter edit mode, then Ticket speed code PWR, then Save ticket');
    assert.match(rows()[1].textContent, /Built in/);
    // Tickets at once, under them, saved with Save changes
    const tabs = d.querySelector('#atqm-f-macroTabs');
    assert.equal(tabs.value, '5');
    type(window, tabs, '3');
    button(d, /^Save changes$/).click();
    assert.equal(JSON.parse(window.localStorage.getItem('atqm:settings')).macroTabs, 3);

    // Esc closes the builder, not Settings
    button(sec, /New macro/).click();
    assert.ok(doc.getElementById('atqm-mb'));
    assert.match(doc.querySelector('#atqm-mb .mb-kind').textContent, /up to 3 at once/);
    esc(window);
    assert.equal(doc.getElementById('atqm-mb'), null);
    assert.ok(doc.getElementById('atqm-settings'));

    // One built from here is listed, and kept straight away (not with Save changes)
    button(sec, /New macro/).click();
    const mb = doc.getElementById('atqm-mb');
    type(window, mb.querySelector('.mb-meta input'), 'Close as duplicate');
    block(mb, 'Enter edit mode').click();
    block(mb, 'Set a ticket field').click();
    type(window, doc.getElementById('atqm-mb-1-field'), 'Status');
    type(window, doc.getElementById('atqm-mb-1-value'), 'Complete');
    block(mb, 'Save ticket').click();
    button(mb, /^Save macro$/).click();
    assert.deepEqual(rows().map(r => r.querySelector('.set-label').textContent),
      ['Password resetQueue selection', 'Close as duplicateQueue selection', 'Change account', 'Build a macro']);
    assert.equal(d.querySelector('.set-msg').textContent, 'Saved Close as duplicate.');
    assert.equal(stored(window).length, 2);
    assert.equal(doc.activeElement, button(sec, /New macro/), 'back where it was opened from');

    // Find a setting finds them by name
    const find = d.querySelector('.set-find input');
    type(window, find, 'duplicate');
    assert.deepEqual([...d.querySelectorAll('.set-row[data-find]')].filter(r => !r.hidden && !r.closest('section').hidden)
      .map(r => r.querySelector('.set-label').textContent), ['Close as duplicateQueue selection']);
    type(window, find, '');

    // Edit opens it; Delete deletes it (after asking)
    button(rows()[0], /^Edit$/).click();
    assert.match(doc.querySelector('#atqm-mb .mb-head').textContent, /Changing Password reset/);
    esc(window);
    window.confirm = () => true;
    button(rows()[0], /^Delete$/).click();
    assert.deepEqual(stored(window).map(m => m.name), ['Close as duplicate']);
    assert.equal(d.querySelector('.set-msg').textContent, 'Deleted Password reset.');
  } finally {
    close();
  }
});

test('your macros go in Export; Import brings them back, checked, and a file without any leaves yours alone', async () => {
  const { api, window, close } = load();
  api.saveMacroDefs([{ id: 'm1', v: 2, name: 'Password reset', scope: 'page', blocks: [b('edit'), b('speedCode', { code: 'PWR' }), b('saveTicket')] }]);
  let blob = null;
  window.URL.createObjectURL = x => { blob = x; return 'blob:x'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {}; // no download in jsdom
  api.exportSettings();
  const file = JSON.parse(await new Promise(r => { const fr = new window.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blob); }));
  assert.deepEqual(file.macros, [{ id: 'm1', v: 2, name: 'Password reset', about: '', scope: 'page',
    blocks: [{ type: 'edit' }, { type: 'speedCode', code: 'PWR' }, { type: 'saveTicket' }] }]);

  const queues = [{ key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' }];
  const msg = api.importSettings(JSON.stringify({ app: 'atqm', queues, macros: [
    { id: 'm2', v: 2, name: 'New user', blocks: [b('edit'), b('speedCode', { code: 'NEWU' }), b('evil', { code: 'x' }), b('saveTicket')] }, { name: '' }, 'x'] }));
  assert.equal(msg, 'Imported settings, 1 tracked queue and 1 macro.');
  assert.deepEqual(plain(api.macroDefs()), [{ id: 'm2', v: 2, name: 'New user', about: '', scope: 'queue',
    blocks: [{ type: 'edit' }, { type: 'speedCode', code: 'NEWU' }, { type: 'saveTicket' }] }]);
  assert.equal(api.importSettings(JSON.stringify({ app: 'atqm', queues })), 'Imported settings and 1 tracked queue.');
  assert.equal(api.macroDefs().length, 1, 'a file from before macros could be built keeps yours');
  close();
});
