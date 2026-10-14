'use strict';
// Macros built in the Macro builder, their blocks run on Autotask's pages (built as tests/pages.js builds them)
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { ticketPage, realEditPage, editorLabel, itemPicker, dataPicker, section, autotaskPickers, activityToolbar } = require('./pages');

const NOW = Date.UTC(2026, 9, 7, 12, 0);
const A = 'T20261007.0081', B = 'T20261007.0082';
const plain = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
const fast = api => Object.assign(api.MACRO, { settle: 0, pick: 300, retype: 0, confirm: 300, saved: 500, find: 300 });
const item = api => plain(api.macroJob().items[0]);

// The blocks
const statusIs = value => ({ type: 'onlyIf', field: 'Status', op: 'is', value });
const EDIT = { type: 'edit' }, SAVE = { type: 'saveTicket' }, NEW_TIME = { type: 'newTime' }, SAVE_TIME = { type: 'saveAndTime' };
const SAVE_ENTRY = { type: 'saveEntry' };
const PWR = { type: 'speedCode', code: 'PWR' };
const set = (field, value, empty = false) => ({ type: 'setField', field, value, empty });

// A job for a built macro part-way through, as a macro tab finds it (navAt: a moment before this page loaded)
const job = (state, steps, more = {}) => ({
  'atqm:macro': { id: 'job8', kind: 'custom', v: 2, macro: 'm1', name: 'Password reset', scope: 'queue', steps, by: 'elsewhere', ts: NOW, tabs: 5,
    items: [{ id: A, tid: '111', state, at: NOW, note: '', ...more }, { id: B, tid: null, state: 'waiting', note: '' }] },
});
const tab = { name: 'atqm_macro:' + A }; // the macro tab doing A

// The speed code box's list (closed), as a time entry's was captured: its "Enter Speed Code or Choose Template" line,
// then under each heading (a .GroupHeader, not an .Item) a line per speed code, "code - template name". A speed code
// can be under more than one heading. groups: [[heading, [[code, name]…]]…]
const codeList = groups => '<div class="ContextOverlayContainer" id="codes" style="display:none"><div class="ContextOverlay SingleItemSelectorDropDownOverlay">' +
  '<div class="Content"><div class="ItemSet"><div class="ItemList">' +
  '<div class="Item" data-item-type="Default" data-index="0"><div class="Text"><span>Enter Speed Code or Choose Template</span></div></div>' +
  groups.map(([head, codes]) => `<div class="GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">${head}</div></div>` +
    codes.map(([c, n]) => `<div class="Item" data-item-type="SingleText"><div class="Text"><span>${c} - ${n}</span></div></div>`).join('')).join('') +
  '</div></div></div></div></div>';
const TICKET_CODES = [['Company', [['PWR', 'Password reset'], ['PWRX', 'Password reset (external)'], ['NEWU', 'New user']]]];
// The edit page with the speed code box's list, a Status, a Purchase Order Number (a plain box) and the Save & ... menu
// (hidden until its button is pressed: Save & Enter Time, Save & Add Note)
const editPage = opts => realEditPage(opts)
  .replace('Choose Template</span></div></div></div></div>', 'Choose Template</span></div></div></div></div>' + codeList(TICKET_CODES))
  .replace('<div class="Button2"><div class="Text2">Cancel</div></div>', '<div class="Button2" id="cancel"><div class="Text2">Cancel</div></div>' +
    '<div class="DropDownButton2 Combined" id="saveand"><div class="Button2" id="saveand-open"><div class="Text2">Save &amp; ...</div></div>' +
    '<div class="ContextOverlayContainer" style="display:none"><div class="ContextOverlay"><div class="Button2" id="saveandtime"><div class="Text2">Save &amp; Enter Time</div></div>' +
    '<div class="Button2"><div class="Text2">Save &amp; Add Note</div></div></div></div></div>')
  .replace(editorLabel('Contact') + dataPicker('con', 'Jane Doe'), editorLabel('Contact') + dataPicker('con', 'Jane Doe') +
    editorLabel('Status') + itemPicker('status', 'New', ['New', 'In Progress', 'Complete']) +
    editorLabel('Purchase Order Number') + '<div class="Size1"><input type="text" class="TextBox2" maxlength="50" id="po"></div>');
