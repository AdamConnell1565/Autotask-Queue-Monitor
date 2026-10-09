'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, setNow, fixture } = require('./harness');

const NOW = Date.UTC(2026, 9, 7, 12, 0);
const A = 'T20261007.0081', B = 'T20261007.0082';
const plain = v => JSON.parse(JSON.stringify(v));
const states = api => plain(api.macroJob().items.map(i => i.state));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const button = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));
const fast = api => Object.assign(api.MACRO, { settle: 0, pick: 300, retype: 0, confirm: 300, saved: 500 });

// The ticket page, built as Autotask builds it (see docs/autotask-pages.md): the title bar, the Edit button,
// and read-only fields, label then value. A note's Save is on the page too, and isn't the edit page's.
const field = (label, value) => '<div class="ReadOnlyData QuickEditEnabled"><div class="ReadOnlyLabelContainer"><div class="LabelContainer1">' +
  `<div class="Text ClickEnabled"><span class="PrimaryText">${label}</span></div><div class="Required">*</div><div class="WalkMeIconPlaceholder"></div></div></div>` +
  `<div class="ReadOnlyValueContainer"><div class="Value">${value}</div></div></div>`;
const linkTo = text => `<div class="LinkButtonWrapper2"><div class="LinkButton2" tabindex="0"><div class="Text2">${text}</div></div></div>`;
// status: a Status field too, as a colour band (none unless given)
const ticketPage = (id, account, { contact = 'Jo Bloggs', subIssue = 'Other', workType = 'Remote Support', status } = {}) => '<!doctype html><body>' +
  `<div class="TitleBarItem Title"><span class="Text">Ticket </span><span class="SecondaryText">- ${id} - Laptop</span></div>` +
  '<div class="ToolBar"><div class="Button2 ButtonIcon2 NormalBackground" id="edit" tabindex="0"><div class="Spacer"></div>' +
  '<div class="Icon2"><div class="StandardButtonIcon Edit"></div></div><div class="Text2">Edit</div><div class="Spacer"></div></div></div>' +
  '<div class="ReadOnlyDetailsContainer">' + field('Account', linkTo(account)) + field('Contact', linkTo(contact)) +
  (status ? field('Status', `<div class="ColorBand ColorSwatch Color3"><div class="Right"><div class="Text ColorSample">${status}</div></div></div>`) : '') +
  field('Issue Type', 'Support') + field('Sub-Issue Type', subIssue) + field('Work Type', workType) + '</div>' +
  '<div class="QuickNote"><textarea placeholder="Add a note..."></textarea><div class="Button2 Disabled2" tabindex="0"><div class="Text2">Save</div></div></div>' +
  '<input type="text" placeholder="Search..."></body>';
const editPage = '<!doctype html><body>' +
  '<div class="FormTemplateSelector"><input type="text"></div>' +
  '<div class="Field"><div class="Label"><label>Account</label></div><div class="Value"><input type="text" id="acc" value="Fabrikam Ltd"></div></div>' +
  '<div class="Field"><div class="Label"><label>Contact</label></div><div class="Value"><input type="text"></div></div>' +
  '<div id="drop"></div>' +
  '<div class="Button2" id="save"><span class="Text2">Save</span></div></body>';

// The edit page with a Sub-Issue Type and a Work Type, as given
const typesPage = (subIssue, workType) => editPage.replace('<div id="drop">',
  `<div class="Field"><div class="Label"><span>Sub-Issue Type</span></div><div class="Value"><input type="text" id="sub" value="${subIssue}"></div></div>` +
  `<div class="Field"><div class="Label"><span>Work Type</span></div><div class="Value"><input type="text" id="work" value="${workType}"></div></div>` +
  '<div id="drop">');
// Autotask's drop-down list: typing in the box lists these, and clicking one puts it in the box
const offer = (doc, input, names) => input.addEventListener('input', () => {
  const drop = doc.getElementById('drop');
  drop.innerHTML = names.map(n => `<div class="Item">${n}</div>`).join('');
  for (const item of drop.querySelectorAll('.Item')) item.addEventListener('click', () => { input.value = item.textContent; drop.innerHTML = ''; });
});

// Autotask's ticket edit page as it's built today: structure only, placeholders throughout (see docs/autotask-pages.md)
const editorLabel = label => '<div class="EditorLabelContainer1"><div class="LabelContainer1"><div class="Text">' +
  `<span class="PrimaryText">${label}</span></div><div class="Required Active">*</div><div class="WalkMeIconPlaceholder"></div></div></div>`;
// A single-item picker (Status, Sub-Issue Type…): what's chosen, a search box, and its list (closed)
const itemPicker = (id, chosen, options) => `<div class="Size1"><div class="SingleItemSelector2" id="${id}"><div class="ContentContainer"><div class="ValueContainer">` +
  `<div class="TargetPreview">${chosen}</div><div class="SearchBox"><input type="text"></div><div class="SelectionDisplay">` +
  `<div class="Item" data-item-type="${chosen ? 'SingleText' : 'Default'}"><div class="Text"><span>${chosen}</span></div></div></div></div>` +
  '<div class="Triangle"><div class="InlineIcon Carrot"></div></div></div><div class="ContextOverlayContainer" style="display:none">' +
  '<div class="ContextOverlay SingleItemSelectorDropDownOverlay"><div class="Content"><div class="ItemSet"><div class="ItemList">' +
  '<div class="Item" data-item-type="Default" data-index="0"><div class="Text"><span></span></div></div>' +
  options.map((o, i) => `<div class="Item" data-item-type="SingleText" data-index="${i + 1}"><div class="Text"><span>${o}</span></div></div>`).join('') +
  '</div></div></div></div></div></div></div>';
// A data picker (Account, Contact, Work Type…): a search box, the chosen value as a chip, its full list (closed;
// Work Type's has every work type), and a list of what typing finds. Account and Contact sit in a .BundleContainer.
const dataPicker = (id, chosen, { all = [], bundle = true } = {}) => (bundle ? '<div class="BundleContainer"><div class="EditorContainer">' : '') +
  `<div class="Size1"><div class="SingleDataSelector2" id="${id}">` +
  '<div class="ContentContainer"><div class="SearchBox"><div class="Placeholder">Type to search...</div><input type="text"></div>' +
  `<div class="ChipList SingleDataSelection">${chosen ? `<div class="Chip"><div class="Text">${chosen}</div><div class="RemoveButton"></div></div>` : ''}</div></div>` +
  '<div class="ContextOverlayContainer" style="display:none"><div class="ContextOverlay SingleDataSelectorDropDownOverlay"><div class="Content"><div class="ItemSet"><div class="ItemList">' +
  all.map((o, i) => `<div class="Item" data-item-type="SingleText" data-index="${i}"><div class="Text"><span>${o}</span></div></div>`).join('') + '</div></div></div></div></div>' +
  '<div class="ContextOverlayContainer" style="display:none"><div class="ContextOverlay SingleDataSelectorAutoCompleteOverlay"><div class="Content">' +
  '<div class="ItemSetContainer"></div></div></div></div></div></div>' + (bundle ? '</div></div>' : '');
const WORK_TYPES = ['Meeting', 'Onsite Support', 'Remote Support', 'Server Support Billable (On Site)'];
const section = (id, title, fields, closed) => '<div class="DetailsSection"><div class="CollapsibleSectionContainer">' +
  `<div class="HeadingContainer" id="${id}-head"><div class="DetailsSectionHeading Title"><div class="Left"><span class="Text">${title}</span></div></div></div>` +
  `<div class="ContentContainer" id="${id}"${closed ? ' style="display:none"' : ''}><div class="Content">${fields}</div></div></div></div>`;
const realEditPage = ({ subIssue = '', workType = 'Remote Support', billingClosed = true } = {}) => '<!doctype html><body>' +
  '<div class="TitleBarItem Title"><span class="Text">Edit Ticket -</span><span class="SecondaryText">T20261007.0081 - Laptop (Fabrikam Ltd)</span></div>' +
  '<div class="ValidationSummary"><div class="FormValidation Valid"><div class="ErrorContent"><div class="TextContainer">' +
  '<span class="Count"></span><span class="Message"></span></div></div></div></div>' +
  '<div class="ToolBar"><div class="Button2" id="save"><div class="Text2">Save</div></div>' +
  '<div class="Button2" id="saveclose"><div class="Text2">Save &amp; Close</div></div><div class="Button2"><div class="Text2">Cancel</div></div>' +
  '<div class="FormTemplateSelector"><div class="SingleItemSelector2"><div class="ValueContainer"><div class="SearchBox"><input type="text"></div>' +
  '<div class="SelectionDisplay"><div class="Item" data-item-type="Default"><div class="Text"><span>Enter Speed Code or Choose Template</span></div></div></div></div></div></div></div>' +
  '<div class="DetailsSection"><div class="Content">' + editorLabel('Account') + dataPicker('acc', 'Fabrikam Ltd') +
  editorLabel('Contact') + dataPicker('con', 'Jane Doe') + '</div></div>' +
  section('info', 'Ticket Information', editorLabel('Sub-Issue Type') + itemPicker('sub', subIssue, ['Hardware', 'Other', 'Software']) +
    editorLabel('Source') + itemPicker('src', 'Other', ['Email', 'Other', 'Phone'])) +
  section('billing', 'Billing', editorLabel('Work Type') + dataPicker('work', workType, { all: WORK_TYPES, bundle: false }), billingClosed) +
  '</body>';
