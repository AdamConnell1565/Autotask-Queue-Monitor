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
  const def = api.cleanMacroDef({ id: 'm1', name: '  Password   reset ', about: 5, blocks: [
    { type: 'speedCode', code: ' PWR ', ask: true, extra: 'x' },
    { type: 'runScript', code: 'alert(1)' },
    { type: 'wait', seconds: 600, ask: true },
    { type: 'onlyIf', field: 'Status', op: 'contains', value: 'New' },
    { type: 'setField', field: 'Work Type', value: 'Onsite', empty: 'yes' },
    null,
  ] });
  assert.deepEqual(plain(def), { id: 'm1', name: 'Password reset', about: '', blocks: [
    { type: 'speedCode', code: 'PWR', ask: true },
    { type: 'wait', seconds: 60 },
    { type: 'onlyIf', field: 'Status', op: 'is', value: 'New' },
    { type: 'setField', field: 'Work Type', value: 'Onsite', empty: false },
  ] });
  assert.equal(api.cleanMacroDef({ name: '  ', blocks: [] }), null, 'a name is needed');
  assert.equal(api.cleanMacroDef('x'), null);
  assert.match(api.cleanMacroDef({ id: 'not an id!', name: 'X' }).id, /^m[a-z0-9]+$/);
  // Storage holding something else is no macros at all; one stored without its id isn't ours
  api.set('atqm:macros', { not: 'a list' });
  assert.deepEqual(plain(api.macroDefs()), []);
  api.set('atqm:macros', [{ name: 'No id', blocks: [] }, { id: 'm2', name: 'Kept', blocks: [] }]);
  assert.deepEqual(plain(api.macroDefs().map(d => d.id)), ['m2']);
  close();
});

test('a macro presses Edit before the blocks for the edit page and Save after them; a Wait goes with the block before it', () => {
  const { api, close } = load();
  const b = (type, more) => ({ type, ...more });
  assert.deepEqual(plain(api.stepPages([b('wait'), b('onlyIf'), b('speedCode'), b('wait'), b('setField'), b('onlyIf'), b('wait')])),
    ['ticket', 'ticket', 'edit', 'edit', 'edit', 'ticket', 'ticket']);
  assert.deepEqual(plain(api.stepPages([b('wait'), b('speedCode')])), ['edit', 'edit'], 'first: with the one after');
  assert.deepEqual(plain(api.stepPages([b('wait')])), ['ticket']);

  // What it needs before it can be saved
  const problem = blocks => api.macroProblem({ name: 'X', blocks });
  assert.equal(api.macroProblem({ name: ' ', blocks: [] }), 'Give the macro a name.');
  assert.match(problem([]), /^Drag blocks into the list/);
  assert.match(problem([b('onlyIf', { field: 'Status', op: 'is', value: 'New' })]), /a block that changes the ticket/);
  assert.equal(problem([b('speedCode', { code: '' })]), 'Step 1, Speed code: Type the speed code.');
  assert.equal(problem([b('speedCode', { code: '', ask: true })]), '', 'asked each time, it can start empty');
  assert.equal(problem([b('onlyIf', { field: 'Status', op: 'empty', value: '' }), b('speedCode', { code: 'PWR' })]), '', 'is empty takes no value');
  assert.equal(problem([b('setField', { field: '', value: 'x' })]), 'Step 1, Set a field: Name the field to set, as Autotask labels it.');
  close();
});

test('a macro you build asks, in its window, for the values set to ask each time', () => {
  const { api, close } = load();
  const params = api.askedParams({ blocks: [
    { type: 'speedCode', code: 'PWR', ask: true }, { type: 'setField', field: 'Work Type', value: 'Remote Support', empty: true, ask: true },
    { type: 'speedCode', code: '', ask: true }, { type: 'onlyIf', field: 'Status', op: 'not', value: 'Complete', ask: true },
    { type: 'speedCode', code: 'NEWU' }, { type: 'wait', seconds: 3 },
  ] });
  assert.deepEqual(plain(params.map(p => [p.id, p.label, p.value])), [
    ['b0', 'Speed code (step 1)', 'PWR'], ['b1', 'Work Type, if empty', 'Remote Support'], ['b2', 'Speed code (step 3)', ''],
    ['b3', "Only if Status isn't", 'Complete']]);
  assert.equal(params[0].required, 'Fill in Speed code (step 1).');
  close();
});