// A time entry as Autotask builds it (a dialog; captured October 2026, placeholders throughout, see docs/autotask-pages.md):
// its title bar ("New Ticket Time Entry", and ✕: there's no Cancel button), its toolbar (Save & Close, Save & New,
// Save & Forward/Modify, and its speed code box), the ticket it's for, then its sections: Ticket Status (the ticket's
// Status), Billing (Role, Work Type) and Time Entry Details (Date and Start Time, each a plain box in a DateBox2 or
// TimeBox2 <div>). Hours Worked and the notes boxes weren't in the capture: they're built as the edit page's fields.
const TIME_CODES = [['Recently Used', [['PWR-100', 'Password reset']]], ['Department', [['PWR-100', 'Password reset'], ['T30', 'Thirty minutes remote']]]];
const timeDialog = ({ ticket = A, summary = '', internal = 'Called the customer.' } = {}) =>
  '<div class="VerticalContainer" id="tdialog"><div class="Header"><div class="TitleBar1"><div class="Title"><span class="Text">New Ticket Time Entry</span></div>' +
  '<div class="DialogTitleBarButton"><div class="DialogTitleBarIcon Help"></div></div><div class="DialogTitleBarButton"><div class="DialogTitleBarIcon PopOut"></div></div>' +
  '<div class="DialogTitleBarButton"><div class="DialogTitleBarIcon Minimize"></div></div>' +
  '<div class="DialogTitleBarButton" id="tclose"><div class="DialogTitleBarIcon Close"></div></div></div>' +
  '<div class="ToolBar"><div class="ToolBarItem Left"><div class="Button2" id="tsave"><div class="Text2">Save &amp; Close</div></div></div>' +
  '<div class="ToolBarItem Left"><div class="Button2"><div class="Text2">Save &amp; New</div></div></div>' +
  '<div class="ToolBarItem Left"><div class="Button2"><div class="Text2">Save &amp; Forward/Modify</div></div></div>' +
  '<div class="ToolBarItem FormTemplateSelector Right"><div class="FormTemplateSelector"><div class="SingleItemSelector2"><div class="ContentContainer"><div class="ValueContainer">' +
  '<div class="TargetPreview">Enter Speed Code or Choose Template</div><div class="SearchBox"><input type="text"></div>' +
  '<div class="SelectionDisplay"><div class="Item" data-item-type="Default"><div class="Text"><span>Enter Speed Code or Choose Template</span></div></div></div></div>' +
  '<div class="Triangle"><div class="InlineIcon Carrot"></div></div></div>' + codeList(TIME_CODES) + '</div></div></div></div></div>' +
  '<div class="Body"><div class="IdentificationContainer ReadOnly"><div class="Left"><div class="IdentificationTextContainer">' +
  `<div class="IdentificationText">${ticket}</div></div><div class="Title"><div class="Text">Laptop (Fabrikam Ltd)</div></div></div></div>` +
  section('tstatus', 'Ticket Status', editorLabel('Status') + itemPicker('tstatus-p', 'In Progress', ['New', 'In Progress', 'Complete'])) +
  section('tbilling', 'Billing', editorLabel('Role') + itemPicker('role', 'Technical', ['Technical', 'Engineer']) +
    editorLabel('Work Type') + dataPicker('twork', 'Remote Support', { all: ['Remote Support', 'Onsite Support'], bundle: false })) +
  section('tdetails', 'Time Entry Details', editorLabel('Date') + '<div class="Size3"><div class="DateBox2"><input type="text" id="tdate" value="01/01/2026"></div></div>' +
    editorLabel('Start Time') + '<div class="Size3"><div class="TimeBox2"><input type="text" id="tstart" value="09:00"></div></div>' +
    editorLabel('Hours Worked') + '<div class="Size2"><input type="text" class="DecimalBox2" id="hours"></div>' +
    editorLabel('Summary Notes') + `<div class="Size1"><textarea id="summary">${summary}</textarea></div>` +
    editorLabel('Internal Notes') + `<div class="Size1"><textarea id="internal">${internal}</textarea></div>`) +
  '</div></div>';
const timePage = opts => '<!doctype html><body>' + timeDialog(opts) + '</body>';
// The ticket page with its activity toolbar as captured (New Time Entry, New Note, New Attachment, Refresh), and a note
// type list in its Quick note. toolbar: another toolbar ('' for none yet)
const ticketWithMore = (opts = {}) => ticketPage(A, 'Fabrikam Ltd', opts)
  .replace('<div class="QuickNote">', (opts.toolbar ?? activityToolbar()) + '<div class="QuickNote">')
  .replace('<textarea placeholder="Add a note..."></textarea>', '<textarea placeholder="Add a note..."></textarea>' +
    '<select class="DropDownList2"><option value="1">Task Detail</option><option value="2">Internal Note</option></select>');
// The Quick note as it behaves: its Save comes on once something's typed; saved, the box empties and Save goes grey
// again. Returns the notes saved, [text, note type].
function quickNotes(doc) {
  const box = doc.querySelector('.QuickNote'), area = box.querySelector('textarea');
  const save = [...box.querySelectorAll('.Button2')].find(b => b.textContent === 'Save');
  area.addEventListener('input', () => save.classList.toggle('Disabled2', !area.value));
  const notes = [];
  save.addEventListener('click', () => { notes.push([area.value, box.querySelector('select').value]); area.value = ''; save.classList.add('Disabled2'); });
  return notes;
}

