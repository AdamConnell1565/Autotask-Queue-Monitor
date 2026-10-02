'use strict';
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const at = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);
// Objects made inside the jsdom page have that page's prototypes; compare them as plain data
const plain = v => JSON.parse(JSON.stringify(v));

test('readGrid reads tickets, links and dates from a queue grid', () => {
  const { api, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const grid = api.readGrid();
  assert.equal(grid.rowCount, 2);
  assert.equal(grid.tickets.length, 2);
  const [a, b] = grid.tickets;
  assert.equal(a.id, 'T20260925.0001');
  assert.equal(a.title, 'Printer offline in reception');
  assert.equal(a.status, 'New');
  assert.equal(a.account, 'Example Dental');
  assert.equal(a.priority, 'High');
  assert.equal(a.slaEvent, 'First Response');
  assert.equal(a.due, at(2026, 10, 2, 10, 55));
  assert.equal(a.frDue, a.due); // the next SLA event is the first response
  assert.equal(a.created, at(2026, 9, 25, 9, 15));
  assert.equal(a.tid, '1001');
  assert.match(a.url, /TicketDetail\.mvc\?workspace=False&ticketId=1001$/);
  assert.equal(b.frDue, null);
  assert.equal(b.due, at(2026, 10, 6, 17, 0));
  close();
});

test('readGrid teaches the date order before reading any date', () => {
  // en-US would guess month/day, but 25/09/2026 can only be day/month
  const { api, close } = load({ html: fixture('queue-grid.html'), language: 'en-US' });
  assert.equal(api.dateOrder(), 'MDY');
  const grid = api.readGrid();
  assert.equal(api.dateOrder(), 'DMY');
  assert.equal(grid.tickets[0].due, at(2026, 10, 2, 10, 55));
  close();
});

test('pager and coverage', () => {
  const { api, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const pi = api.pagerInfo();
  assert.deepEqual({ from: pi.from, to: pi.to, total: pi.total, size: pi.size, max: pi.max },
    { from: 1, to: 2, total: 5, size: 50, max: 500 });
  assert.deepEqual(plain(api.coverage(api.readGrid())), { total: 5, partial: true, max: 500, size: 50 });
  close();
});

test('missingColumns', () => {
  const { api, window, close } = load({ html: fixture('queue-grid.html') });
  const my = api.trackedQueues()[0];
  assert.deepEqual(plain(api.missingColumns(my)), []);
  assert.deepEqual(plain(api.missingColumns({ mode: 'calls' })), ['start', 'end', 'description']);
  // Drop the Next SLA Event Due column from the header
  const heading = window.document.querySelector('tr.Heading');
  heading.cells[8].textContent = '';
  assert.deepEqual(plain(api.missingColumns(my)), ['slaDue']);
  close();
});

test('the queue menu and the selected queue', () => {
  const { api, close } = load({ html: fixture('queue-grid.html') });
  const names = plain(api.navItems().map(i => i.name));
  assert.deepEqual(names, ['Open Tickets', 'Service Calls', 'Support 1st Line']);
  assert.equal(api.navItems().find(i => i.name === 'Support 1st Line').count, 6);
  // Second search uses the cached menu and finds the same entries
  assert.deepEqual(plain(api.navItems().map(i => i.name)), names);
  assert.deepEqual(plain(api.currentQueue()), { nav: 'Open Tickets', section: 'My Workspace' });
  close();
});

test('readCallGrid', () => {
  const { api, close } = load({ html: fixture('service-calls.html'), settings: { dateOrder: 'DMY' } });
  const { calls, rowCount } = api.readCallGrid();
  assert.equal(rowCount, 2);
  assert.deepEqual(plain(calls.map(c => c.id)), ['501', '502']);
  assert.equal(calls[0].start, at(2026, 10, 2, 14, 0));
  assert.equal(calls[0].end, at(2026, 10, 2, 15, 0));
  assert.equal(calls[1].end, calls[1].start + 30 * 60000); // no end time: assume 30 minutes
  assert.match(calls[0].url, /service_call\.aspx\?service_call_id=501$/);
  close();
});

test('diagnostics never include ticket titles or account names', () => {
  const { api, close } = load({ html: fixture('queue-grid.html'), settings: { dateOrder: 'DMY' } });
  const d = api.diagnose();
  assert.equal(d.rows, 2);
  assert.equal(d.ticketsRead, 2);
  assert.equal(d.queue, 'My Workspace > Open Tickets');
  assert.ok(d.columns.includes('Next SLA Event Due'));
  assert.deepEqual(plain(d.pager), { from: 1, to: 2, total: 5, size: 50, max: 500 });
  assert.ok(d.sampleDates.length > 0);
  const text = JSON.stringify(d);
  for (const secret of ['Printer offline', 'Example Dental', 'New starter', 'Sample Solicitors']) {
    assert.ok(!text.includes(secret), secret);
  }
  close();
});