// How those pickers behave: typing opens the list (a data picker's with what it finds, from found by its id),
// clicking a line chooses it (takes: false, a click that doesn't), and a closed section opens from its heading
function autotaskPickers(doc, { found: lists = { acc: ['Northwind Ltd'], work: WORK_TYPES }, takes = true } = {}) {
  const choose = (picker, overlay, input, html) => item => item.addEventListener('click', () => {
    if (takes) picker.querySelector('.SelectionDisplay, .ChipList').innerHTML = html(item.textContent);
    overlay.style.display = 'none';
    input.value = '';
  });
  for (const p of doc.querySelectorAll('.SingleItemSelector2[id]')) {
    const input = p.querySelector('.SearchBox input'), overlay = p.querySelector('.ContextOverlayContainer');
    input.addEventListener('input', () => { overlay.style.display = input.value ? '' : 'none'; });
    overlay.querySelectorAll('.Item').forEach(choose(p, overlay, input, t => `<div class="Item" data-item-type="SingleText"><div class="Text"><span>${t}</span></div></div>`));
  }
  // A data picker's search, as Autotask shows it: the overlay goes Active, .ItemSetContainer stays empty and the
  // results are a new .ItemSet after it, the typed part of each name in <mark>
  for (const p of doc.querySelectorAll('.SingleDataSelector2')) {
    const input = p.querySelector('.SearchBox input'), empty = p.querySelector('.ItemSetContainer');
    const overlay = empty.closest('.ContextOverlayContainer'), panel = overlay.querySelector('.ContextOverlay');
    input.addEventListener('input', () => {
      const typed = input.value.toLowerCase();
      const found = (lists[p.id] || []).filter(a => typed && a.toLowerCase().includes(typed));
      overlay.querySelector('.ItemSet')?.remove();
      const marked = a => { const i = a.toLowerCase().indexOf(typed); return `${a.slice(0, i)}<mark>${a.slice(i, i + typed.length)}</mark>${a.slice(i + typed.length)}`; };
      if (found.length) {
        empty.insertAdjacentHTML('afterend', '<div class="ItemSet"><div class="ItemList">' + found.map((a, i) =>
          `<div class="Item" data-item-type="SingleText" data-index="${i}" data-is-targeted="${i === 0}"><div class="Text"><span>${marked(a)}</span></div></div>`).join('') + '</div></div>');
      }
      overlay.style.display = found.length ? '' : 'none';
      panel.classList.toggle('Active', found.length > 0);
      overlay.querySelectorAll('.ItemSet .Item').forEach(choose(p, overlay, input, t => `<div class="Chip"><div class="Text">${t}</div></div>`));
    });
  }
  for (const head of doc.querySelectorAll('.HeadingContainer')) {
    head.addEventListener('click', () => { doc.getElementById(head.id.replace(/-head$/, '')).style.display = ''; });
  }
}

// A job part-way through, as the macro tab finds it
const job = (state, more = {}, fill = {}) => ({
  'atqm:macro': { id: 'job1', kind: 'account', account: 'Northwind Ltd', fill, by: 'elsewhere', ts: NOW,
    items: [{ id: A, tid: '111', state, at: NOW, note: '', ...more }, { id: B, tid: null, state: 'waiting', note: '' }] },
});

test('change account: the tab that starts it opens each ticket in turn and moves on as they finish', () => {
  const { api, window, close } = load({ now: NOW, storage: { 'atqm:snap:my-open-tickets': { [A]: { tid: '111', status: 'New' } } } });
  const shown = [];
  const tab = { closed: false, location: { set href(u) { shown.push(u); } }, close() { this.closed = true; } };
  window.open = (url, name) => { shown.push(url); assert.equal(name, 'atqm_macro'); return tab; };

  api.startMacro([{ id: A }, { id: B }], ' Northwind Ltd ');
  assert.equal(api.macroJob().account, 'Northwind Ltd');
  assert.deepEqual(states(api), ['open', 'waiting']);
  assert.match(shown[0], /TicketDetail\.mvc\?workspace=False&ticketId=111$/); // the ticket's own page when its ID is known

  // The macro tab reports the first one done: on to the next, in the same tab
  api.patchMacroItem(A, { state: 'done' });
  api.macroStep();
  assert.deepEqual(states(api), ['done', 'open']);
  assert.match(shown[1], /ExecuteCommand\.aspx\?Code=OpenTicketDetail&TicketNumber=T20261007\.0082$/);

  // A ticket stuck on a step is given up after two minutes; with nothing left, the macro tab closes
  setNow(window, NOW + 60000);
  api.macroStep();
  assert.deepEqual(states(api), ['done', 'open']);
  setNow(window, NOW + 121000);
  api.macroStep();
  assert.deepEqual(states(api), ['done', 'failed']);
  assert.equal(api.macroJob().items[1].note, "The ticket page didn't open, or had no Edit button");
  assert.ok(api.macroJob().finished);
  assert.ok(tab.closed);
  // The macro tab getting there late doesn't bring it back
  api.patchMacroItem(B, { state: 'edit' }, 'open');
  assert.deepEqual(states(api), ['done', 'failed']);
  close();
});

test('change account: when the browser blocks the macro tab, it stops and says so', () => {
  const { api, window, close } = load({ now: NOW });
  window.open = () => null;
  api.startMacro([{ id: A }], 'Northwind Ltd');
  assert.deepEqual(states(api), ['waiting']);
  assert.match(api.macroJob().note, /blocked the macro tab/);
  assert.ok(api.macroJob().finished);
  close();
});

test('change account: on the ticket page the macro tab presses Edit, or skips a ticket already on that account', async () => {
  const one = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd'), storage: job('open') });
  fast(one.api);
  let edits = 0;
  one.window.document.getElementById('edit').addEventListener('click', () => edits++);
  await one.api.macroWork();
  assert.deepEqual(states(one.api), ['edit', 'waiting']);
  assert.equal(edits, 1);
  // It says what it's doing, across the bottom of the tab
  assert.match(one.window.document.getElementById('atqm-macrobar').textContent, /changing the account on T20261007\.0081 to Northwind Ltd \(1 of 2\)/);
  one.close();

  const two = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd'), storage: job('open') });
  fast(two.api);
  await two.api.macroWork();
  assert.deepEqual(states(two.api), ['skipped', 'waiting']);
  two.close();

  // A tab that isn't the macro tab leaves the ticket alone
  const mine = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd'), storage: job('open') });
  fast(mine.api);
  await mine.api.macroWork();
  assert.deepEqual(states(mine.api), ['open', 'waiting']);
  mine.close();
});

test('change account: on the edit page it picks the account and saves; the ticket page then confirms it', async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(api);
  const doc = window.document;
  assert.equal(api.accountField(), doc.getElementById('acc')); // not the speed code box, not Contact
  const acc = doc.getElementById('acc');
  // Autotask lists matching accounts as you type
  acc.addEventListener('input', () => {
    doc.getElementById('drop').innerHTML = '<div class="Item">Northwind Ltd (closed)</div><div class="Item">Northwind Ltd</div>';
    for (const item of doc.querySelectorAll('.Item')) item.addEventListener('click', () => { acc.value = item.textContent; doc.getElementById('drop').innerHTML = ''; });
  });
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove()); // saving leaves the page
  await api.macroWork();
  assert.equal(acc.value, 'Northwind Ltd');
  assert.deepEqual(states(api), ['verify', 'waiting']);
  assert.equal(api.macroJob().items[0].chosen, 'Northwind Ltd');
  close();

  const after = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd'), storage: job('verify', { chosen: 'Northwind Ltd' }) });
  await after.api.macroWork();
  assert.deepEqual(states(after.api), ['done', 'waiting']);
  after.close();
});

test("change account: an account Autotask doesn't offer, or a save that doesn't go through, fails that ticket", async () => {
  const none = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(none.api);
  await none.api.macroWork();
  assert.deepEqual(states(none.api), ['failed', 'waiting']);
  assert.equal(none.api.macroJob().items[0].note, 'Autotask didn\'t offer an account called "Northwind Ltd" (tried 3 times)');
  none.close();

  const stuck = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(stuck.api);
  const doc = stuck.window.document;
  doc.getElementById('acc').addEventListener('input', () => { doc.getElementById('drop').innerHTML = '<div class="Item">Northwind Ltd</div>'; });
  doc.getElementById('save').addEventListener('click', () => {
    doc.body.insertAdjacentHTML('beforeend', '<div class="ErrorMessage">Contact is required.</div>');
  });
  await stuck.api.macroWork();
  assert.deepEqual(states(stuck.api), ['failed', 'waiting']);
  assert.equal(stuck.api.macroJob().items[0].note, 'Not saved: Contact is required.');
  stuck.close();
});