// How the speed code box behaves: typing opens its list; picking a line closes it and applies its template (apply).
// Returns what was typed into it.
function speedCodes(doc, apply = () => {}) {
  const input = doc.querySelector('.FormTemplateSelector input'), list = doc.getElementById('codes'), typed = [];
  input.addEventListener('input', () => { if (input.value) typed.push(input.value); list.style.display = input.value ? '' : 'none'; });
  for (const line of list.querySelectorAll('.Item[data-item-type=SingleText]')) {
    line.addEventListener('click', () => { list.style.display = 'none'; input.value = ''; apply(line.textContent); });
  }
  return typed;
}
// A button that leads away: pressing it takes this page away (as loading another would), and says which was pressed
const leadsAway = (doc, ids) => {
  const pressed = [];
  for (const id of ids) doc.getElementById(id)?.addEventListener('click', () => { pressed.push(id); doc.getElementById(id).remove(); });
  return pressed;
};

test("on the ticket's page: its Only if is checked, then Enter edit mode presses Edit, where it's up to kept first", async () => {
  const run = async (opts, steps = [statusIs('New, In Progress'), EDIT, PWR, SAVE]) => {
    const env = load({ now: NOW, ...tab, html: ticketWithMore(opts), storage: job('open', steps) });
    fast(env.api);
    let edits = 0;
    env.window.document.getElementById('edit').addEventListener('click', () => edits++);
    await env.api.macroWork();
    const out = { item: item(env.api), edits, bar: env.window.document.getElementById('atqm-macrobar')?.textContent };
    env.close();
    return out;
  };
  let r = await run({ status: 'In Progress' });
  assert.deepEqual([r.item.state, r.item.step, r.item.navAt, r.item.doing, r.edits], ['run', 2, NOW, null, 1]);
  assert.match(r.bar, /running Password reset on T20261007\.0081, step 1 of 4: Only if \(ticket 1 of 2\)\. Leave this tab alone/);
  r = await run({ status: 'Waiting Customer' });
  assert.deepEqual([r.item.state, r.item.note, r.edits], ['skipped', 'Status is Waiting Customer', 0]);
  r = await run({ status: 'Complete' }, [{ type: 'onlyIf', field: 'Status', op: 'not', value: 'Complete, Cancelled' }, EDIT, PWR, SAVE]);
  assert.deepEqual([r.item.state, r.edits], ['skipped', 0]);
  r = await run({ status: 'New' }, [{ type: 'onlyIf', field: 'Work Type', op: 'empty', value: '' }, EDIT, PWR, SAVE]);
  assert.deepEqual([r.item.state, r.item.note], ['skipped', 'Work Type is Remote Support']);
  // No Status on this ticket's page: it can't be checked, so the ticket fails rather than being changed
  r = await run({});
  assert.deepEqual([r.item.state, r.item.note, r.edits], ['failed', "Couldn't find the Status field on the ticket's page", 0]);
  // A step for the edit page isn't done on the ticket's page
  const wrong = load({ now: NOW, ...tab, html: ticketWithMore({ status: 'New' }), storage: job('run', [EDIT, PWR, SAVE], { step: 1 }) });
  fast(wrong.api);
  await wrong.api.macroWork();
  assert.deepEqual([item(wrong.api).state, item(wrong.api).step], ['run', 1], 'waits for the edit page');
  wrong.close();
});

test("an Only if's lines: the Account, the Ticket Category in the heading, and goes before or; a field it can't find fails the ticket", async () => {
  const run = async (opts, conds) => {
    const env = load({ now: NOW, ...tab, html: ticketWithMore(opts), storage: job('open', [{ type: 'onlyIf', conds }, EDIT, PWR, SAVE]) });
    fast(env.api);
    await env.api.macroWork();
    const it = item(env.api);
    env.close();
    return [it.state, it.note];
  };
  const fabrikam = { field: 'Account', op: 'is', value: 'Contoso, Fabrikam Ltd' }, isNew = { join: 'and', field: 'Status', op: 'is', value: 'New' };
  const standard = { join: 'or', field: 'Ticket Category', op: 'is', value: 'Standard' };
  // Account and Status both match
  assert.deepEqual(await run({ status: 'New' }, [fabrikam, isNew]), ['run', '']);
  // Only one does: skipped, with what both showed
  assert.deepEqual(await run({ status: 'Complete' }, [fabrikam, isNew]), ['skipped', 'Account is Fabrikam Ltd, Status is Complete']);
  // (Account and Status), or Ticket Category: the category alone is enough
  assert.deepEqual(await run({ status: 'Complete', category: 'Standard' }, [fabrikam, isNew, standard]), ['run', '']);
  assert.deepEqual(await run({ status: 'Complete', category: 'Project' }, [fabrikam, isNew, standard]),
    ['skipped', 'Account is Fabrikam Ltd, Status is Complete, Ticket Category is Project']);
  // Ticket Category, or (Account and Status): and still goes first, wherever it is
  assert.deepEqual(await run({ status: 'New', category: 'Project' }, [{ ...standard, join: undefined }, { ...fabrikam, join: 'or' }, isNew]), ['run', '']);
  // The Ticket Type, in the heading too
  assert.deepEqual(await run({ status: 'New', category: 'Standard' }, [{ field: 'Ticket Type', op: 'not', value: 'Incident' }]), ['skipped', 'Ticket Type is Incident']);
  // No heading on this page: the category can't be checked, whatever the other lines say
  assert.deepEqual(await run({ status: 'New' }, [fabrikam, isNew, standard]), ['failed', "Couldn't find the Ticket Category field on the ticket's page"]);
});