test('boot: New macro in the Macros tab opens the Macro builder; blocks clicked in, moved and saved become a square', async () => {
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
    // The blocks, by the page they work on
    assert.deepEqual([...mb.querySelectorAll('.mb-pal .mb-grp, .mb-pal .mb-blk b')].map(e => e.textContent),
      ["On the ticket's page", 'Only if', 'On the edit page', 'Speed code', 'Set a field', 'On either page', 'Wait']);
    type(window, name, 'Password reset');
    assert.match(msg(), /^Drag blocks into the list/);
    assert.match(mb.querySelector('.mb-empty').textContent, /Drag blocks here/);

    // A block clicked: added at the end, its box ready to type in
    assert.equal(block(mb, 'Speed code').getAttribute('role'), 'button');
    block(mb, 'Speed code').click();
    assert.deepEqual(lines(mb), ['(Opens the ticket)', '(Presses Edit)', 'Speed code', '(Presses Save)']);
    assert.equal(doc.activeElement.id, 'atqm-mb-0-code');
    assert.equal(msg(), 'Step 1, Speed code: Type the speed code.');
    type(window, doc.activeElement, 'PWR');
    // Or Enter on it
    block(mb, 'Only if').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(lines(mb), ['(Opens the ticket)', '(Presses Edit)', 'Speed code', '(Presses Save)', 'Only if']);
    assert.equal(doc.getElementById('atqm-mb-1-field').value, 'Status', 'starts on Status');
    type(window, doc.getElementById('atqm-mb-1-value'), 'New, In Progress');
    // "is empty" takes no value: its box goes, and comes back
    const op = doc.getElementById('atqm-mb-1-op');
    op.value = 'empty';
    op.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.getElementById('atqm-mb-1-value'), null);
    assert.equal(doc.activeElement.id, 'atqm-mb-1-op', 'redrawn, focus kept');
    doc.getElementById('atqm-mb-1-op').value = 'is';
    doc.getElementById('atqm-mb-1-op').dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.getElementById('atqm-mb-1-value').value, 'New, In Progress');

    // Moved up with its arrow, it's checked before editing
    mb.querySelector('.mb-step[data-i="1"] [data-act=up]').click();
    assert.deepEqual(lines(mb), ['(Opens the ticket)', 'Only if', '(Presses Edit)', 'Speed code', '(Presses Save)']);
    assert.equal(doc.activeElement, mb.querySelector('.mb-step[data-i="0"] [data-act=down]'), 'at the top: on its other arrow');
    assert.equal(doc.getElementById('atqm-mb-0-value').value, 'New, In Progress', 'its values went with it');
    assert.match(mb.querySelector('.mb-head').textContent, /A new macro · 2 steps/);
    assert.equal(save.disabled, false);
    assert.equal(msg(), 'Ready to save: it goes in the Macros tab as Password reset.');

    save.click();
    assert.equal(doc.getElementById('atqm-mb'), null);
    const [def] = stored(window);
    assert.deepEqual({ ...def, id: 'x' }, { id: 'x', name: 'Password reset', about: '', blocks: [
      { type: 'onlyIf', field: 'Status', op: 'is', value: 'New, In Progress' }, { type: 'speedCode', code: 'PWR' }] });
    // Its square: after Change account, before New macro, with focus on it
    const squares = [...panel.querySelectorAll('.mc-grid .mc-sq')];
    assert.deepEqual(squares.map(s => s.dataset.macro), ['account', 'c:' + def.id, 'new']);
    assert.match(squares[1].textContent, /^Password resetDouble-click to run$/, 'it asks nothing: a double-click runs it');
    assert.equal(squares[1].title, 'Only if Status is New, In Progress, then Speed code PWR');
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
      const b = block(mb, name);
      fire(b, 'dragstart');
      layout();
      fire(list, 'dragover', y);
      const shown = list.querySelector('.mb-drop');
      fire(list, 'drop', y);
      fire(b, 'dragend');
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

    dragIn('Speed code', 0);
    dragIn('Set a field', 100); // below the last step: at the end
    const shown = dragIn('Only if', 10); // above the first step's middle: before it
    assert.ok(shown, 'a line shows where it goes while it is dragged');
    assert.equal(list.querySelector('.mb-drop'), null, 'and goes once it is dropped');
    assert.deepEqual(steps(mb), ['Only if', 'Speed code', 'Set a field']);

    dragStep(0, list, 500); // to the end
    assert.deepEqual(steps(mb), ['Speed code', 'Set a field', 'Only if']);
    dragStep(2, list, 60); // above the second's middle
    assert.deepEqual(steps(mb), ['Speed code', 'Only if', 'Set a field']);
    // Dropped back on the blocks: taken out
    const li = list.querySelector('.mb-step[data-i="1"]');
    fire(li.querySelector('.mb-grip'), 'mousedown');
    fire(li, 'dragstart');
    fire(pal, 'dragover');
    assert.ok(pal.classList.contains('bin'));
    fire(pal, 'drop');
    fire(li, 'dragend');
    assert.deepEqual(steps(mb), ['Speed code', 'Set a field']);
    assert.ok(!pal.classList.contains('bin'));
    // Not by its boxes (their text can be selected), only its handle
    fire(list.querySelector('.mb-step[data-i="0"]'), 'dragstart');
    fire(list, 'dragover', 500);
    fire(list, 'drop', 500);
    assert.deepEqual(steps(mb), ['Speed code', 'Set a field']);
    // × takes one out too
    mb.querySelector('.mb-step[data-i="0"] [data-act=out]').click();
    assert.deepEqual(steps(mb), ['Set a field']);
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