test('change account: Sub-Issue Type and Work Type are only filled in where the ticket has none', async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: typesPage('', 'Remote Support'),
    storage: job('edit', {}, { subIssue: 'Laptop', workType: 'Onsite' }) });
  fast(api);
  const doc = window.document;
  offer(doc, doc.getElementById('acc'), ['Northwind Ltd']);
  offer(doc, doc.getElementById('sub'), ['Laptop', 'Laptop Screen']);
  let workTyped = false;
  doc.getElementById('work').addEventListener('input', () => { workTyped = true; });
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove());
  await api.macroWork();
  assert.equal(doc.getElementById('acc').value, 'Northwind Ltd');
  assert.equal(doc.getElementById('sub').value, 'Laptop');
  assert.equal(doc.getElementById('work').value, 'Remote Support');
  assert.equal(workTyped, false, 'the Work Type it already had is left alone');
  assert.deepEqual(states(api), ['verify', 'waiting']);
  assert.deepEqual(plain(api.macroJob().items[0].filled), ['Sub-Issue Type']);
  assert.deepEqual(plain(api.macroJob().items[0].kept), ['Work Type']);
  close();

  // A selector showing its choice beside an empty search box has one too
  const shown = load({ now: NOW, name: 'atqm_macro', storage: job('edit', {}, { subIssue: 'Desktop' }),
    html: typesPage('', '').replace('<input type="text" id="sub" value="">', '<span class="Chosen">Laptop</span><input type="text" id="sub" value="">') });
  fast(shown.api);
  const d1 = shown.window.document;
  offer(d1, d1.getElementById('acc'), ['Northwind Ltd']);
  let subTyped = false;
  d1.getElementById('sub').addEventListener('input', () => { subTyped = true; });
  d1.getElementById('save').addEventListener('click', () => d1.getElementById('save').remove());
  await shown.api.macroWork();
  assert.equal(subTyped, false);
  assert.deepEqual(states(shown.api), ['verify', 'waiting']);
  assert.deepEqual(plain(shown.api.macroJob().items[0].kept), ['Sub-Issue Type']);
  shown.close();

  // A Work Type that isn't a text box: not the next field's box instead
  const select = load({ now: NOW, name: 'atqm_macro', storage: job('edit', {}, { workType: 'Onsite' }),
    html: editPage.replace('<div id="drop">', '<div class="Field"><div class="Label"><span>Work Type</span></div><div class="Value"><select id="work"></select></div></div>' +
      '<div class="Field"><div class="Label"><label>Due Date</label></div><div class="Value"><input type="text" id="due"></div></div><div id="drop">') });
  fast(select.api);
  const d3 = select.window.document;
  offer(d3, d3.getElementById('acc'), ['Northwind Ltd']);
  await select.api.macroWork();
  assert.equal(d3.getElementById('due').value, '');
  assert.deepEqual(states(select.api), ['failed', 'waiting']);
  assert.equal(select.api.macroJob().items[0].note, "Couldn't find the Work Type field on the edit page");
  select.close();

  // The same with field names that aren't <label>s: still nothing typed into the next field's box
  const spans = load({ now: NOW, name: 'atqm_macro', storage: job('edit', {}, { workType: 'Onsite' }),
    html: editPage.replace('<div id="drop">', '<div class="Field"><div class="Label"><span>Work Type</span></div><div class="Value"><select id="work"></select></div></div>' +
      '<div class="Field"><div class="Label"><span>Due Date</span></div><div class="Value"><input type="text" id="due"></div></div><div id="drop">') });
  fast(spans.api);
  const d4 = spans.window.document;
  offer(d4, d4.getElementById('acc'), ['Northwind Ltd']);
  let dueTyped = false;
  d4.getElementById('due').addEventListener('input', () => { dueTyped = true; });
  await spans.api.macroWork();
  assert.equal(dueTyped, false);
  assert.equal(plain(spans.api.macroJob().items[0].filled || []).length, 0);
  spans.close();

  // An empty one whose type Autotask doesn't offer: not saved
  const none = load({ now: NOW, name: 'atqm_macro', html: typesPage('', ''), storage: job('edit', {}, { workType: 'Onsite' }) });
  fast(none.api);
  const d2 = none.window.document;
  offer(d2, d2.getElementById('acc'), ['Northwind Ltd']);
  offer(d2, d2.getElementById('work'), ['Remote Support']);
  let saves = 0;
  d2.getElementById('save').addEventListener('click', () => saves++);
  await none.api.macroWork();
  assert.deepEqual(states(none.api), ['failed', 'waiting']);
  assert.equal(none.api.macroJob().items[0].note, 'Autotask didn\'t offer a Work Type called "Onsite" (tried 3 times)');
  assert.equal(d2.getElementById('sub').value, '', 'one not asked for is left alone');
  assert.equal(saves, 0);
  none.close();

  // Asked for, but the edit page has no such field
  const missing = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit', {}, { subIssue: 'Laptop' }) });
  fast(missing.api);
  offer(missing.window.document, missing.window.document.getElementById('acc'), ['Northwind Ltd']);
  await missing.api.macroWork();
  assert.deepEqual(states(missing.api), ['failed', 'waiting']);
  assert.equal(missing.api.macroJob().items[0].note, "Couldn't find the Sub-Issue Type field on the edit page");
  missing.close();
});

test('change account: only the types given are kept with the job, and remembered for next time', () => {
  const { api, window, close } = load({ now: NOW });
  window.open = () => ({ closed: false, location: {}, close() {} });
  api.startMacro([{ id: A }], 'Northwind Ltd', { fill: { subIssue: ' Laptop ', workType: '  ' } });
  assert.deepEqual(plain(api.macroJob().fill), { subIssue: 'Laptop' });
  assert.deepEqual(plain(api.get('atqm:macro:fills', null)), { subIssue: ['Laptop'] });
  close();
});

test("the ticket page's own fields: the account in its Account field, not a contact with the same name", async () => {
  const { api, close } = load({ html: ticketPage(A, 'Contoso Ltd', { contact: 'Northwind Ltd', workType: '' }) });
  assert.equal(api.ticketField(api.AT.text.accountLabel), 'Contoso Ltd');
  assert.equal(api.ticketField(api.AT.text.subIssueLabel), 'Other');
  assert.equal(api.ticketField(api.AT.text.workTypeLabel), '');
  assert.equal(api.ticketField(/^due date/i), null, 'not on this page');
  assert.equal(api.accountField(), null, "the ticket page isn't the edit page, whatever text boxes it has");
  close();

  // Moving it to Northwind Ltd: the contact of that name doesn't make it "already on it"
  const run = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Contoso Ltd', { contact: 'Northwind Ltd' }), storage: job('open') });
  fast(run.api);
  await run.api.macroWork();
  assert.deepEqual(states(run.api), ['edit', 'waiting']);
  run.close();
});

test('change account: a type the ticket page shows is kept, even where the edit page shows nothing', async () => {
  // Before editing, the ticket page shows a Work Type and no Sub-Issue Type
  const open = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd', { subIssue: '', workType: 'Remote Support' }),
    storage: job('open', {}, { subIssue: 'Laptop', workType: 'Onsite' }) });
  fast(open.api);
  await open.api.macroWork();
  assert.deepEqual(states(open.api), ['edit', 'waiting']);
  assert.deepEqual(plain(open.api.macroJob().items[0].had), { subIssue: '', workType: 'Remote Support' });
  const had = plain(open.api.macroJob().items[0].had);
  open.close();

  // The edit page shows both empty (its selector shows its choice somewhere not recognised): the Work Type is left alone
  const edit = load({ now: NOW, name: 'atqm_macro', html: typesPage('', ''), storage: job('edit', { had }, { subIssue: 'Laptop', workType: 'Onsite' }) });
  fast(edit.api);
  const doc = edit.window.document;
  offer(doc, doc.getElementById('acc'), ['Northwind Ltd']);
  offer(doc, doc.getElementById('sub'), ['Laptop']);
  let workTyped = false;
  doc.getElementById('work').addEventListener('input', () => { workTyped = true; });
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove());
  await edit.api.macroWork();
  assert.equal(doc.getElementById('sub').value, 'Laptop');
  assert.equal(workTyped, false);
  const item = plain(edit.api.macroJob().items[0]);
  assert.deepEqual([item.state, item.filled, item.kept, item.picks], ['verify', ['Sub-Issue Type'], ['Work Type'], { subIssue: 'Laptop' }]);
  edit.close();

  // Saved: done once the ticket page shows the account and the Sub-Issue Type it filled in
  const ok = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd', { subIssue: 'Laptop' }), storage: job('verify', item, { subIssue: 'Laptop' }) });
  await ok.api.macroWork();
  assert.deepEqual(states(ok.api), ['done', 'waiting']);
  ok.close();
  const off = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd', { subIssue: '' }), storage: job('verify', item, { subIssue: 'Laptop' }) });
  await off.api.macroWork();
  assert.deepEqual(states(off.api), ['check', 'waiting']);
  assert.equal(off.api.macroJob().items[0].note, 'Saved, but Sub-Issue Type shows nothing instead of Laptop');
  off.close();
});