test("Enter edit mode reads a field only filled in where it's empty off the ticket's page first; the edit page then leaves it alone", async () => {
  const steps = [EDIT, set('Work Type', 'Onsite', true), SAVE];
  const open = load({ now: NOW, ...tab, html: ticketPage(A, 'Fabrikam Ltd'), storage: job('open', steps) });
  fast(open.api);
  await open.api.macroWork();
  const it = item(open.api);
  assert.deepEqual([it.state, it.step, it.had], ['run', 1, { 1: 'Remote Support' }]);
  open.close();

  // The edit page shows no Work Type (its picker shows it somewhere not recognised): left alone all the same
  const edit = load({ now: NOW, ...tab, html: editPage({ workType: '' }), storage: job('run', steps, { ...it, navAt: NOW - 1000 }) });
  fast(edit.api);
  const doc = edit.window.document;
  autotaskPickers(doc);
  let typed = 0;
  doc.querySelector('#work input').addEventListener('input', () => typed++);
  const pressed = leadsAway(doc, ['save', 'saveclose']);
  await edit.api.macroWork();
  assert.equal(typed, 0);
  assert.deepEqual(pressed, ['save'], 'plain Save: Save & Close would go on to close the ticket');
  assert.deepEqual(plain([item(edit.api).step, item(edit.api).kept, item(edit.api).did]), [3, ['Work Type'], ['Saved the ticket']]);
  edit.close();
});

test('in edit mode: a ticket speed code picked from the speed code box, fields set, then Save; what it set is checked back on the ticket', async () => {
  const steps = [EDIT, PWR, set('Status', 'In Progress'), set('Purchase Order Number', 'PO-1'), set('Work Type', 'Onsite', true), SAVE, statusIs('In Progress')];
  const { api, window, close } = load({ now: NOW, ...tab, html: editPage(), storage: job('run', steps, { step: 1, navAt: NOW - 1000 }) });
  fast(api);
  const doc = window.document;
  autotaskPickers(doc);
  // Its template fills in a Sub-Issue Type
  const applied = [];
  const typed = speedCodes(doc, line => {
    applied.push(line);
    doc.querySelector('#sub .SelectionDisplay').innerHTML = '<div class="Item" data-item-type="SingleText"><div class="Text"><span>Hardware</span></div></div>';
  });
  const pressed = leadsAway(doc, ['save', 'saveclose']);
  await api.macroWork();
  assert.deepEqual(typed, ['PWR']);
  assert.deepEqual(applied, ['PWR - Password reset'], "the line for that code, not PWRX's");
  assert.equal(doc.querySelector('#status .SelectionDisplay').textContent, 'In Progress', 'from its own list');
  assert.equal(doc.getElementById('po').value, 'PO-1', 'typed into the plain box');
  assert.equal(doc.querySelector('#work .Chip').textContent, 'Remote Support', 'kept: it has one');
  assert.deepEqual(pressed, ['save']);
  const it = item(api);
  assert.deepEqual([it.state, it.step, it.did, it.kept, it.verify, it.picks],
    ['run', 6, ['Ticket speed code PWR', 'Status: In Progress', 'Purchase Order Number: PO-1', 'Saved the ticket'], ['Work Type'],
      { 2: 'In Progress', 3: 'PO-1' }, {}]);
  close();

  // Back on the ticket's page: it shows the Status it set, so on with the Only if, and done
  const back = load({ now: NOW, ...tab, html: ticketPage(A, 'Fabrikam Ltd', { status: 'In Progress' }), storage: job('run', steps, { ...it, verify: { 2: 'In Progress' } }) });
  fast(back.api);
  await back.api.macroWork();
  assert.deepEqual(plain([item(back.api).state, item(back.api).note]), ['done', '']);
  back.close();
  // It shows something else: Check it
  const off = load({ now: NOW, ...tab, html: ticketPage(A, 'Fabrikam Ltd', { status: 'New' }), storage: job('run', steps, { ...it, verify: { 2: 'In Progress' } }) });
  fast(off.api);
  await off.api.macroWork();
  assert.deepEqual(plain([item(off.api).state, item(off.api).note]), ['check', 'Saved, but Status shows "New" instead of In Progress']);
  off.close();
});