test("a ticket pop-up's Macros box has your macros and New macro; Edit in a macro's window changes it in the builder, and Delete deletes it", async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage });
  api.saveMacroDefs([{ id: 'm1', name: 'Password reset', about: 'Resets the password.', blocks: [{ type: 'speedCode', code: 'PWR', ask: true }] }]);
  const doc = window.document;
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  assert.deepEqual([...pill.querySelectorAll('.mc-sq')].map(s => s.dataset.macro), ['account', 'c:m1', 'new']);
  pill.querySelector('[data-macro="c:m1"]').click();
  const win = doc.getElementById('atqm-mcwin');
  assert.match(win.textContent, /Resets the password\./);
  assert.equal(doc.getElementById('atqm-mc-b0').value, 'PWR');
  button(win, /^Edit$/).click();
  assert.equal(doc.getElementById('atqm-mcwin'), null, 'its window gives way to the builder');

  const mb = doc.getElementById('atqm-mb');
  assert.match(mb.querySelector('.mb-head').textContent, /Changing Password reset · 1 step/);
  assert.equal(mb.querySelector('.mb-meta input').value, 'Password reset');
  assert.ok(doc.getElementById('atqm-mb-0-code-ask').checked);
  assert.match(mb.querySelector('label[for=atqm-mb-0-code]').textContent, /Speed code, to start with/);
  const save = button(mb, /^Save macro$/);
  assert.ok(save.disabled, 'nothing changed yet');
  assert.equal(mb.querySelector('.mb-msg').textContent, 'No changes yet.');
  // Renamed, and it stops asking
  type(window, mb.querySelector('.mb-meta input'), 'Reset password');
  tick(window, doc.getElementById('atqm-mb-0-code-ask'));
  assert.equal(doc.activeElement.id, 'atqm-mb-0-code-ask', 'redrawn, focus kept');
  save.click();
  assert.deepEqual(plain(api.macroDefs()), [{ id: 'm1', name: 'Reset password', about: 'Resets the password.', blocks: [{ type: 'speedCode', code: 'PWR' }] }]);
  let sq = pill.querySelector('[data-macro="c:m1"]');
  assert.equal(sq.textContent, 'Reset passwordDouble-click to run');
  assert.equal(doc.activeElement, sq, 'back on its square');

  // Delete, from the builder
  sq.click(); // a keyboard press (no click count): straight to its window
  button(doc.getElementById('atqm-mcwin'), /^Edit$/).click();
  window.confirm = () => true;
  button(doc.getElementById('atqm-mb'), /^Delete macro$/).click();
  assert.equal(doc.getElementById('atqm-mb'), null);
  assert.deepEqual(plain(api.macroDefs()), []);
  assert.deepEqual([...pill.querySelectorAll('.mc-sq')].map(s => s.dataset.macro), ['account', 'new']);

  // New macro in the pop-up opens it too
  pill.querySelector('[data-macro=new]').click();
  assert.match(doc.querySelector('#atqm-mb .mb-head').textContent, /A new macro/);
  close();
});