test("change account on Autotask's edit page as it's built: the account's chip, a type from its own list, Work Type in a closed section, plain Save", async () => {
  const { api, window, close } = load({ now: NOW, html: realEditPage(), storage: job('edit', {}, { subIssue: 'Other', workType: 'Onsite' }) });
  window.sessionStorage.setItem('atqm:macro', 'job1'); // an Edit window opened from the macro tab carries the job
  fast(api);
  const doc = window.document, shown = id => doc.querySelector(`#${id} .SelectionDisplay`).textContent;
  autotaskPickers(doc);
  let saved = '';
  for (const id of ['save', 'saveclose']) doc.getElementById(id).addEventListener('click', () => { saved = id; doc.getElementById(id).remove(); });
  await api.macroWork();
  assert.equal(doc.querySelector('#acc .Chip').textContent, 'Northwind Ltd');
  assert.equal(shown('sub'), 'Other', 'from its own list');
  assert.equal(shown('src'), 'Other', "Source, showing the same word, isn't touched");
  assert.equal(doc.getElementById('billing').style.display, '', 'Billing opened to find Work Type');
  assert.equal(doc.querySelector('#work .Chip').textContent, 'Remote Support', 'kept: it has one');
  assert.equal(doc.querySelector('.FormTemplateSelector input').value, '', 'the speed code box is never used');
  const item = plain(api.macroJob().items[0]);
  assert.deepEqual([item.state, item.filled, item.kept, item.chosen], ['verify', ['Sub-Issue Type'], ['Work Type'], 'Northwind Ltd']);
  assert.equal(saved, 'save', 'plain Save: Save & Close would go on to close the ticket');
  close();

  // An empty Work Type (no chip) in the closed section is filled in, "Onsite" finding Onsite Support; in the
  // macro tab, plain Save too
  const tab = load({ now: NOW, name: 'atqm_macro', html: realEditPage({ subIssue: 'Hardware', workType: '' }), storage: job('edit', {}, { subIssue: 'Other', workType: 'Onsite' }) });
  fast(tab.api);
  const d2 = tab.window.document;
  autotaskPickers(d2);
  let saved2 = '';
  for (const id of ['save', 'saveclose']) d2.getElementById(id).addEventListener('click', () => { saved2 = id; d2.getElementById(id).remove(); });
  await tab.api.macroWork();
  assert.equal(d2.querySelector('#work .Chip').textContent, 'Onsite Support');
  assert.equal(d2.querySelector('#sub .SelectionDisplay').textContent, 'Hardware');
  assert.deepEqual(plain([tab.api.macroJob().items[0].filled, tab.api.macroJob().items[0].kept]), [['Work Type'], ['Sub-Issue Type']]);
  assert.equal(saved2, 'save');
  tab.close();
});

test("change account: when Autotask won't save, the note says what it said and which fields it marked", async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: realEditPage({ subIssue: 'Other' }), storage: job('edit') });
  fast(api);
  const doc = window.document;
  autotaskPickers(doc);
  // Save: Autotask marks the Account field (its label and its box) and its summary at the top says "Required",
  // as it does for a required field left empty; the page stays
  doc.getElementById('save').addEventListener('click', () => {
    doc.querySelector('.ValidationSummary').classList.add('Active');
    doc.querySelector('.ValidationSummary .FormValidation').className = 'FormValidation Single';
    doc.querySelector('.ValidationSummary .Message').textContent = 'Required';
    doc.querySelector('.LabelContainer1').classList.add('Invalid');
    doc.querySelector('#acc').classList.add('Invalid');
  });
  await api.macroWork();
  assert.deepEqual(states(api), ['failed', 'waiting']);
  assert.equal(api.macroJob().items[0].note, 'Not saved: Required: Account');
  close();
});

test("change account: Autotask lists every account containing what's typed; the macro takes the whole name, never a guess", async () => {
  const found = { acc: ['Contoso IT', "Contoso IT Doc's", 'Contoso IT Solutions'], work: WORK_TYPES };
  const run = async account => {
    const env = load({ now: NOW, name: 'atqm_macro', html: realEditPage({ subIssue: 'Other' }), storage: job('edit') });
    fast(env.api);
    env.api.set('atqm:macro', { ...env.api.macroJob(), account });
    autotaskPickers(env.window.document, { found });
    env.window.document.getElementById('save').addEventListener('click', () => env.window.document.getElementById('save').remove());
    await env.api.macroWork();
    const out = [env.window.document.querySelector('#acc .Chip')?.textContent, plain(env.api.macroJob().items[0])];
    env.close();
    return out;
  };
  // The whole name, even with longer names containing it in the list
  let [chip, item] = await run('Contoso IT');
  assert.equal(chip, 'Contoso IT');
  assert.equal(item.state, 'verify');
  [chip, item] = await run('Contoso IT Solutions');
  assert.equal(chip, 'Contoso IT Solutions');
  // Only part of a name three accounts share: no guess
  [chip, item] = await run('Contoso');
  assert.equal(chip, 'Fabrikam Ltd', 'left as it was');
  assert.deepEqual([item.state, item.note], ['failed', '3 accounts match "Contoso": use the full name']);
});

test("change account: a pick the field doesn't take fails the ticket, unsaved", async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: realEditPage(), storage: job('edit') });
  fast(api);
  const doc = window.document;
  autotaskPickers(doc, { takes: false });
  let saves = 0;
  doc.getElementById('save').addEventListener('click', () => saves++);
  await api.macroWork();
  assert.deepEqual(states(api), ['failed', 'waiting']);
  assert.equal(api.macroJob().items[0].note, 'Picked "Northwind Ltd", but the Account field didn\'t take it');
  assert.equal(saves, 0);
  close();
});

test('change account: a ticket already on the account is still edited for a type it has empty, its account left alone', async () => {
  // On the ticket page: already on it, no Work Type
  const open = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd', { workType: '' }), storage: job('open', {}, { workType: 'Onsite' }) });
  fast(open.api);
  let edits = 0;
  open.window.document.getElementById('edit').addEventListener('click', () => edits++);
  await open.api.macroWork();
  const item = plain(open.api.macroJob().items[0]);
  assert.deepEqual([item.state, item.keepAccount, item.had, edits], ['edit', true, { workType: '' }, 1]);
  open.close();

  // On the edit page: the account isn't typed into, the Work Type is filled in
  const edit = load({ now: NOW, name: 'atqm_macro', html: realEditPage({ workType: '', billingClosed: false }), storage: job('edit', item, { workType: 'Onsite' }) });
  fast(edit.api);
  const doc = edit.window.document;
  autotaskPickers(doc);
  let typed = 0;
  doc.querySelector('#acc input').addEventListener('input', () => typed++);
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove());
  await edit.api.macroWork();
  assert.equal(typed, 0);
  assert.equal(doc.querySelector('#work .Chip').textContent, 'Onsite Support');
  assert.deepEqual(states(edit.api), ['verify', 'waiting']);
  edit.close();

  // Already on it with nothing to fill in: skipped, as before
  const skip = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Northwind Ltd'), storage: job('open', {}, { workType: 'Onsite' }) });
  fast(skip.api);
  await skip.api.macroWork();
  assert.deepEqual(states(skip.api), ['skipped', 'waiting']);
  skip.close();
});

test("change account: when the browser blocks Autotask's Edit window, the ticket fails straight away and says why", async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd'), storage: job('open') });
  fast(api);
  window.open = () => null; // pop-ups blocked
  window.document.getElementById('edit').addEventListener('click', () => window.open('https://ww5.autotask.net/edit', '_blank'));
  await api.macroWork();
  assert.deepEqual(states(api), ['failed', 'waiting']);
  assert.match(api.macroJob().items[0].note, /blocked the Edit window\. Allow pop-ups for autotask\.net/);
  assert.equal(api.get('atqm:popups', {}).state, 'blocked');
  close();
});

test("change account: when Autotask's list doesn't load, it clears the box and types again, 3 times in all", async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(api);
  const doc = window.document, acc = doc.getElementById('acc'), drop = doc.getElementById('drop');
  const typed = [];
  acc.addEventListener('input', () => {
    typed.push(acc.value);
    // This time Autotask only lists accounts on the third typing
    if (typed.filter(Boolean).length < 3) return;
    drop.innerHTML = '<div class="Item">Northwind Ltd</div>';
    drop.firstChild.addEventListener('click', () => { acc.value = 'Northwind Ltd'; drop.innerHTML = ''; });
  });
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove());
  await api.macroWork();
  assert.deepEqual(typed, ['Northwind Ltd', '', 'Northwind Ltd', '', 'Northwind Ltd']);
  assert.equal(acc.value, 'Northwind Ltd');
  assert.deepEqual(states(api), ['verify', 'waiting']);
  close();
});

test('change account: a choice that only contains the name waits a moment, in case the exact one is still coming', async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(api);
  const doc = window.document, acc = doc.getElementById('acc'), drop = doc.getElementById('drop');
  const pickable = () => { for (const item of drop.querySelectorAll('.Item')) item.onclick = () => { acc.value = item.textContent; drop.innerHTML = ''; }; };
  acc.addEventListener('input', () => {
    drop.innerHTML = '<div class="Item">Northwind Ltd (closed)</div>';
    pickable();
    setTimeout(() => { drop.insertAdjacentHTML('beforeend', '<div class="Item">Northwind Ltd</div>'); pickable(); }, 100);
  });
  doc.getElementById('save').addEventListener('click', () => doc.getElementById('save').remove());
  await api.macroWork();
  assert.equal(acc.value, 'Northwind Ltd');
  assert.deepEqual(states(api), ['verify', 'waiting']);
  close();
});