test("Save ticket & enter time opens the edit page's Save & ... menu for it; the time entry then does its blocks and Save time entry", async () => {
  const steps = [EDIT, set('Status', 'In Progress'), SAVE_TIME, { type: 'timeCode', code: 'T30' }, { type: 'hours', hours: '0.5' },
    { type: 'timeField', field: 'Role', value: 'Engineer', empty: false }, { type: 'summary', text: 'Reset the password.', mode: 'replace' },
    { type: 'internal', text: 'Rang back.', mode: 'add' }, SAVE_ENTRY];
  const edit = load({ now: NOW, ...tab, html: editPage(), storage: job('run', steps, { step: 1, navAt: NOW - 1000 }) });
  fast(edit.api);
  const d1 = edit.window.document;
  autotaskPickers(d1);
  d1.getElementById('saveand-open').addEventListener('click', () => { d1.querySelector('#saveand .ContextOverlayContainer').style.display = ''; });
  const pressed = leadsAway(d1, ['save', 'saveclose', 'saveandtime']);
  await edit.api.macroWork();
  assert.deepEqual(pressed, ['saveandtime'], 'from its menu, opened for it');
  const it = item(edit.api);
  assert.deepEqual([it.step, it.verify, it.did], [3, null, ['Status: In Progress', 'Saved the ticket']], "nothing to check: it's off to a time entry");
  edit.close();

  const time = load({ now: NOW, ...tab, html: timePage(), storage: job('run', steps, { ...it, navAt: NOW - 1000 }) });
  fast(time.api);
  const d2 = time.window.document;
  assert.equal(time.api.pageKind(item(time.api)), 'time');
  autotaskPickers(d2);
  const typed = speedCodes(d2);
  const saved = leadsAway(d2, ['tsave']);
  await time.api.macroWork();
  assert.deepEqual(typed, ['T30']);
  assert.equal(d2.getElementById('hours').value, '0.5');
  assert.equal(d2.querySelector('#role .SelectionDisplay').textContent, 'Engineer');
  assert.equal(d2.getElementById('summary').value, 'Reset the password.');
  assert.equal(d2.getElementById('internal').value, 'Called the customer.\nRang back.', 'after what was there');
  assert.deepEqual(saved, ['tsave'], 'Save & Close: saves it, back to the ticket');
  assert.deepEqual(plain([item(time.api).step, item(time.api).did.slice(2)]), [9,
    ['Time entry speed code T30', 'Hours Worked: 0.5', 'Role: Engineer', 'Summary Notes', 'Internal Notes', 'Saved a time entry']]);
  time.close();
});

test("New time entry presses the ticket page's button; a time entry in a window of its own does the rest, the ticket's page waits", async () => {
  const steps = [NEW_TIME, { type: 'hours', hours: '1' }, SAVE_ENTRY];
  const { api, window, close } = load({ now: NOW, ...tab, html: ticketWithMore(), storage: job('open', steps) });
  fast(api);
  const doc = window.document;
  window.open = () => ({ closed: false }); // Autotask opens the time entry in a window of its own
  doc.getElementById('newtime').addEventListener('click', () => window.open('https://ww5.autotask.net/time', '_blank'));
  await api.macroWork();
  assert.deepEqual(plain([item(api).state, item(api).step, item(api).navAt]), ['run', 1, NOW], 'this page is from before it now');
  await api.macroWork();
  assert.equal(item(api).step, 1, 'and waits');
  close();

  // Without a New Time Entry button: says so
  const none = load({ now: NOW, ...tab, html: ticketPage(A, 'Fabrikam Ltd'), storage: job('open', steps) });
  fast(none.api);
  await none.api.macroWork();
  assert.deepEqual(plain([item(none.api).state, item(none.api).note]), ['failed', "Couldn't find New Time Entry on the ticket's page"]);
  none.close();
});

test("Quick note writes in the ticket page's Quick note, picks its note type and saves it, in place", async () => {
  const steps = [{ type: 'quickNote', text: 'Rang the customer.', noteType: 'Internal Note' }];
  const { api, window, close } = load({ now: NOW, ...tab, html: ticketWithMore(), storage: job('open', steps) });
  fast(api);
  const doc = window.document, box = doc.querySelector('.QuickNote'), area = box.querySelector('textarea');
  const save = [...box.querySelectorAll('.Button2')].find(b => b.textContent === 'Save');
  // Its Save comes on once something's typed; saved, the box empties and Save goes grey again
  area.addEventListener('input', () => save.classList.toggle('Disabled2', !area.value));
  const notes = [];
  save.addEventListener('click', () => { notes.push([area.value, box.querySelector('select').value]); area.value = ''; save.classList.add('Disabled2'); });
  await api.macroWork();
  assert.deepEqual(notes, [['Rang the customer.', '2']]);
  assert.deepEqual(plain([item(api).state, item(api).did, item(api).navAt]), ['done', ['Quick note'], null]);
  close();

  const typeless = load({ now: NOW, ...tab, html: ticketWithMore(), storage: job('open', [{ ...steps[0], noteType: 'Client Portal' }]) });
  fast(typeless.api);
  await typeless.api.macroWork();
  assert.deepEqual(plain([item(typeless.api).state, item(typeless.api).note]), ['failed', 'The Quick note has no note type called "Client Portal"']);
  typeless.close();
});

