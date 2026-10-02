'use strict';
process.env.TZ = 'UTC'; // "this PC" is on UTC, so expected times are plain Date.UTC values
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, setNow } = require('./harness');

const at = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

test('day/month dates', () => {
  const { api, close } = load({ settings: { dateOrder: 'DMY' } });
  assert.equal(api.parseDate('02/10/2026 10:55'), at(2026, 10, 2, 10, 55));
  assert.equal(api.parseDate('2/10/26'), at(2026, 10, 2));
  assert.equal(api.parseDate('25.12.2026 08:05'), at(2026, 12, 25, 8, 5));
  // textContent joins separate date and time elements with no space
  assert.equal(api.parseDate('02/10/202610:55'), at(2026, 10, 2, 10, 55));
  close();
});

test('month/day dates with AM/PM', () => {
  const { api, close } = load({ settings: { dateOrder: 'MDY' } });
  assert.equal(api.parseDate('10/02/2026 10:55 PM'), at(2026, 10, 2, 22, 55));
  assert.equal(api.parseDate('10/02/2026 12:05 a.m.'), at(2026, 10, 2, 0, 5));
  assert.equal(api.parseDate('10/02/2026 12:30 PM'), at(2026, 10, 2, 12, 30));
  close();
});

test('year-first dates are read the same whatever the setting', () => {
  for (const dateOrder of ['DMY', 'MDY', 'YMD']) {
    const { api, close } = load({ settings: { dateOrder } });
    // The old parser read this as 26 Oct 2002
    assert.equal(api.parseDate('2026-10-02 10:55'), at(2026, 10, 2, 10, 55), dateOrder);
    close();
  }
});

test('impossible dates and times give null instead of rolling over', () => {
  const { api, close } = load({ settings: { dateOrder: 'DMY' } });
  assert.equal(api.parseDate('10/25/2026'), null);       // month 25 (a US date read as UK)
  assert.equal(api.parseDate('30/02/2026'), null);       // 30 February
  assert.equal(api.parseDate('02/10/2026 24:10'), null);
  assert.equal(api.parseDate('02/10/2026 13:05 PM'), null);
  assert.equal(api.parseDate(''), null);
  assert.equal(api.parseDate('None'), null);
  assert.equal(api.parseDate('1/2/5'), null);            // 1-digit year
  close();
});

test('detectDateOrder', () => {
  const { api, close } = load();
  assert.equal(api.detectDateOrder(['02/10/2026', '25/09/2026']), 'DMY');
  assert.equal(api.detectDateOrder(['10/02/2026', '09/25/2026 10:00 AM']), 'MDY');
  assert.equal(api.detectDateOrder(['02/10/2026', '03/10/2026']), null); // ambiguous
  assert.equal(api.detectDateOrder(['2026-10-02']), 'YMD');
  assert.equal(api.detectDateOrder(['25/09/2026', '09/25/2026']), null); // contradicts itself
  assert.equal(api.detectDateOrder(['', 'None']), null);
  close();
});

test('auto: guesses from the browser language until a date settles it', () => {
  const { api, close } = load({ language: 'en-US' });
  assert.equal(api.CONFIG.dateOrder, 'auto');
  assert.equal(api.dateOrder(), 'MDY');
  api.learnDateOrder(['02/10/2026', '25/09/2026']);
  assert.equal(api.dateOrder(), 'DMY');
  assert.equal(api.parseDate('02/10/2026'), at(2026, 10, 2));
  close();

  const gb = load({ language: 'en-GB' });
  assert.equal(gb.api.dateOrder(), 'DMY');
  gb.close();
});

test('Autotask time zone converts to real time, across daylight saving changes', () => {
  const ny = load({ settings: { dateOrder: 'DMY', timeZone: 'America/New_York' } });
  assert.equal(ny.api.parseDate('31/10/2026 10:00'), at(2026, 10, 31, 14, 0)); // EDT, UTC-4
  assert.equal(ny.api.parseDate('02/11/2026 10:00'), at(2026, 11, 2, 15, 0));  // EST, UTC-5
  ny.close();

  const london = load({ settings: { dateOrder: 'DMY', timeZone: 'Europe/London' } });
  assert.equal(london.api.parseDate('28/03/2026 09:00'), at(2026, 3, 28, 9, 0)); // GMT
  assert.equal(london.api.parseDate('30/03/2026 09:00'), at(2026, 3, 30, 8, 0)); // BST, UTC+1
  london.close();

  const bad = load({ settings: { dateOrder: 'DMY', timeZone: 'Not/AZone' } });
  assert.equal(bad.api.parseDate('02/10/2026 10:55'), at(2026, 10, 2, 10, 55)); // falls back to this PC
  bad.close();
});

test('clock check: new tickets created hours away from now raise a time zone warning', () => {
  const now = at(2026, 10, 2, 12, 0);
  const { api, window, close } = load({ now });
  assert.equal(api.clockWarning(), null);

  // Three arrivals in a row all about 5 hours old: Autotask shows a zone 5 h behind this PC
  api.checkClock([{ created: now - 5 * 3600000 }], now);
  api.checkClock([{ created: now - 5 * 3600000 - 4 * 60000 }], now);
  assert.equal(api.clockWarning(), null);
  api.checkClock([{ created: now - 5 * 3600000 + 3 * 60000 }], now);
  assert.match(api.clockWarning(), /about 5 h behind/);

  // A ticket created a couple of minutes ago means the clocks agree after all
  api.checkClock([{ created: now - 2 * 60000 }], now);
  assert.equal(api.clockWarning(), null);

  // Created in the future: Autotask is ahead
  setNow(window, now);
  api.checkClock([{ created: now + 2 * 3600000 }], now);
  assert.match(api.clockWarning(), /about 2 h ahead of/);
  close();
});