test('change account: a page left over from a stopped job leaves a new job on the same ticket alone', async () => {
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: editPage, storage: job('edit') });
  fast(api);
  const doc = window.document;
  offer(doc, doc.getElementById('acc'), ['Northwind Ltd']);
  let saves = 0;
  doc.getElementById('save').addEventListener('click', () => saves++);
  const working = api.macroWork();
  // Meanwhile that job was stopped, and a new one started on the same ticket
  api.set('atqm:macro', { id: 'job2', kind: 'account', account: 'Contoso', fill: {}, by: 'elsewhere', ts: NOW,
    items: [{ id: A, tid: '111', state: 'edit', at: NOW, note: '' }] });
  await working;
  assert.equal(saves, 0);
  assert.equal(api.macroJob().id, 'job2');
  assert.deepEqual(states(api), ['edit']);
  close();
});

test('change account: a job "here" whose page has moved on still gives up on a stuck step', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd') });
  api.set('atqm:macro', { id: 'job3', kind: 'account', account: 'Northwind Ltd', fill: {}, by: 'a page since reloaded', ts: NOW, here: true,
    items: [{ id: A, tid: '111', state: 'edit', at: NOW - 121000, note: '' }] });
  window.sessionStorage.setItem('atqm:macro', 'job3');
  await api.macroWork();
  assert.deepEqual(states(api), ['failed']);
  assert.match(api.macroJob().items[0].note, /^Stuck on the edit page/);
  assert.ok(api.macroJob().finished);
  close();
});

test('a ticket page running a macro takes its strip down when the macro finishes', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Northwind Ltd') });
  const doc = window.document;
  const running = state => ({ id: 'job5', kind: 'account', account: 'Northwind Ltd', fill: {}, by: 'a page since reloaded', ts: NOW, here: true,
    items: [{ id: A, tid: '111', state, at: NOW, note: '', chosen: 'Northwind Ltd' }] });
  window.sessionStorage.setItem('atqm:macro', 'job5');

  // Saved and showing the new account: done, so the strip goes straight away and the corner shows how it went
  api.set('atqm:macro', running('verify'));
  await api.macroWork();
  assert.ok(api.macroJob().finished);
  assert.equal(doc.getElementById('atqm-macrobar'), null);
  assert.match(doc.getElementById('atqm-tkpill').textContent, /Account: Northwind Ltd/);

  // Stopped from another window part-way: the strip goes on the next tick
  api.set('atqm:macro', running('edit'));
  await api.macroWork();
  assert.ok(doc.getElementById('atqm-macrobar'), 'up while it runs');
  api.set('atqm:macro', { ...running('check'), finished: NOW, note: 'Stopped.' });
  await api.macroWork();
  assert.equal(doc.getElementById('atqm-macrobar'), null);
  close();
});

test("the account picked stays picked when it drops out of the lists", () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd'), storage: {
    'atqm:macro:accounts': ['Northwind Ltd'], 'atqm:snap:my-open-tickets': { [B]: { status: 'New', account: 'Example Dental' } } } });
  const doc = window.document;
  api.renderTicketPill();
  button(doc.getElementById('atqm-tkpill'), /^Macros$/).click();
  button(doc.getElementById('atqm-tkpill'), /^Change account$/).click();
  const sel = doc.getElementById('atqm-mc-account');
  sel.value = 'Example Dental';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  // Its last ticket leaves your queues, and the window redraws
  api.set('atqm:snap:my-open-tickets', {});
  api.renderTicketPill();
  assert.equal(sel.value, 'Example Dental');
  assert.equal(button(doc.getElementById('atqm-mcwin'), /^Run$/).disabled, false);
  close();
});

test("the tickets ticked in Autotask's grid, as it draws them: its own tick box, the ticket's ID on the row", () => {
  // Two rows as Autotask builds them (structure only, placeholders): the first ticked, the second not
  const open = id => `(function(e) { e.preventDefault(); e.stopPropagation(); return autotask.siteNavigation.__openPage(new Autotask.NewWindowPage(` +
    `'TicketDetail','/Mvc/ServiceDesk/TicketDetail.mvc?workspace=False\\u0026ids%5B0%5D=100001\\u0026ids%5B1%5D=100002',false,'ticketId','${id}',true)); })(event)`;
  const row = (id, number, ticked) => `<tr class="Display${ticked ? ' Selected' : ''}" data-row-key="${id}">` +
    `<td class="ImageSelectionCell FW61"><div class="Container"><div class="Decoration Icon CheckBox${ticked ? ' Selected' : ''}"></div></div></td>` +
    '<td class="ContextMenuCell FW30"><div class="Button ButtonIcon ContextMenu"><div class="Icon"></div></div></td>' +
    `<td class="TextCell SA Link FW130 AL" onclick="${open(id)}">${number}</td>` +
    `<td class="TextCell SA Link LW200 HW800 R AL" onclick="${open(id)}">Printer not working</td>` +
    '<td class="ColorSwatch ColorText ColorizedTextCell Color3 SA LW100 HW300 R AL">Waiting Customer</td></tr>';
  const html = '<!doctype html><body><div class="Grid"><table><tr class="Heading"><td></td><td></td><td>Ticket Number</td><td>Title</td><td>Status</td></tr>' +
    row('100001', 'T20261001.0001', true) + row('100002', 'T20261001.0002', false) + '</table></div></body>';
  const { api, window, close } = load({ html });
  assert.deepEqual(plain(api.tickedTickets()), [{ id: 'T20261001.0001', tid: '100001' }]);
  // Ticking the second: Autotask marks its box (and the row) Selected
  const second = window.document.querySelectorAll('tr.Display')[1];
  second.classList.add('Selected');
  second.querySelector('.CheckBox').classList.add('Selected');
  assert.deepEqual(plain(api.tickedTickets()).map(t => t.tid), ['100001', '100002']);
  close();
});

test('the tickets ticked in a queue grid, with their internal IDs', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html') });
  assert.deepEqual(plain(api.tickedTickets()), []);
  window.document.querySelector('input[value="1002"]').checked = true;
  assert.deepEqual(plain(api.tickedTickets()), [{ id: 'T20261001.0002', tid: '1002' }]);
  close();
});

test("a list of tickets that isn't a queue (a dashboard widget's drill-down) has tickets to tick for a macro", () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html') });
  const doc = window.document;
  doc.getElementById('menu').remove(); // no queue menu: not one of My Workspace's queues
  doc.querySelector('input[value="1002"]').checked = true;
  // Autotask's own kind of checkbox counts too
  doc.querySelector('input[value="1001"]').insertAdjacentHTML('afterend', '<div class="Checkbox2"><div class="TabIndexHack Checked"></div></div>');
  const pg = api.pageInfo(true);
  assert.equal(pg.cur, null);
  assert.equal(pg.grid, true);
  assert.deepEqual(plain(pg.ticked), [{ id: 'T20260925.0001', tid: '1001' }, { id: 'T20261001.0002', tid: '1002' }]);
  close();
});

test("boot: with Autotask's page in a frame (its new layout), the frame says what it shows and the macros run on it", async () => {
  const { window, close } = load({ boot: true, storage: { 'atqm:macro:accounts': ['Northwind Ltd'] } });
  try {
    const doc = window.document;
    const opened = [];
    window.open = (url, name) => { opened.push({ url, name }); return { closed: false, location: {}, close() {} }; };
    // What the copy of the script in the frame tells this page (see reportPage)
    const report = data => window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://ww5.autotask.net', source: window,
      data: { atqm: 'page', ts: Date.now(), cur: null, grid: false, ticket: null, ticked: [], url: 'https://ww5.autotask.net/Mvc/ServiceDesk/x.mvc', ...data } }));
    await sleep(400);
    doc.getElementById('atqm-min').click();
    doc.getElementById('atqm-tab-macros').click();

    // A ticket open in the frame: This ticket
    report({ ticket: A });
    await sleep(300);
    button(doc.getElementById('atqm-panel'), /^Change account$/).click();
    const win = doc.getElementById('atqm-mcwin');
    const way = re => [...win.querySelectorAll('.mcw-way')].find(o => re.test(o.textContent));
    assert.match(way(/This ticket/).textContent, /T20261007\.0081, in this page/);
    assert.ok(way(/This ticket/).querySelector('input').checked);

    // A dashboard widget's list of tickets in the frame, one ticked: no queue, but tickets to change
    report({ grid: true, ticked: [{ id: 'T20261001.0002', tid: '1002' }] });
    await sleep(300);
    assert.match(way(/Ticked in this queue/).textContent, /1 ticked in this list/);
    assert.ok(way(/Ticked in this queue/).querySelector('input').checked);
    assert.ok(way(/This ticket/).querySelector('input').disabled);
    button(win, /^Run$/).click();
    await sleep(50);
    assert.equal(opened.length, 1);
    assert.match(opened[0].url, /TicketDetail\.mvc\?workspace=False&ticketId=1002$/);
  } finally {
    close();
  }
});