test("what fails a ticket: a speed code Autotask doesn't offer, a question after it, no speed code box, a page loaded again part-way", async () => {
  const run = async (code, { apply, html = editPage(), more = {} } = {}) => {
    const env = load({ now: NOW, ...tab, html, storage: job('run', [EDIT, { type: 'speedCode', code }, SAVE], { step: 1, navAt: NOW - 1000, ...more }) });
    fast(env.api);
    const doc = env.window.document;
    const typed = doc.getElementById('codes') ? speedCodes(doc, () => apply?.(doc)) : [];
    let saves = 0;
    doc.getElementById('save').addEventListener('click', () => saves++);
    await env.api.macroWork();
    const out = { ...item(env.api), saves, typed };
    env.close();
    return out;
  };
  let r = await run('XYZ');
  assert.deepEqual([r.state, r.note, r.saves], ['failed', 'Autotask didn\'t offer a speed code called "XYZ" (tried 3 times)', 0]);
  r = await run('PWR', { apply: doc => doc.body.insertAdjacentHTML('beforeend', '<div class="Dialog" role="dialog">Replace the values already on the ticket?' +
    '<div class="Button2"><div class="Text2">Yes</div></div><div class="Button2"><div class="Text2">No</div></div></div>') });
  assert.deepEqual([r.state, r.saves], ['failed', 0]);
  assert.match(r.note, /^Autotask asked "Replace the values already on the ticket\?/);
  r = await run('PWR', { html: realEditPage().replace(/<div class="FormTemplateSelector">/, '<div class="Other">') });
  assert.deepEqual([r.state, r.note], ['failed', "Couldn't find the speed code box on the edit page"]);
  r = await run('PWR', { more: { doing: 1 } });
  assert.deepEqual([r.state, r.note, r.typed], ['failed', "The edit page loaded again part-way through step 2, so it wasn't finished", []],
    'not done again: it could go round for ever');
  // A page from before the step that led away from it (that page was a window of its own): waits
  r = await run('PWR', { more: { navAt: NOW + 5000 } });
  assert.deepEqual([r.state, r.step, r.typed], ['run', 1, []]);
});

test('a built macro runs one way: an on page macro on the ticket in the page, right there; a queue selection macro on the ticked tickets', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd', { status: 'New' }) });
  fast(api);
  api.saveMacroDefs([
    { id: 'm1', v: 2, name: 'Password reset', scope: 'page', blocks: [statusIs('New'), EDIT, { ...PWR, ask: true }, set('Status', 'In Progress'), SAVE] },
    { id: 'm2', v: 2, name: 'Close as duplicate', scope: 'queue', blocks: [EDIT, set('Status', 'Complete'), SAVE] },
  ]);
  const doc = window.document;
  let edits = 0;
  doc.getElementById('edit').addEventListener('click', () => edits++);
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  assert.deepEqual([...pill.querySelectorAll('.mc-sq')].map(s => s.dataset.macro), ['account', 'c:m1', 'new'], 'a pop-up has no queue selection macros');
  assert.match(pill.querySelector('[data-macro="c:m1"]').textContent, /On page/);
  pill.querySelector('[data-macro="c:m1"]').click();
  const win = doc.getElementById('atqm-mcwin');
  assert.match(win.textContent, /On page macro: runs on the ticket in this page/);
  assert.deepEqual([...win.querySelectorAll('.mcw-steps li')].map(li => li.textContent),
    ['Only if Status is New', 'Enter edit mode', 'Ticket speed code (asked each time)', 'Set Status to In Progress', 'Save ticket']);
  const code = doc.getElementById('atqm-mc-b2');
  assert.equal(win.querySelector('label[for=atqm-mc-b2]').textContent, 'Ticket speed code');
  assert.equal(code.value, 'PWR', 'starts on what the macro has');
  const typeIn = v => { code.value = v; code.dispatchEvent(new window.Event('input', { bubbles: true })); };
  typeIn('');
  assert.ok(button(win, /^Run$/).disabled);
  assert.match(win.textContent, /Fill in Ticket speed code\./);
  typeIn(' NEWU ');
  button(win, /^Run$/).click();
  await sleep(50);
  const j = plain(api.macroJob());
  assert.deepEqual([j.kind, j.v, j.name, j.here, j.steps[2]], ['custom', 2, 'Password reset', true, { type: 'speedCode', code: 'NEWU' }]);
  assert.deepEqual([j.items[0].state, j.items[0].step, edits], ['run', 2, 1], 'checked, then Edit, right here');
  assert.deepEqual(plain(api.get('atqm:macro:codes', [])), ['NEWU'], 'offered next time');

  // Done: the corner says what it did
  api.patchMacroItem(A, { state: 'done', did: ['Ticket speed code NEWU', 'Status: In Progress', 'Saved the ticket'] });
  api.renderTicketPill();
  assert.match(doc.getElementById('atqm-tkpill').textContent, /Password reset: Ticket speed code NEWU · Status: In Progress · Saved the ticket/);
  // Try again runs the same blocks, values and all
  api.patchMacroItem(A, { state: 'failed' });
  api.retryMacro(api.macroJob());
  assert.deepEqual(plain(api.macroJob().steps), j.steps);
  assert.equal(api.macroJob().v, 2);
  close();

  // The queue selection one, from a queue: each ticked ticket in a tab of its own
  const q = load({ now: NOW, settings: { macroTabs: 5 } });
  q.api.saveMacroDefs([{ id: 'm2', v: 2, name: 'Close as duplicate', scope: 'queue', blocks: [EDIT, set('Status', 'Complete'), SAVE] }]);
  const opened = [];
  q.window.open = (url, name) => { opened.push(name); return { closed: false, close() {} }; };
  const m = q.api.allMacros().find(x => x.id === 'c:m2');
  assert.equal(m.only, 'ticked');
  m.start({}, { here: false, tickets: [{ id: A }, { id: B }] });
  assert.deepEqual(opened, ['atqm_macro:' + A, 'atqm_macro:' + B]);
  assert.deepEqual(plain(q.api.macroJob().items.map(i => i.state)), ['open', 'open']);
  q.close();
});