test('boot: Settings lists your macros with Edit and Delete; New macro opens the Macro builder over it', async () => {
  const { window, close } = load({ boot: true, storage: { 'atqm:macros': [{ id: 'm1', name: 'Password reset', blocks: [{ type: 'speedCode', code: 'PWR' }] }] } });
  try {
    const doc = window.document;
    await sleep(200);
    doc.getElementById('atqm-setbtn').click();
    const d = doc.getElementById('atqm-settings'), sec = d.querySelector('#atqm-set-macros');
    const rows = () => [...sec.querySelectorAll('.set-row')];
    assert.deepEqual(rows().map(r => r.querySelector('.set-label').textContent), ['Password reset', 'Change account', 'Build a macro']);
    assert.equal(rows()[0].querySelector('.set-hint').textContent, 'Speed code PWR');
    assert.match(rows()[1].textContent, /Built in/);

    // Esc closes the builder, not Settings
    button(sec, /New macro/).click();
    assert.ok(doc.getElementById('atqm-mb'));
    esc(window);
    assert.equal(doc.getElementById('atqm-mb'), null);
    assert.ok(doc.getElementById('atqm-settings'));

    // One built from here is listed, and kept straight away (not with Save changes)
    button(sec, /New macro/).click();
    const mb = doc.getElementById('atqm-mb');
    type(window, mb.querySelector('.mb-meta input'), 'Close as duplicate');
    block(mb, 'Set a field').click();
    type(window, doc.getElementById('atqm-mb-0-field'), 'Status');
    type(window, doc.getElementById('atqm-mb-0-value'), 'Complete');
    button(mb, /^Save macro$/).click();
    assert.deepEqual(rows().map(r => r.querySelector('.set-label').textContent), ['Password reset', 'Close as duplicate', 'Change account', 'Build a macro']);
    assert.equal(d.querySelector('.set-msg').textContent, 'Saved Close as duplicate.');
    assert.equal(stored(window).length, 2);
    assert.equal(doc.activeElement, button(sec, /New macro/), 'back where it was opened from');

    // Find a setting finds them by name
    const find = d.querySelector('.set-find input');
    type(window, find, 'duplicate');
    assert.deepEqual([...d.querySelectorAll('.set-row[data-find]')].filter(r => !r.hidden && !r.closest('section').hidden)
      .map(r => r.querySelector('.set-label').textContent), ['Close as duplicate']);
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
  api.saveMacroDefs([{ id: 'm1', name: 'Password reset', blocks: [{ type: 'speedCode', code: 'PWR' }] }]);
  let blob = null;
  window.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {}; // no download in jsdom
  api.exportSettings();
  const file = JSON.parse(await new Promise(r => { const fr = new window.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blob); }));
  assert.deepEqual(file.macros, [{ id: 'm1', name: 'Password reset', about: '', blocks: [{ type: 'speedCode', code: 'PWR' }] }]);

  const queues = [{ key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' }];
  const msg = api.importSettings(JSON.stringify({ app: 'atqm', queues, macros: [
    { id: 'm2', name: 'New user', blocks: [{ type: 'speedCode', code: 'NEWU' }, { type: 'evil', code: 'x' }] }, { name: '' }, 'x'] }));
  assert.equal(msg, 'Imported settings, 1 tracked queue and 1 macro.');
  assert.deepEqual(plain(api.macroDefs()), [{ id: 'm2', name: 'New user', about: '', blocks: [{ type: 'speedCode', code: 'NEWU' }] }]);
  assert.equal(api.importSettings(JSON.stringify({ app: 'atqm', queues })), 'Imported settings and 1 tracked queue.');
  assert.equal(api.macroDefs().length, 1, 'a file from before macros could be built keeps yours');
  close();
});