test('boot: in a queue, the Macros tab (on the right) is a grid; Change account opens its window and runs on the ticked tickets', async () => {
  const { window, close } = load({
    boot: true,
    html: fixture('queue-grid.html'),
    settings: { dateOrder: 'DMY' },
    storage: {
      'atqm:macro:accounts': ['Northwind Ltd', 'Contoso'],
      'atqm:snap:my-open-tickets': { [A]: { status: 'New', account: 'Example Dental' }, [B]: { status: 'New', account: 'Contoso' } },
    },
  });
  try {
    const doc = window.document;
    const opened = [];
    window.open = (url, name) => { opened.push({ url, name }); return { closed: false, location: {}, close() {} }; };
    await sleep(400);
    assert.equal(doc.querySelector('#atqm-tabs [role=tab]:last-child').id, 'atqm-tab-macros');
    doc.getElementById('atqm-min').click(); // expand the window
    doc.getElementById('atqm-tab-macros').click();
    await sleep(50);
    const panel = doc.getElementById('atqm-panel');
    const squares = [...panel.querySelectorAll('.mc-grid .mc-sq')];
    assert.deepEqual(squares.map(s => s.dataset.macro), ['account', 'new']); // New macro, for the Macro builder, last
    assert.equal(squares[0].textContent, 'Change account');
    assert.equal(doc.getElementById('atqm-mcwin'), null, 'nothing opens until you click one');

    // Its window closes when you leave the Macros tab
    squares[0].click();
    assert.ok(doc.getElementById('atqm-mcwin'));
    assert.ok(squares[0].classList.contains('on'));
    doc.getElementById('atqm-tab-next').click();
    assert.equal(doc.getElementById('atqm-mcwin'), null);
    doc.getElementById('atqm-tab-macros').click();
    button(panel, /^Change account$/).click();
    const win = doc.getElementById('atqm-mcwin');
    assert.match(win.querySelector('.mcw-head').textContent, /Change account/);
    const way = re => [...win.querySelectorAll('.mcw-way')].find(o => re.test(o.textContent));
    const run = button(win, /^Run$/);

    // The account list: the one used last picked, then the other recent ones, then your queues' accounts
    const sel = doc.getElementById('atqm-mc-account');
    assert.equal(sel.value, 'Northwind Ltd');
    assert.deepEqual([...sel.querySelectorAll('optgroup')].map(g => [g.label, [...g.children].map(o => o.value)]),
      [['Used recently', ['Northwind Ltd', 'Contoso']], ['In your queues', ['Example Dental']]]);
    // The types start on Other and Remote Support (used only where the ticket has none)
    assert.equal(doc.getElementById('atqm-mc-subIssue').value, 'Other');
    assert.equal(doc.getElementById('atqm-mc-workType').value, 'Remote Support');

    // Not on a ticket; nothing ticked yet
    assert.match(way(/This ticket/).textContent, /Open a ticket to run it on just that one/);
    assert.ok(way(/This ticket/).querySelector('input').disabled);
    assert.match(way(/Ticked in this queue/).textContent, /Tick tickets in Open Tickets/);
    assert.ok(way(/Ticked in this queue/).querySelector('input').disabled);
    assert.ok(run.disabled);
    assert.match(win.textContent, /Open a ticket, or tick tickets in a queue, to run it/);

    doc.querySelector('input[value="1002"]').click(); // tick it in Autotask's grid, with the window open
    await sleep(1100);
    assert.match(way(/Ticked in this queue/).textContent, /1 ticked in Open Tickets/);
    assert.ok(way(/Ticked in this queue/).querySelector('input').checked);
    assert.equal(run.disabled, false);
    assert.match(win.textContent, /Each ticket opens in a separate tab/);
    sel.value = 'Contoso';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Another Work Type, and the Sub-Issue Type cleared to leave it alone
    const work = doc.getElementById('atqm-mc-workType'), sub = doc.getElementById('atqm-mc-subIssue');
    work.value = 'Onsite';
    work.dispatchEvent(new window.Event('input', { bubbles: true }));
    sub.value = '';
    sub.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(opened.length, 0, 'nothing happens until you press Run');

    // The window redraws meanwhile: what's picked is kept
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'atqm:alerts' }));
    await sleep(200);
    assert.equal(doc.getElementById('atqm-mc-account').value, 'Contoso');
    assert.equal(doc.getElementById('atqm-mc-workType').value, 'Onsite');
    assert.equal(doc.getElementById('atqm-mc-subIssue').value, '');

    // Unticked a moment before Run: it shows that instead of running
    doc.querySelector('input[value="1002"]').click();
    run.click();
    assert.equal(opened.length, 0);
    assert.ok(run.disabled);
    doc.querySelector('input[value="1002"]').click();
    await sleep(1100);
    assert.equal(run.disabled, false);

    run.click();
    run.click(); // a double-click: the second click lands on the window, which has started it already
    assert.match(win.textContent, /Started\./);
    await sleep(450);
    assert.equal(doc.getElementById('atqm-mcwin'), null, 'it closes a moment later');
    assert.equal(opened.length, 1);
    assert.equal(opened[0].name, 'atqm_macro');
    assert.match(opened[0].url, /TicketDetail\.mvc\?workspace=False&ticketId=1002$/);
    const job = JSON.parse(window.localStorage.getItem('atqm:macro'));
    assert.deepEqual(job.items.map(i => [i.id, i.state]), [['T20261001.0002', 'open']]);
    assert.equal(job.here, false);
    assert.deepEqual(job.fill, { workType: 'Onsite' });
    // Contoso is now the one used last, and the Work Type is offered next time
    assert.deepEqual(JSON.parse(window.localStorage.getItem('atqm:macro:accounts')), ['Contoso', 'Northwind Ltd']);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('atqm:macro:fills')), { workType: ['Onsite'] });
    assert.match(panel.textContent, /Changing account to Contoso/);
    assert.match(panel.textContent, /Where the ticket has none: Work Type Onsite/);
    assert.ok(panel.querySelector('.mc-pick').hidden, 'the squares wait until it has finished');
    assert.match(doc.getElementById('atqm-tab-macros').textContent, /Macros \(1 to go\)/);

    // Stop, double-clicked: the second click doesn't press Try again, which takes Stop's place
    const press = (b, n) => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: n }));
    press(button(panel, /^Stop$/), 1);
    assert.ok(JSON.parse(window.localStorage.getItem('atqm:macro')).finished);
    press(button(panel, /^Try again$/), 2);
    assert.ok(JSON.parse(window.localStorage.getItem('atqm:macro')).finished, 'not started again');
    assert.equal(opened.length, 1);
  } finally {
    close();
  }
});

test('boot: on a ticket, Change account in the Macros tab changes just that ticket, in its own page', async () => {
  const { window, close } = load({
    boot: true,
    html: ticketPage(A, 'Fabrikam Ltd'),
    url: 'https://ww5.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?workspace=False&ticketId=111',
    storage: { 'atqm:macro:accounts': ['Northwind Ltd'] },
  });
  try {
    const doc = window.document;
    let opened = 0, edits = 0;
    window.open = () => { opened++; return null; };
    doc.getElementById('edit').addEventListener('click', () => edits++);
    await sleep(400);
    doc.getElementById('atqm-min').click();
    doc.getElementById('atqm-tab-macros').click();
    await sleep(50);
    button(doc.getElementById('atqm-panel'), /^Change account$/).click();
    const win = doc.getElementById('atqm-mcwin');
    const way = re => [...win.querySelectorAll('.mcw-way')].find(o => re.test(o.textContent));
    assert.match(way(/This ticket/).textContent, /T20261007\.0081, in this page/);
    assert.ok(way(/This ticket/).querySelector('input').checked);
    assert.match(way(/Ticked in this queue/).textContent, /Open a queue and tick the tickets/);
    assert.match(win.textContent, /It happens in this page/);

    button(win, /^Run$/).click();
    await sleep(1900); // it lets the page settle before pressing Edit
    assert.equal(opened, 0, 'no new tab for the ticket in front of you');
    assert.equal(edits, 1);
    const job = JSON.parse(window.localStorage.getItem('atqm:macro'));
    assert.equal(job.here, true);
    assert.deepEqual(job.fill, { subIssue: 'Other', workType: 'Remote Support' }); // the types as they start
    assert.deepEqual(job.items.map(i => [i.id, i.state]), [[A, 'edit']]);
    assert.equal(window.sessionStorage.getItem('atqm:macro'), job.id); // the edit page carries on with it
    assert.match(doc.getElementById('atqm-macrobar').textContent, /Leave this page until it's done/);
  } finally {
    close();
  }
});

test('a ticket pop-up without the Queue monitor window gets a Macros button in the corner, with the same squares', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd'), storage: { 'atqm:macro:accounts': ['Northwind Ltd'] } });
  fast(api);
  const doc = window.document;
  api.renderTicketPill();
  let pill = doc.getElementById('atqm-tkpill');
  assert.equal(pill.querySelector('.tk-box').hidden, true);
  button(pill, /^Macros$/).click();
  assert.equal(pill.querySelector('.tk-box').hidden, false);
  button(pill, /^Change account$/).click();
  const win = doc.getElementById('atqm-mcwin');
  assert.equal(win.querySelectorAll('.mcw-way').length, 0, 'a pop-up has only its ticket to run on');
  assert.match(win.querySelector('.mcw-on').textContent, /This ticket: T20261007\.0081, in this page/);
  const sel = doc.getElementById('atqm-mc-account');
  assert.equal(sel.value, 'Northwind Ltd');
  // Any other account can be typed in
  const last = sel.options[sel.options.length - 1];
  sel.value = last.value;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(last.textContent, 'Another account…');
  const other = win.querySelector('.mc-acc input');
  assert.equal(other.hidden, false);
  assert.ok(button(win, /^Run$/).disabled);
  assert.match(win.textContent, /Pick the account to change to/);
  other.value = 'Contoso Ltd';
  other.dispatchEvent(new window.Event('input', { bubbles: true }));
  button(win, /^Run$/).click();
  await sleep(450);
  assert.equal(doc.getElementById('atqm-mcwin'), null);
  assert.equal(api.macroJob().here, true);
  assert.equal(api.macroJob().account, 'Contoso Ltd');
  assert.deepEqual(states(api), ['edit']);
  assert.equal(doc.getElementById('atqm-tkpill'), null, 'the strip along the bottom says what is happening instead');

  // Finished: the corner says how it went
  api.patchMacroItem(A, { state: 'done', filled: ['Work Type'] });
  assert.ok(api.macroJob().finished, 'a job here finishes itself');
  api.renderTicketPill();
  pill = doc.getElementById('atqm-tkpill');
  assert.match(pill.textContent, /Account: Contoso Ltd · Filled in Work Type/);
  button(pill, /^OK$/).click();
  assert.equal(api.macroJob(), null);
  assert.equal(api.get('atqm:macro:accounts', [])[0], 'Contoso Ltd');
  assert.equal(pill.querySelector('.tk-open').hidden, false, 'back to the Macros button');
  close();
});