test("a macro that can't run (one imported unfinished, say) says what to fix, and doesn't run", () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd') });
  api.saveMacroDefs([{ id: 'm1', v: 2, name: 'Half done', scope: 'page', blocks: [EDIT, PWR] }]);
  const doc = window.document;
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  pill.querySelector('[data-macro="c:m1"]').click();
  const win = doc.getElementById('atqm-mcwin');
  assert.ok(button(win, /^Run$/).disabled);
  assert.match(win.textContent, /Fix it in the Macro builder \(Edit\): It ends on the edit page, so that wouldn't be saved: finish with Save ticket\./);
  close();
});

test("the time entry as Autotask builds it, a dialog laid over the ticket's page: New time entry arrives in it, Save time entry closes it, the ticket's page carries on", async () => {
  const steps = [NEW_TIME, { type: 'timeCode', code: 'PWR-100' }, { type: 'timeField', field: 'Date', value: '02/01/2026', empty: false },
    { type: 'timeField', field: 'Start Time', value: '10:30', empty: false }, { type: 'timeField', field: 'Status', value: 'Complete', empty: false },
    SAVE_ENTRY, { type: 'quickNote', text: 'Logged the time.', noteType: '' }];
  const { api, window, close } = load({ now: NOW, ...tab, html: ticketWithMore(), storage: job('open', steps) });
  fast(api);
  const doc = window.document;
  const notes = quickNotes(doc);
  let typed = [], saved = [];
  // New Time Entry lays the dialog over the page; Save & Close closes it
  doc.getElementById('newtime').addEventListener('click', () => {
    doc.body.insertAdjacentHTML('beforeend', timeDialog());
    autotaskPickers(doc);
    typed = speedCodes(doc);
    doc.getElementById('tsave').addEventListener('click', () => {
      saved.push([doc.getElementById('tdate').value, doc.getElementById('tstart').value, doc.querySelector('#tstatus-p .SelectionDisplay').textContent]);
      doc.getElementById('tdialog').remove();
    });
  });
  await api.macroWork();
  assert.deepEqual(plain([item(api).step, item(api).navAt]), [1, null], "it's there, in this page");
  assert.equal(api.pageKind(item(api)), 'time', 'the dialog over the ticket page is the time entry');
  await api.macroWork();
  assert.deepEqual(typed, ['PWR-100'], 'listed under two headings: still the one speed code');
  assert.deepEqual(saved, [['02/01/2026', '10:30', 'Complete']], 'Date and Start Time typed into their boxes, the ticket\'s Status picked');
  assert.equal(api.pageKind(item(api)), 'ticket');
  await api.macroWork();
  assert.deepEqual(notes, [['Logged the time.', '1']]);
  assert.deepEqual(plain([item(api).state, item(api).did]), ['done',
    ['Time entry speed code PWR-100', 'Date: 02/01/2026', 'Start Time: 10:30', 'Status: Complete', 'Saved a time entry', 'Quick note']]);
  close();
});

