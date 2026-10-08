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
const fast = api => Object.assign(api.MACRO, { settle: 0, pick: 500, saved: 500 });

// The ticket page, built as Autotask builds it (see docs/autotask-pages.md): the title bar, the Edit button,
// and read-only fields, label then value. A note's Save is on the page too, and isn't the edit page's.
const field = (label, value) => '<div class="ReadOnlyData QuickEditEnabled"><div class="ReadOnlyLabelContainer"><div class="LabelContainer1">' +
  `<div class="Text ClickEnabled"><span class="PrimaryText">${label}</span></div><div class="Required">*</div><div class="WalkMeIconPlaceholder"></div></div></div>` +
  `<div class="ReadOnlyValueContainer"><div class="Value">${value}</div></div></div>`;
const linkTo = text => `<div class="LinkButtonWrapper2"><div class="LinkButton2" tabindex="0"><div class="Text2">${text}</div></div></div>`;
const ticketPage = (id, account, { contact = 'Jo Bloggs', subIssue = 'Other', workType = 'Remote Support' } = {}) => '<!doctype html><body>' +
  `<div class="TitleBarItem Title"><span class="Text">Ticket </span><span class="SecondaryText">- ${id} - Laptop</span></div>` +
  '<div class="ToolBar"><div class="Button2 ButtonIcon2 NormalBackground" id="edit" tabindex="0"><div class="Spacer"></div>' +
  '<div class="Icon2"><div class="StandardButtonIcon Edit"></div></div><div class="Text2">Edit</div><div class="Spacer"></div></div></div>' +
  '<div class="ReadOnlyDetailsContainer">' + field('Account', linkTo(account)) + field('Contact', linkTo(contact)) +
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
  assert.equal(none.api.macroJob().items[0].note, 'Autotask didn\'t offer an account called "Northwind Ltd"');
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
  assert.equal(none.api.macroJob().items[0].note, 'Autotask didn\'t offer a Work Type called "Onsite"');
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

test('the tickets ticked in a queue grid, with their internal IDs', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html') });
  assert.deepEqual(plain(api.tickedTickets()), []);
  window.document.querySelector('input[value="1002"]').checked = true;
  assert.deepEqual(plain(api.tickedTickets()), [{ id: 'T20261001.0002', tid: '1002' }]);
  close();
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
    assert.deepEqual(squares.map(s => s.textContent), ['Change account']);
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
    // The types are blank to start with: left alone unless you fill them in
    assert.equal(doc.getElementById('atqm-mc-subIssue').value, '');
    assert.equal(doc.getElementById('atqm-mc-workType').value, '');

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
    const work = doc.getElementById('atqm-mc-workType');
    work.value = 'Remote Support';
    work.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(opened.length, 0, 'nothing happens until you press Run');

    // The window redraws meanwhile: what's picked is kept
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'atqm:alerts' }));
    await sleep(200);
    assert.equal(doc.getElementById('atqm-mc-account').value, 'Contoso');
    assert.equal(doc.getElementById('atqm-mc-workType').value, 'Remote Support');

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
    assert.deepEqual(job.fill, { workType: 'Remote Support' });
    // Contoso is now the one used last, and the Work Type is offered next time
    assert.deepEqual(JSON.parse(window.localStorage.getItem('atqm:macro:accounts')), ['Contoso', 'Northwind Ltd']);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('atqm:macro:fills')), { workType: ['Remote Support'] });
    assert.match(panel.textContent, /Changing account to Contoso/);
    assert.match(panel.textContent, /Where the ticket has none: Work Type Remote Support/);
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
    assert.deepEqual(job.fill, {});
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