test('the ticket pop-ups\' Macros button can be turned off, though a macro run there still says how it went', () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Northwind Ltd'), settings: { ticketMacroButton: false } });
  const doc = window.document;
  api.renderTicketPill();
  assert.equal(doc.getElementById('atqm-tkpill'), null);
  api.set('atqm:macro', { id: 'job6', kind: 'account', account: 'Northwind Ltd', fill: {}, by: 'x', ts: NOW, here: true, finished: NOW,
    items: [{ id: A, tid: '111', state: 'done', at: NOW, note: '' }] });
  api.renderTicketPill();
  assert.match(doc.getElementById('atqm-tkpill').textContent, /Account: Northwind Ltd/);
  button(doc.getElementById('atqm-tkpill'), /^OK$/).click();
  assert.equal(doc.getElementById('atqm-tkpill'), null);
  close();
});

test('a macro that asks for nothing runs from its square on a double-click; one click only opens its window', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd') });
  const doc = window.document;
  const ran = [];
  api.MACROS.push({ id: 'test', name: 'Test macro', about: 'Does a test thing.', params: [], start: (v, way) => ran.push(plain(way.tickets)) });
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  const sq = pill.querySelector('[data-macro=test]');
  assert.match(sq.textContent, /Double-click to run/);
  const click = n => sq.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: n }));
  const dblclick = () => { click(1); click(2); sq.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, detail: 2 })); };

  // One click: its window, a moment later in case it's a double-click; nothing runs
  click(1);
  assert.equal(doc.getElementById('atqm-mcwin'), null);
  await sleep(400);
  const win = doc.getElementById('atqm-mcwin');
  assert.match(win.textContent, /This ticket: T20261007\.0081/);
  assert.equal(button(win, /^Run$/).disabled, false);
  assert.deepEqual(ran, []);
  // Esc closes just the window, back to its square
  win.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.getElementById('atqm-mcwin'), null);
  assert.equal(doc.activeElement, sq);
  assert.equal(pill.querySelector('.tk-box').hidden, false);

  // A double-click runs it straight away, on this ticket, without its window
  dblclick();
  await sleep(400);
  assert.deepEqual(ran, [[{ id: A }]]);
  assert.equal(doc.getElementById('atqm-mcwin'), null);

  // Not while another macro is running: its window opens to say so
  api.set('atqm:macro', { id: 'j2', kind: 'account', account: 'Contoso', by: 'elsewhere', ts: NOW, items: [{ id: B, state: 'open', at: NOW, note: '' }] });
  api.renderTicketPill();
  button(pill, /^Macros$/).click();
  dblclick();
  await sleep(400);
  assert.deepEqual(ran, [[{ id: A }]]);
  assert.match(doc.getElementById('atqm-mcwin').textContent, /Another macro is running/);
  assert.ok(button(doc.getElementById('atqm-mcwin'), /^Run$/).disabled);
  close();
});

// ---- Macros you build (the Macro builder): their blocks, run on Autotask's pages ----

// A job for a macro you built, part-way through, as the macro tab finds it
const customJob = (state, steps, more = {}) => ({
  'atqm:macro': { id: 'job8', kind: 'custom', macro: 'm1', name: 'Password reset', steps, by: 'elsewhere', ts: NOW,
    items: [{ id: A, tid: '111', state, at: NOW, note: '', ...more }, { id: B, tid: null, state: 'waiting', note: '' }] },
});
const statusIs = value => ({ type: 'onlyIf', field: 'Status', op: 'is', value });
const PWR = { type: 'speedCode', code: 'PWR' };
// The edit page with the speed code box's list (closed): a heading, then a line per speed code, its code and its
// template's name. And a Status, and a Purchase Order Number (a plain box, no list).
const SPEED_CODES = [['PWR', 'Password reset'], ['PWRX', 'Password reset (external)'], ['NEWU', 'New user']];
const speedCodePage = opts => realEditPage(opts)
  .replace('Choose Template</span></div></div></div></div>', 'Choose Template</span></div></div></div></div>' +
    '<div class="ContextOverlayContainer" id="codes" style="display:none"><div class="ContextOverlay SingleItemSelectorDropDownOverlay"><div class="Content">' +
    '<div class="ItemSet"><div class="ItemList"><div class="Item" data-item-type="Default" data-index="0"><div class="Text"><span></span></div></div>' +
    '<div class="Item GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">Company</div></div>' +
    SPEED_CODES.map(([c, n], i) => `<div class="Item" data-item-type="SingleText" data-index="${i + 1}"><div class="Text"><span>${c} - ${n}</span></div></div>`).join('') +
    '</div></div></div></div></div>')
  .replace(editorLabel('Contact') + dataPicker('con', 'Jane Doe'), editorLabel('Contact') + dataPicker('con', 'Jane Doe') +
    editorLabel('Status') + itemPicker('status', 'New', ['New', 'In Progress', 'Complete']) +
    editorLabel('Purchase Order Number') + '<div class="Size1"><input type="text" class="TextBox2" maxlength="50" id="po"></div>');
// How the speed code box behaves: typing opens its list; picking a line closes it and applies its template (apply).
// Returns what was typed into it.
function speedCodes(doc, apply = () => {}) {
  const input = doc.querySelector('.FormTemplateSelector input'), list = doc.getElementById('codes'), typed = [];
  input.addEventListener('input', () => { if (input.value) typed.push(input.value); list.style.display = input.value ? '' : 'none'; });
  for (const item of list.querySelectorAll('.Item[data-item-type=SingleText]')) {
    item.addEventListener('click', () => { list.style.display = 'none'; input.value = ''; apply(item.textContent); });
  }
  return typed;
}

test('a macro you build: on the ticket page its Only if is checked, then Edit is pressed for the blocks on the edit page', async () => {
  const run = async (opts, steps = [statusIs('New, In Progress'), PWR]) => {
    const env = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd', opts), storage: customJob('open', steps) });
    fast(env.api);
    let edits = 0;
    env.window.document.getElementById('edit').addEventListener('click', () => edits++);
    await env.api.macroWork();
    const out = { item: plain(env.api.macroJob().items[0]), edits, bar: env.window.document.getElementById('atqm-macrobar')?.textContent };
    env.close();
    return out;
  };
  let r = await run({ status: 'In Progress' });
  assert.deepEqual([r.item.state, r.item.step, r.edits], ['edit', 1, 1]);
  assert.match(r.bar, /running Password reset on T20261007\.0081 \(1 of 2\)/);
  r = await run({ status: 'Waiting Customer' });
  assert.deepEqual([r.item.state, r.item.note, r.edits], ['skipped', 'Status is Waiting Customer', 0]);
  r = await run({ status: 'Complete' }, [{ type: 'onlyIf', field: 'Status', op: 'not', value: 'Complete, Cancelled' }, PWR]);
  assert.deepEqual([r.item.state, r.edits], ['skipped', 0]);
  r = await run({ status: 'New' }, [{ type: 'onlyIf', field: 'Work Type', op: 'empty', value: '' }, PWR]);
  assert.deepEqual([r.item.state, r.item.note], ['skipped', 'Work Type is Remote Support']);
  // No Status on this ticket's page: it can't be checked, so the ticket fails rather than being changed
  r = await run({});
  assert.deepEqual([r.item.state, r.item.note, r.edits], ['failed', "Couldn't find the Status field on the ticket's page", 0]);
});

test("a macro you build: a field only filled in where it's empty is read off the ticket first; with nothing to do, it isn't edited", async () => {
  const steps = [{ type: 'setField', field: 'Work Type', value: 'Onsite', empty: true }];
  const has = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd'), storage: customJob('open', steps) });
  fast(has.api);
  let edits = 0;
  has.window.document.getElementById('edit').addEventListener('click', () => edits++);
  await has.api.macroWork();
  const item = plain(has.api.macroJob().items[0]);
  assert.deepEqual([item.state, item.note, edits], ['skipped', 'Nothing to change: it has Work Type', 0]);
  has.close();

  const none = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd', { workType: '' }), storage: customJob('open', steps) });
  fast(none.api);
  await none.api.macroWork();
  const it = plain(none.api.macroJob().items[0]);
  assert.deepEqual([it.state, it.step, it.had], ['edit', 0, { 0: '' }]);
  none.close();
});