test('New time entry waits for the activity toolbar, built after the rest of the ticket page; one greyed out or hidden says so', async () => {
  const steps = [NEW_TIME, { type: 'hours', hours: '1' }, SAVE_ENTRY];
  const { api, window, close } = load({ now: NOW, ...tab, html: ticketWithMore({ toolbar: '' }), storage: job('open', steps) });
  fast(api);
  api.MACRO.find = 3000;
  const doc = window.document;
  // The toolbar a moment after the macro starts; New Time Entry lays the time entry over the page
  setTimeout(() => {
    doc.querySelector('.QuickNote').insertAdjacentHTML('beforebegin', activityToolbar());
    doc.getElementById('newtime').addEventListener('click', () => doc.body.insertAdjacentHTML('beforeend', timeDialog()));
  }, 600);
  await api.macroWork();
  assert.deepEqual(plain([item(api).state, item(api).step, item(api).navAt]), ['run', 1, null], 'pressed once it showed, and in the time entry');
  assert.equal(api.pageKind(item(api)), 'time');
  close();

  const run = async toolbar => {
    const env = load({ now: NOW, ...tab, html: ticketWithMore({ toolbar }), storage: job('open', steps) });
    fast(env.api);
    let pressed = 0;
    env.window.document.getElementById('newtime').addEventListener('click', () => pressed++);
    await env.api.macroWork();
    const out = [item(env.api).state, item(env.api).note, pressed];
    env.close();
    return out;
  };
  assert.deepEqual(await run(activityToolbar({ greyed: true })), ['failed', "New Time Entry is greyed out on the ticket's page", 0]);
  assert.deepEqual(await run(activityToolbar().replace('<div class="ToolBar">', '<div class="ToolBar" style="display:none">')),
    ['failed', "New Time Entry is on the ticket's page, but hidden", 0]);
});

test("a time entry slow to show (in a dialog of Autotask's) isn't taken for a question; the page that pressed New Time Entry carries on in it", async () => {
  const steps = [NEW_TIME, { type: 'hours', hours: '1' }, SAVE_ENTRY];
  const { api, window, close } = load({ now: NOW, ...tab, html: ticketWithMore(), storage: job('open', steps) });
  fast(api);
  const doc = window.document;
  window.Date.now = () => NOW + 1000; // pressed after this page loaded
  // Its dialog shows at once, but without Save & Close yet, so it isn't a time entry to fill in until that's there (and
  // no Quick note, whose Save would do)
  doc.querySelector('.QuickNote').remove();
  doc.getElementById('newtime').addEventListener('click', () => {
    doc.body.insertAdjacentHTML('beforeend', '<div role="dialog" class="Dialog" id="shell">' + timeDialog().replace('Save &amp; Close', '') + '</div>');
  });
  await api.macroWork();
  assert.deepEqual(plain([item(api).state, item(api).step, item(api).navAt]), ['run', 1, NOW + 1000], 'not failed: still loading');
  doc.querySelector('#tsave .Text2').textContent = 'Save & Close';
  doc.getElementById('tsave').addEventListener('click', () => doc.getElementById('shell').remove());
  await api.macroWork();
  assert.equal(doc.getElementById('shell'), null, 'filled in and saved');
  assert.deepEqual(plain([item(api).step, item(api).did]), [3, ['Hours Worked: 1', 'Saved a time entry']]);
  close();
});

test("Cancel time entry presses the time entry's ✕ (it has no Cancel button); a time entry for another ticket isn't this one's", async () => {
  const steps = [NEW_TIME, { type: 'hours', hours: '0.5' }, { type: 'cancelEntry' }, { type: 'quickNote', text: 'x' }];
  const { api, window, close } = load({ now: NOW, ...tab, html: timePage(), storage: job('run', steps, { step: 1, navAt: NOW - 1000 }) });
  fast(api);
  const doc = window.document;
  let closed = 0;
  doc.getElementById('tclose').addEventListener('click', () => { closed++; doc.getElementById('tdialog').remove(); });
  await api.macroWork();
  assert.equal(closed, 1);
  assert.deepEqual(plain([item(api).step, item(api).did]), [3, ['Hours Worked: 0.5']]);
  close();

  const other = load({ now: NOW, ...tab, html: timePage({ ticket: B }), storage: job('run', steps, { step: 1, navAt: NOW - 1000 }) });
  fast(other.api);
  assert.equal(other.api.pageKind(item(other.api)), null);
  await other.api.macroWork();
  assert.equal(other.window.document.getElementById('hours').value, '', 'left alone');
  assert.equal(item(other.api).step, 1);
  other.close();
});