test('a macro you build, on the edit page: a speed code picked from the speed code box, fields set, then plain Save', async () => {
  const steps = [PWR, { type: 'setField', field: 'Status', value: 'In Progress' }, { type: 'setField', field: 'Purchase Order Number', value: 'PO-1' },
    { type: 'setField', field: 'Work Type', value: 'Onsite', empty: true }];
  const { api, window, close } = load({ now: NOW, name: 'atqm_macro', html: speedCodePage(), storage: customJob('edit', steps, { step: 0 }) });
  fast(api);
  const doc = window.document;
  autotaskPickers(doc);
  // Its template fills in a Sub-Issue Type
  const applied = [];
  const typed = speedCodes(doc, line => {
    applied.push(line);
    doc.querySelector('#sub .SelectionDisplay').innerHTML = '<div class="Item" data-item-type="SingleText"><div class="Text"><span>Hardware</span></div></div>';
  });
  let saved = '';
  for (const id of ['save', 'saveclose']) doc.getElementById(id).addEventListener('click', () => { saved = id; doc.getElementById(id).remove(); });
  await api.macroWork();
  assert.deepEqual(typed, ['PWR']);
  assert.deepEqual(applied, ['PWR - Password reset'], "the line for that code, not PWRX's");
  assert.equal(doc.querySelector('#status .SelectionDisplay').textContent, 'In Progress', 'from its own list');
  assert.equal(doc.getElementById('po').value, 'PO-1', 'typed into the plain box');
  assert.equal(doc.querySelector('#work .Chip').textContent, 'Remote Support', 'kept: it has one');
  assert.equal(saved, 'save', 'plain Save: Save & Close would go on to close the ticket');
  const item = plain(api.macroJob().items[0]);
  assert.deepEqual([item.state, item.step, item.did, item.kept, item.picks],
    ['verify', 4, ['Speed code PWR', 'Status: In Progress', 'Purchase Order Number: PO-1'], ['Work Type'], { 1: 'In Progress', 2: 'PO-1' }]);
  close();
});

test("a macro you build: a speed code Autotask doesn't offer, or a question after picking it, fails the ticket unsaved", async () => {
  const run = async (code, apply) => {
    const env = load({ now: NOW, name: 'atqm_macro', html: speedCodePage(), storage: customJob('edit', [{ type: 'speedCode', code }], { step: 0 }) });
    fast(env.api);
    const doc = env.window.document;
    speedCodes(doc, () => apply?.(doc));
    let saves = 0;
    doc.getElementById('save').addEventListener('click', () => saves++);
    await env.api.macroWork();
    const out = { ...plain(env.api.macroJob().items[0]), saves };
    env.close();
    return out;
  };
  let r = await run('XYZ');
  assert.deepEqual([r.state, r.note, r.saves], ['failed', 'Autotask didn\'t offer a speed code called "XYZ" (tried 3 times)', 0]);
  r = await run('PWR', doc => doc.body.insertAdjacentHTML('beforeend', '<div class="Dialog" role="dialog">Replace the values already on the ticket?' +
    '<div class="Button2"><div class="Text2">Yes</div></div><div class="Button2"><div class="Text2">No</div></div></div>'));
  assert.deepEqual([r.state, r.saves], ['failed', 0]);
  assert.match(r.note, /^Autotask asked "Replace the values already on the ticket\?/);
  // Without the speed code box (a page built another way): says so
  const bare = load({ now: NOW, name: 'atqm_macro', html: realEditPage().replace(/<div class="FormTemplateSelector">/, '<div class="Other">'),
    storage: customJob('edit', [PWR], { step: 0 }) });
  fast(bare.api);
  await bare.api.macroWork();
  assert.equal(bare.api.macroJob().items[0].note, "Couldn't find the speed code box on the edit page");
  bare.close();
  // The edit page loaded again while a block was under way: not done again (it could go round for ever), not saved
  const again = load({ now: NOW, name: 'atqm_macro', html: speedCodePage(), storage: customJob('edit', [PWR], { step: 0, doing: 0 }) });
  fast(again.api);
  const typed = speedCodes(again.window.document);
  await again.api.macroWork();
  assert.deepEqual(plain([again.api.macroJob().items[0].state, again.api.macroJob().items[0].note, typed]),
    ['failed', "The edit page loaded again part-way through step 1, so the ticket wasn't saved", []]);
  again.close();
});

test("a macro you build, after Save: the ticket's page is checked for the fields it set, then the blocks after it carry on", async () => {
  const steps = [{ type: 'setField', field: 'Sub-Issue Type', value: 'Hardware' }, statusIs('New'), PWR];
  const after = (opts, item, s = steps) => {
    const env = load({ now: NOW, name: 'atqm_macro', html: ticketPage(A, 'Fabrikam Ltd', opts), storage: customJob('verify', s, item) });
    fast(env.api);
    env.edits = 0;
    env.window.document.getElementById('edit').addEventListener('click', () => env.edits++);
    return env;
  };
  // Saved, and the ticket shows it: on to the Only if, and Edit again for the speed code
  const on = after({ subIssue: 'Hardware', status: 'New' }, { step: 1, picks: { 0: 'Hardware' }, did: ['Sub-Issue Type: Hardware'] });
  await on.api.macroWork();
  const item = plain(on.api.macroJob().items[0]);
  assert.deepEqual([item.state, item.step, item.did, on.edits], ['edit', 2, ['Sub-Issue Type: Hardware'], 1]);
  on.close();
  // It shows something else: Check it
  const off = after({ subIssue: 'Other', status: 'New' }, { step: 1, picks: { 0: 'Hardware' } });
  await off.api.macroWork();
  assert.deepEqual(plain([off.api.macroJob().items[0].state, off.api.macroJob().items[0].note]),
    ['check', 'Saved, but Sub-Issue Type shows "Other" instead of Hardware']);
  off.close();
  // Its last block done: done
  const done = after({}, { step: 1, did: ['Speed code PWR'] }, [PWR]);
  await done.api.macroWork();
  assert.deepEqual(plain([done.api.macroJob().items[0].state, done.edits]), ['done', 0]);
  done.close();
  // A page from before Save (Autotask edited it in a window of its own): left for the driving page to load again
  const old = after({}, { step: 1, at: NOW + 5000 }, [PWR]);
  await old.api.macroWork();
  assert.equal(old.api.macroJob().items[0].state, 'verify');
  old.close();
});

test('a macro you build runs from its square: its window asks for what it asks each time, and the job carries its blocks', async () => {
  const { api, window, close } = load({ now: NOW, html: ticketPage(A, 'Fabrikam Ltd', { status: 'New' }) });
  fast(api);
  api.saveMacroDefs([{ id: 'm1', name: 'Password reset', blocks: [statusIs('New'), { ...PWR, ask: true }, { type: 'setField', field: 'Status', value: 'In Progress' }] }]);
  const doc = window.document;
  let edits = 0;
  doc.getElementById('edit').addEventListener('click', () => edits++);
  api.renderTicketPill();
  const pill = doc.getElementById('atqm-tkpill');
  button(pill, /^Macros$/).click();
  pill.querySelector('[data-macro="c:m1"]').click();
  const win = doc.getElementById('atqm-mcwin');
  assert.deepEqual([...win.querySelectorAll('.mcw-steps li')].map(li => li.textContent),
    ['Only if Status is New', 'Speed code (asked each time)', 'Set Status to In Progress']);
  const code = doc.getElementById('atqm-mc-b1');
  assert.equal(win.querySelector('label[for=atqm-mc-b1]').textContent, 'Speed code');
  assert.equal(code.value, 'PWR', 'starts on what the macro has');
  const typeIn = v => { code.value = v; code.dispatchEvent(new window.Event('input', { bubbles: true })); };
  typeIn('');
  assert.ok(button(win, /^Run$/).disabled);
  assert.match(win.textContent, /Fill in Speed code\./);
  typeIn(' NEWU ');
  button(win, /^Run$/).click();
  await sleep(50);
  const job = plain(api.macroJob());
  assert.deepEqual([job.kind, job.name, job.here, job.steps], ['custom', 'Password reset', true,
    [statusIs('New'), { type: 'speedCode', code: 'NEWU' }, { type: 'setField', field: 'Status', value: 'In Progress', empty: false }]]);
  assert.deepEqual([job.items[0].state, job.items[0].step, edits], ['edit', 1, 1], 'checked, then Edit, right here');
  assert.deepEqual(plain(api.get('atqm:macro:codes', [])), ['NEWU'], 'offered next time');

  // Done: the corner says what it did
  api.patchMacroItem(A, { state: 'done', did: ['Speed code NEWU', 'Status: In Progress'] });
  api.renderTicketPill();
  assert.match(doc.getElementById('atqm-tkpill').textContent, /Password reset: Speed code NEWU · Status: In Progress/);
  // Try again runs the same blocks, values and all
  api.patchMacroItem(A, { state: 'failed' });
  api.retryMacro(api.macroJob());
  assert.deepEqual(plain(api.macroJob().steps), job.steps);
  assert.equal(api.macroJob().kind, 'custom');
  close();
});
