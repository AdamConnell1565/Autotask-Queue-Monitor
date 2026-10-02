// ==UserScript==
// @name         Autotask Queue Monitor
// @namespace    autotask
// @version      0.7.1
// @description  Track any My Workspace & Queues queue (My queue by default) in its own tab, with a live overview on every Autotask page
// @match        *://*.autotask.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const VERSION = '0.7.1';
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ---------------------------------------------------------------------------
  // Default settings (editable in the widget's Settings tab; saved per browser)
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    refreshMs: 120000,            // refresh + scan interval in each monitoring tab
    postRefreshTimeoutMs: 15000,  // max wait for the grid to re-render after refresh
    maxAlerts: 300,               // change history kept
    displayAlerts: 40,            // changes shown in the widget
    upcomingCount: 6,             // rows shown in each overview list
    showStatusCounts: false,      // status count chips on "all changes" queues
    firstLineOverview: false,     // "Next up" tab: what to do next, in priority order
    dueSoonMinutes: 60,           // "SLA due soon" threshold (all-changes queues)
    frSoonMinutes: 15,            // "first response due soon" threshold (new-ticket queues)
    pausedStatuses: 'Scheduled',  // ticket statuses where the SLA clock is paused (e.g. waiting for a service call)
    autoColumns: true,            // add missing columns via the grid's Column Chooser
    dateOrder: 'DMY',             // 'DMY' (UK) or 'MDY' (US)
    linkStyle: 'detail',          // 'detail' = normal ticket page; 'command' = Autotask open-ticket command; 'grid' = grid's own link
    serviceCalls: false,          // allow tracking My Workspace > Service Calls
    callReminders: true,          // ping before / during scheduled calls
    callLeadTimes: '15, 10, 5, 0',// minutes before start to ping
    callPingAfterStart: true,     // keep pinging every minute after start until dismissed or the call ends
    opacity: 100,                 // window opacity (%) when expanded
    opacityMin: 85,               // window opacity (%) when minimised
    lockMonitorTabs: true,        // monitoring tabs: big centred window, page greyed out and not clickable
    notify: true,
    sound: true,
    hideInPopups: true,
    knownStatuses: [              // fallback only, if no Status column header is found
      'New', 'In Progress', 'Waiting Customer', 'Waiting Materials', 'Waiting Vendor',
      'Scheduled', 'Escalate', 'Dispatched', 'Customer Note Added', 'Complete',
    ],
  };

  const MODES = {
    full: { label: 'All changes', hint: 'New tickets, status changes, tickets leaving, SLAs' },
    intake: { label: 'New & first response', hint: 'New arrivals and first response SLAs only' },
    calls: { label: 'Service calls', hint: 'Your scheduled service calls, with reminders' },
  };

  // ---------------------------------------------------------------------------
  // Storage (localStorage is shared by every Autotask tab on the same domain)
  // ---------------------------------------------------------------------------
  const P = 'atqm:';
  const K = {
    enabled: P + 'enabled',
    alerts: P + 'alerts',
    pos: P + 'pos',
    min: P + 'min',
    tab: P + 'tab',
    scanReq: P + 'scanreq',
    settings: P + 'settings',
    queues: P + 'queues',
    dismissed: P + 'calls:dismissed', // call id -> time you pressed Dismiss
    pings: P + 'calls:pings',         // call id -> last reminder sent
    colTried: P + 'columns:tried',    // queue + missing columns -> last time we tried to add them
    qsSnooze: P + 'quickstart:snooze',// Quick start prompt hidden until this time
    moveReq: P + 'quickstart:move',   // "move all queue tabs to the window this request came from"
  };

  const CONFIG = { ...DEFAULTS };
  const ID = Math.random().toString(36).slice(2);
  const TICKET_RE = /\bT\d{8}\.\d{3,5}(?:\.\d{3})?\b/;
  const STATUS_SET = new Set(DEFAULTS.knownStatuses.map(s => s.toLowerCase()));
  const RANK = { ok: 0, soon: 1, overdue: 2 };
  const staleMs = () => CONFIG.refreshMs * 2.5;

  const get = (k, d) => {
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
    catch { return d; }
  };
  const set = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('[ATQM] storage write failed', e); }
  };
  const del = k => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // innerText keeps the break between "02/10/2026" and "10:55" when they're separate elements
  const cellText = c => (c ? clean(c.innerText ?? c.textContent) : '');

  function loadSettings() { Object.assign(CONFIG, DEFAULTS, get(K.settings, {})); }
  { // 5.11: the command link turned out to pop out too; move anyone on it to the ticket page link once
    const st = get(K.settings, null);
    if (st && st.linkStyle === 'command' && !st.linkV2) set(K.settings, { ...st, linkStyle: 'detail', linkV2: true });
  }
  loadSettings();

  // ---------------------------------------------------------------------------
  // Tracked queues (per person / per browser). My queue is tracked by default.
  // ---------------------------------------------------------------------------
  const MY_QUEUE = { key: 'my', nav: 'Open Tickets', section: 'My Workspace', mode: 'full' };

  // Migrate from older versions (fixed My queue + optional first line mode)
  if (localStorage.getItem('AT_QUEUE_MONITOR_ENABLED') === 'true' && get(K.enabled, null) === null) set(K.enabled, true);
  ['AT_QUEUE_SNAPSHOT', 'AT_QUEUE_ALERTS', 'AT_QUEUE_MONITOR_ENABLED', P + 'meta:my-open-tickets'].forEach(del);
  if (!get(K.queues, null)) {
    const list = [MY_QUEUE];
    if (get(K.settings, {}).firstLineMode) {
      list.push({ key: 'first', nav: 'Support 1st Line', section: get(P + 'state:first-line', {}).section || '', mode: 'intake' });
    }
    set(K.queues, list);
  }

  // Storage keys per queue (older keys kept for My queue and 1st line so history carries over)
  function qStore(q) {
    if (q.key === 'my') return { snap: P + 'snap:my-open-tickets', lock: P + 'lock:my-open-tickets', state: P + 'state', seen: P + 'seen:my' };
    if (q.key === 'first') return { snap: P + 'snap:first-line', lock: P + 'lock:first-line', state: P + 'state:first-line', seen: P + 'seen:first-line' };
    return { snap: P + 'snap:q:' + q.key, lock: P + 'lock:q:' + q.key, state: P + 'state:q:' + q.key, seen: P + 'seen:q:' + q.key };
  }

  function trackedQueues() {
    const list = get(K.queues, [MY_QUEUE]);
    return list.map(q => ({ ...q, ...qStore(q) }));
  }
  // Queues in use right now (a tracked Service Calls page is ignored while that setting is off)
  const activeQueues = () => trackedQueues().filter(q => q.mode !== 'calls' || CONFIG.serviceCalls);

  function saveQueues(list) {
    set(K.queues, list.map(({ key, nav, section, mode }) => ({ key, nav, section, mode })));
    pageCache.t = 0;
  }

  const qWhere = q => (q.section ? `${q.section} > ${q.nav}` : q.nav);
  function qName(q) {
    if (q.key === 'my') return 'My queue';
    if (q.mode === 'calls') return 'Service calls';
    const dupes = trackedQueues().filter(x => same(x.nav, q.nav)).length > 1;
    return dupes && q.section ? `${q.nav} (${q.section})` : q.nav;
  }

  // Which tracked queue (if any) is this nav selection?
  function findTracked(cur) {
    const matches = activeQueues().filter(q => same(q.nav, cur.nav));
    return matches.find(q => !q.section || !cur.section || same(q.section, cur.section)) || null;
  }

  // ---------------------------------------------------------------------------
  // Time helpers
  // ---------------------------------------------------------------------------
  function dur(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    return Math.floor(h / 24) + 'd';
  }
  function dueAt(ts) {
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
    if (days === 0) return `today ${time}`;
    if (days === 1) return `tomorrow ${time}`;
    if (days === -1) return `yesterday ${time}`;
    if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
    return `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`;
  }
  const ago = ts => (!ts ? 'never' : Date.now() - ts < 60000 ? 'just now' : dur(Date.now() - ts) + ' ago');
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  // Tickets in these statuses have their SLA paused (Scheduled = waiting for the service call to start)
  const pausedList = () => String(CONFIG.pausedStatuses || '').split(',').map(clean).filter(Boolean);
  const slaPaused = t => !!t && pausedList().some(st => same(st, t.status || ''));

  function dueState(due, soonMinutes) {
    if (!due) return null;
    const diff = due - Date.now();
    if (diff < 0) return 'overdue';
    if (diff <= soonMinutes * 60000) return 'soon';
    return 'ok';
  }

  // ---------------------------------------------------------------------------
  // Locks: one tab per queue refreshes and alerts
  // ---------------------------------------------------------------------------
  function acquireLock(q) {
    const now = Date.now(), l = get(q.lock, null);
    if (l && l.id !== ID && now - l.ts < staleMs()) return false;
    set(q.lock, { id: ID, ts: now });
    return get(q.lock, null)?.id === ID;
  }
  const ownsLock = q => get(q.lock, null)?.id === ID;
  function foreignActive(q) {
    const l = get(q.lock, null);
    return !!l && l.id !== ID && Date.now() - l.ts < staleMs();
  }
  function releaseLock(q) { if (ownsLock(q)) del(q.lock); }
  addEventListener('pagehide', () => trackedQueues().forEach(releaseLock));

  function setState(q, patch) {
    set(q.state, { ...get(q.state, {}), ...patch, id: ID, ts: Date.now() });
    renderSoon();
  }

  // ---------------------------------------------------------------------------
  // What page is this? (My Workspace & Queues, and which queue is selected)
  // ---------------------------------------------------------------------------
  function searchDocs() {
    const docs = [document];
    try { if (W.top !== W && W.top.document) docs.push(W.top.document); } catch { /* cross-origin */ }
    return docs;
  }
  const navCandidates = doc => [...doc.querySelectorAll('a, span, div, li, td, p, h1, h2, h3')]
    .filter(el => el.childElementCount <= 3 && !el.closest('#atqm') && !el.closest('tr.Display'));

  function isWorkspacePage() {
    return searchDocs().some(doc => /workspace\s*&\s*queues/i.test(doc.title) ||
      navCandidates(doc).some(el => el.textContent.length < 80 && /^My Workspace\b/i.test(clean(el.textContent))));
  }

  const KNOWN_SECTIONS = ['My Workspace', 'All', 'Not Assigned', 'Assigned'];
  const SECTION_RE = new RegExp('^(' + KNOWN_SECTIONS.join('|') + ')\\s*\\(', 'i');
  const ITEM_RE = /^(.{2,60}?)\s*\(([\d\s+]+)\)$/;

  // Queue entries in the left menu, e.g. "Support 1st Line (172 + 30)"
  function navItems() {
    const out = [];
    for (const doc of searchDocs()) {
      for (const el of navCandidates(doc)) {
        const m = clean(el.textContent).match(ITEM_RE);
        if (!m || KNOWN_SECTIONS.some(s => same(s, m[1]))) continue;
        out.push({ el, name: clean(m[1]), count: m[2].split('+').reduce((s, x) => s + (parseInt(x, 10) || 0), 0) });
      }
    }
    return out.filter(a => !out.some(b => b !== a && a.el.contains(b.el)));
  }

  // Group a queue sits under: "My Workspace", "All", "Not Assigned", ...
  function sectionOf(el) {
    for (let n = el, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
        // A sibling built like this element is a neighbouring item or tab, not a group heading
        if (s.tagName === n.tagName && s.className.replace(/\b\w*State\b/g, '') === n.className.replace(/\b\w*State\b/g, '')) continue;
        const t = clean(s.textContent);
        const known = t.match(SECTION_RE);
        if (known) return KNOWN_SECTIONS.find(k => same(k, known[1]));
        // Unknown group names: a short "Name (n)" heading one level up from the item list
        if (depth >= 1 && t.length < 50) {
          const m = t.match(/^([^()]{2,40}?)\s*\(/);
          if (m) return clean(m[1]);
        }
      }
    }
    return '';
  }

  const SELECTED_CLASS = /(^|[\s_-])(selected|active|current|highlight(ed)?|focused|checked)(state)?([\s_-]|$)/i;
  const isTransparent = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  function markedSelected(el) {
    for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      if (n.getAttribute('aria-selected') === 'true' || n.hasAttribute('aria-current')) return true;
      if (SELECTED_CLASS.test(n.getAttribute('class') || '')) return true;
    }
    return false;
  }
  function highlighted(el) {
    for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      const sib = n.nextElementSibling || n.previousElementSibling;
      if (!sib || n.tagName !== sib.tagName) continue;
      const view = n.ownerDocument.defaultView;
      const bg = view.getComputedStyle(n).backgroundColor;
      if (!isTransparent(bg) && bg !== view.getComputedStyle(sib).backgroundColor) return true;
    }
    return false;
  }

  // { nav, section } of the selected queue, or null if this isn't a queue page
  function currentQueue() {
    const items = navItems();
    if (!items.length || (items.length < 2 && !isWorkspacePage())) return null;
    let hit = items.find(i => markedSelected(i.el)) || items.find(i => highlighted(i.el));
    if (!hit) {
      // Fallback: the only menu entry whose count matches the grid's row count
      const rows = gridScope().querySelectorAll('tr.Display').length;
      const m = items.filter(i => i.count === rows);
      if (m.length === 1) hit = m[0];
    }
    return hit ? { nav: hit.name, section: sectionOf(hit.el) } : null;
  }

  // Autotask usually shows the queue inside a frame while the widget sits in the outer page,
  // so frames report what they're showing (see "Frame messaging" below).
  let remotePage = null; // latest report from a frame in this tab: { cur, qKey, owns, foreign, ts, source }
  let pageCache = { t: 0, v: {} };
  function pageInfo(fresh = false) {
    if (!fresh && Date.now() - pageCache.t < 1500) return pageCache.v;
    const v = {};
    if (gridPresent()) {
      v.cur = currentQueue();
      v.isCalls = isCallGrid();
      if (v.cur) {
        v.q = findTracked(v.cur);
        if (v.q) { v.owns = ownsLock(v.q); v.foreign = foreignActive(v.q); }
      }
    } else if (remotePage && remotePage.cur && Date.now() - remotePage.ts < 25000) {
      v.cur = remotePage.cur;
      v.q = findTracked(v.cur);
      v.owns = !!remotePage.owns;
      v.foreign = !!remotePage.foreign;
      v.isCalls = !!remotePage.isCalls;
      v.remote = remotePage.source;
    }
    pageCache = { t: Date.now(), v };
    return v;
  }

  // ---------------------------------------------------------------------------
  // Grid reading
  // ---------------------------------------------------------------------------
  const HEADERS = {
    ticket: /^ticket\s*(number|#|no\.?)?$/i,
    status: /^status$/i,
    title: /^(ticket\s*)?title$/i,
    priority: /^priority$/i,
    account: /^account(\s*name)?$/i,
    created: /^create(d)?(\s*(date|on|time))?$/i,
    slaEvent: /^(next\s*)?(sla\s*)?event$/i,
    slaDue: /sla.*due|event\s*due/i,
    frDue: /first\s*response.*(due|by)|response\s*due/i,
    due: /^due(\s*date)?(\s*\/?\s*time)?$/i,
  };

  // The grid the user is looking at. My Workspace keeps every tab's grid in the page
  // (Tasks & Tickets, To-Dos, Service Calls); only the one in the active tab counts.
  function activeGrid() {
    const grids = [...document.querySelectorAll('.Grid')].filter(g => g.querySelector('tr.Display, tr.Heading'));
    if (!grids.length) return null;
    return grids.find(g => g.closest('.TabContainer.Active'))
      || grids.find(g => g.getClientRects().length && !g.closest('.TabContainer:not(.Active)'))
      || grids.find(g => !g.closest('.TabContainer'))
      || null;
  }
  const gridScope = () => activeGrid() || document;

  function findColumns(scope = gridScope()) {
    for (const row of scope.querySelectorAll('tr:not(.Display)')) {
      const texts = [...row.cells].map(cellText);
      const ticket = texts.findIndex(t => HEADERS.ticket.test(t));
      if (ticket < 0) continue;
      const cols = {};
      for (const [k, re] of Object.entries(HEADERS)) {
        const i = texts.findIndex(t => re.test(t));
        cols[k] = i < 0 ? null : i;
      }
      return cols;
    }
    return null;
  }

  function gridPresent() { return !!document.querySelector('tr.Display') || !!findColumns(); }

  function parseDate(s) {
    const m = (s || '').match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?:\s*(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i);
    if (!m) return null;
    let [, a, b, y, h = '0', mi = '0', ap] = m;
    let d = +a, mo = +b;
    if (CONFIG.dateOrder === 'MDY') [d, mo] = [mo, d];
    y = +y; if (y < 100) y += 2000;
    h = +h;
    if (ap) {
      ap = ap.toUpperCase();
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
    }
    const t = new Date(y, mo - 1, d, h, +mi).getTime();
    return Number.isNaN(t) ? null : t;
  }

  // Autotask's own deep link: works for any ticket number while you're logged in
  const commandUrl = (param, value) =>
    `${location.origin}/Autotask/AutotaskExtend/ExecuteCommand.aspx?Code=OpenTicketDetail&${param}=${encodeURIComponent(value)}`;
  // Link for a ticket. ref: { tid (Autotask's internal ticket ID), url (grid link), ids (queue's IDs, for next/prev) }
  // The grid link and the ExecuteCommand link both open Autotask's pop-out window; the normal
  // ticket page is TicketDetail.mvc with the internal ticket ID, like the address bar shows.
  function ticketUrl(id, ref) {
    const r = ref || {};
    if (CONFIG.linkStyle === 'grid' && r.url) return r.url;
    if (CONFIG.linkStyle === 'command' || !r.tid) return commandUrl('TicketNumber', id);
    const ids = (r.ids || []).map((x, i) => `ids%5B${i}%5D=${x}`).join('&');
    return `${location.origin}/Mvc/ServiceDesk/TicketDetail.mvc?workspace=False&${ids ? ids + '&' : ''}ticketId=${r.tid}`;
  }

  // Autotask's internal ticket ID is what the ticket page needs; look for it in the ticket cell's
  // link, in click handlers / data attributes, in the row's checkbox, or on the row itself.
  function findTicketRef(row, cell) {
    const isId = v => /^\d{3,10}$/.test(v || '');
    const idIn = str => {
      const m = (str || '').match(/(?:^|[?&;])(?:ticketId|TicketID|id)=(\d+)/i) ||
                (str || '').match(/\bticket_?id\b['"]?\s*[=:,(]\s*['"]?(\d+)/i);
      return m ? m[1] : null;
    };
    let url = null, tid = null;
    for (const a of cell.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (h && !/^(#|javascript:)/i.test(h)) { try { url = url || new URL(h, location.href).href; } catch { /* bad href */ } }
      let dec = h; try { dec = decodeURIComponent(h); } catch { /* keep raw */ }
      tid = tid || idIn(dec);
    }
    if (!tid) {
      outer: for (const n of [cell, ...cell.querySelectorAll('*'), row]) {
        for (const at of n.attributes) { tid = idIn(at.value); if (tid) break outer; }
      }
    }
    if (!tid) { const cb = row.querySelector('input[type=checkbox]'); if (cb && isId(cb.value)) tid = cb.value; }
    if (!tid) for (const at of row.attributes) { if (/id$/i.test(at.name) && isId(at.value)) { tid = at.value; break; } }
    return { url, tid };
  }

  function readGrid() {
    const scope = gridScope();
    const rows = [...scope.querySelectorAll('tr.Display')];
    const cols = findColumns(scope);
    if (!rows.length && !cols) return null;

    let offset = 0; // header and body can be separate tables with extra leading cells
    if (cols && rows.length) {
      const actual = [...rows[0].cells].findIndex(c => TICKET_RE.test(cellText(c)));
      if (actual >= 0) offset = actual - cols.ticket;
    }
    const col = (cells, i) => (i == null ? '' : cellText(cells[i + offset]));
    const noneToEmpty = s => (/^(none|-)?$/i.test(s) ? '' : s);

    const tickets = [];
    for (const r of rows) {
      const cells = [...r.cells];
      const byCol = cols ? cells[cols.ticket + offset] : null;
      const tCell = byCol && TICKET_RE.test(cellText(byCol)) ? byCol : cells.find(c => TICKET_RE.test(cellText(c)));
      if (!tCell) continue;
      const id = cellText(tCell).match(TICKET_RE)[0];

      let status = col(cells, cols?.status);
      if (!status) status = cells.map(cellText).find(t => STATUS_SET.has(t.toLowerCase())) || '';

      const slaEvent = noneToEmpty(col(cells, cols?.slaEvent));
      const due = parseDate(col(cells, cols?.slaDue ?? cols?.due));
      let frDue = parseDate(col(cells, cols?.frDue));
      if (!frDue && /first\s*response/i.test(slaEvent)) frDue = due;

      tickets.push({
        id, status, slaEvent, due, frDue,
        ...findTicketRef(r, tCell),
        title: col(cells, cols?.title),
        priority: col(cells, cols?.priority),
        account: col(cells, cols?.account),
        created: parseDate(col(cells, cols?.created)),
      });
    }
    return { tickets, rowCount: rows.length };
  }

  // ---------------------------------------------------------------------------
  // Service calls grid (My Workspace > Service Calls)
  // ---------------------------------------------------------------------------
  const CALL_HEADERS = {
    account: /^account(\s*name)?$/i,
    start: /^start(\s*(date|time))*$/i,
    end: /^end(\s*(date|time))*$/i,
    status: /^status$/i,
    resources: /resources/i,
    priority: /^priority$/i,
    createdBy: /^created\s*by$/i,
    created: /^create(d)?\s*date$/i,
    description: /^description$/i,
  };

  function findCallColumns(scope = gridScope()) {
    for (const row of scope.querySelectorAll('tr:not(.Display)')) {
      const texts = [...row.cells].map(cellText);
      if (!texts.some(t => CALL_HEADERS.start.test(t))) continue;
      const cols = {};
      for (const [k, re] of Object.entries(CALL_HEADERS)) {
        const i = texts.findIndex(t => re.test(t));
        cols[k] = i < 0 ? null : i;
      }
      return cols;
    }
    return null;
  }

  function isCallGrid() {
    const g = activeGrid();
    if (g) return g.id === 'ServiceCallIndexGrid' || (!!findCallColumns(g) && !findColumns(g));
    return !!findCallColumns(document) && !findColumns(document);
  }

  const callUrl = id => `${location.origin}/Autotask/Popups/TechScheduling/service_call.aspx?service_call_id=${encodeURIComponent(id)}`;

  function readCallGrid() {
    const g = activeGrid();
    const scope = (g && isCallGrid() ? g : document.querySelector('#ServiceCallIndexGrid')) || document;
    const rows = [...scope.querySelectorAll('tr.Display')];
    const cols = findCallColumns(scope);
    if (!cols) return null;
    const col = (cells, i) => (i == null ? '' : cellText(cells[i]));
    const calls = [];
    for (const r of rows) {
      const cells = [...r.cells];
      let id = r.getAttribute('data-row-key');
      if (!id) { const m = r.innerHTML.match(/service_call_id['"]?\s*,\s*['"](\d+)/i); id = m && m[1]; }
      if (!id) continue;
      const start = parseDate(col(cells, cols.start));
      let end = parseDate(col(cells, cols.end));
      if (start && (!end || end < start)) end = start + 30 * 60000;
      calls.push({
        id, start, end, url: callUrl(id),
        account: col(cells, cols.account),
        status: col(cells, cols.status),
        resources: col(cells, cols.resources),
        priority: col(cells, cols.priority),
        createdBy: col(cells, cols.createdBy),
        created: parseDate(col(cells, cols.created)),
        description: col(cells, cols.description),
      });
    }
    return { calls, rowCount: rows.length };
  }

  const callLabel = c => [c.account, c.description].filter(Boolean).join(' – ') || 'Service call';
  const timeOf = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------
  let audioCtx = null;
  function beep(urgent) {
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = urgent ? 880 : 660;
      g.gain.value = 0.08;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.25);
    } catch { /* audio blocked */ }
  }

  function notify(name, list) {
    if (CONFIG.sound) beep(list.some(a => a.type === 'overdue' || a.type === 'new'));
    if (!CONFIG.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const allNew = list.every(a => a.type === 'new');
    const title = allNew
      ? `${name}: ${list.length} new ticket${list.length > 1 ? 's' : ''}`
      : `${name}: ${list.length} change${list.length > 1 ? 's' : ''}`;
    const body = list.slice(0, 4).map(a => a.text).join('\n') + (list.length > 4 ? `\n…and ${list.length - 4} more` : '');
    try {
      const n = new Notification(title, { body, tag: 'atqm-' + name });
      n.onclick = () => {
        if (list.length === 1 && list[0].ticket) window.open(ticketUrl(list[0].ticket, list[0]), '_blank', 'noopener');
        else window.focus();
        n.close();
      };
    } catch { /* not allowed in this frame */ }
  }

  function commitAlerts(q, fresh) {
    if (!fresh.length) return;
    set(K.alerts, get(K.alerts, []).concat(fresh).slice(-CONFIG.maxAlerts));
    notify(qName(q), fresh);
  }

  const label = (id, t) => (t?.title ? `${id} – ${t.title}` : id);

  // ---------------------------------------------------------------------------
  // Scanning
  // ---------------------------------------------------------------------------
  // "All changes": new, status changes, leaving the queue, any SLA
  function scanFull(q, grid) {
    const now = Date.now();
    const prev = get(q.snap, null);
    const current = {};
    for (const { id, ...t } of grid.tickets) {
      current[id] = { ...t, sla: slaPaused(t) ? null : dueState(t.due, CONFIG.dueSoonMinutes), firstSeen: prev?.[id]?.firstSeen ?? now };
    }
    set(q.snap, current);

    const n = grid.tickets.length;
    if (!prev) return setState(q, { mode: 'ok', lastScan: now, count: n, ...coverage(grid), note: 'Baseline saved' });

    const fresh = [];
    const qn = qName(q);
    const push = (type, text, ticket) => fresh.push({
      ts: now, q: q.key, qn, type, text, ticket, read: false,
      url: current[ticket]?.url || prev[ticket]?.url || null, tid: current[ticket]?.tid || prev[ticket]?.tid || null,
    });

    for (const [id, t] of Object.entries(current)) {
      const p = prev[id];
      if (!p) push('new', `New: ${label(id, t)}${t.status ? ` [${t.status}]` : ''}`, id);
      else if (p.status !== t.status) push('status', `${label(id, t)}: ${p.status || '?'} → ${t.status || '?'}`, id);
      if (t.sla && RANK[t.sla] > RANK[p?.sla || 'ok']) {
        const what = t.slaEvent ? `${t.slaEvent} ` : '';
        push(t.sla, `${t.sla === 'overdue' ? 'SLA breached' : 'SLA due soon'} (${dueAt(t.due)}): ${what}${label(id, t)}`, id);
      }
    }
    const cov = coverage(grid);
    if (!cov.partial) { // with only part of the queue visible, "left queue" can't be judged
      for (const [id, p] of Object.entries(prev)) {
        if (!current[id]) push('removed', `Left queue: ${label(id, p)}`, id);
      }
    }

    commitAlerts(q, fresh);
    setState(q, { mode: 'ok', lastScan: now, count: n, total: cov.total, partial: cov.partial, max: cov.max, note: '' });
  }

  // "New tickets & first response": only arrivals and first response SLAs
  function scanIntake(q, grid) {
    const now = Date.now();
    const prev = get(q.snap, null);
    const rebase = !prev;
    const seen = rebase ? {} : get(q.seen, {});
    const prevSnap = prev || {};

    const current = {};
    for (const { id, ...t } of grid.tickets) {
      current[id] = { ...t, fr: slaPaused(t) ? null : dueState(t.frDue, CONFIG.frSoonMinutes), firstSeen: prevSnap[id]?.firstSeen ?? seen[id] ?? now };
    }

    const fresh = [];
    const qn = qName(q);
    const push = (type, text, ticket) => fresh.push({
      ts: now, q: q.key, qn, type, text, ticket, read: false, url: current[ticket]?.url || null, tid: current[ticket]?.tid || null,
    });

    if (!rebase) {
      for (const [id, t] of Object.entries(current)) {
        // "seen" remembers tickets for 2 weeks, so tickets moving between grid pages don't re-alert
        if (!seen[id]) {
          const extra = [t.account, t.priority].filter(Boolean).join(', ');
          push('new', `New: ${label(id, t)}${extra ? ` (${extra})` : ''}`, id);
        }
        if (t.fr && RANK[t.fr] > RANK[prevSnap[id]?.fr || 'ok']) {
          push(t.fr, `First response ${t.fr === 'overdue' ? 'breached' : 'due soon'} (${dueAt(t.frDue)}): ${label(id, t)}`, id);
        }
      }
    }

    for (const id of Object.keys(current)) seen[id] = seen[id] || now;
    const cutoff = now - 14 * 86400000;
    for (const [id, ts] of Object.entries(seen)) if (ts < cutoff && !current[id]) delete seen[id];

    set(q.snap, current);
    set(q.seen, seen);
    commitAlerts(q, fresh);
    setState(q, { mode: 'ok', lastScan: now, count: grid.tickets.length, ...coverage(grid), note: rebase ? 'Baseline saved' : '' });
  }

  // Service calls: new calls, moved calls, status changes, calls that disappear (completed or deleted)
  function scanCalls(q, grid) {
    const now = Date.now();
    const prev = get(q.snap, null);
    const current = {};
    for (const { id, ...c } of grid.calls) current[id] = { ...c, firstSeen: prev?.[id]?.firstSeen ?? now };
    set(q.snap, current);

    const cov = coverage(grid);
    const base = { mode: 'ok', lastScan: now, count: grid.calls.length, total: cov.total, partial: cov.partial, max: cov.max };
    if (!prev) return setState(q, { ...base, note: 'Baseline saved' });

    const fresh = [];
    const qn = qName(q);
    const push = (type, text, id) => fresh.push({
      ts: now, q: q.key, qn, type, text, call: id, callUrl: (current[id] || prev[id])?.url || null, read: false,
    });
    const when = ts => (ts ? dueAt(ts) : 'no time');
    for (const [id, c] of Object.entries(current)) {
      const p = prev[id];
      if (!p) push('new', `Service call scheduled (${when(c.start)}): ${callLabel(c)}`, id);
      else if (p.start !== c.start || p.end !== c.end) push('status', `Service call moved (${when(p.start)} → ${when(c.start)}): ${callLabel(c)}`, id);
      else if (p.status !== c.status) push('status', `Service call ${p.status || '?'} → ${c.status || '?'}: ${callLabel(c)}`, id);
    }
    if (!cov.partial) {
      for (const [id, p] of Object.entries(prev)) {
        if (!current[id]) push('removed', `Service call gone (completed or removed): ${callLabel(p)}`, id);
      }
    }
    commitAlerts(q, fresh);
    setState(q, { ...base, note: '' });
  }

  // Grid pager: "1 - 18 of 18" and the rows-per-page dropdown
  function pagerInfo() {
    const pager = gridScope().querySelector('.Pager');
    if (!pager) return null;
    const sel = pager.querySelector('select[id$="PageSizeDropDownList"], .PageSizeStatus select');
    const m = (pager.querySelector('.VisibleRows')?.textContent || '').match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/);
    const sizes = sel ? [...sel.options].map(o => parseInt(o.value, 10)).filter(n => n > 0) : [];
    return { sel, from: m ? +m[1] : null, to: m ? +m[2] : null, total: m ? +m[3] : null, max: sizes.length ? Math.max(...sizes) : null };
  }

  // Switch the grid to its largest page size so a scan sees as much as possible. Returns true if it changed.
  async function ensureMaxPageSize() {
    const pi = pagerInfo();
    if (!pi?.sel || !pi.max || parseInt(pi.sel.value, 10) >= pi.max) return false;
    const marker = gridScope().querySelector('tr.Display');
    pi.sel.value = String(pi.max);
    pi.sel.dispatchEvent(new Event('input', { bubbles: true }));
    pi.sel.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
    await sleep(400);
    return true;
  }

  // How much of the queue the grid is showing
  function coverage(grid) {
    const pi = pagerInfo();
    const total = pi?.total ?? grid.rowCount;
    return { total, partial: total > grid.rowCount, max: pi?.max };
  }

  // Each tab has its own toolbar; use the refresh button that belongs to the active grid
  function findRefreshButton() {
    const tab = activeGrid()?.closest('.TabContainer');
    for (const box of tab ? [tab, document] : [document]) {
      const btn = box.querySelector('[title="Refresh grid only"]') || box.querySelector('[title="Refresh"]');
      if (btn) return btn;
      const icon = box.querySelector('.StandardButtonIcon.Refresh');
      if (icon) return icon.closest('[tabindex], .Button2, button') || icon;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Missing columns: add them through the grid's own Column Chooser
  // ---------------------------------------------------------------------------
  const REQUIRED = {
    full: ['ticket', 'title', 'status', 'account', 'priority', 'slaEvent', 'slaDue'],
    intake: ['ticket', 'title', 'status', 'account', 'priority', 'created', 'slaEvent', 'slaDue'],
    calls: ['account', 'start', 'end', 'status', 'priority', 'description'],
  };
  const COLUMN_NAMES = {
    ticket: 'Ticket Number', title: 'Title', status: 'Status', account: 'Account', priority: 'Priority',
    created: 'Created', slaEvent: 'Next SLA Event', slaDue: 'Next SLA Event Due',
    start: 'Start Date', end: 'End Date', description: 'Description',
  };
  // Option names in the chooser, most specific first
  const CHOOSER_MATCH = {
    ticket: [/^ticket\s*number$/i, /^ticket\s*(#|no\.?)$/i],
    title: [/^title$/i, /^ticket\s*title$/i],
    status: [/^status$/i],
    account: [/^account$/i, /^account\s*name$/i],
    priority: [/^priority$/i],
    created: [/^created$/i, /^create(d)?\s*(date|on|time)/i],
    slaEvent: [/^next\s*sla\s*event$/i, /^sla\s*event$/i],
    slaDue: [/^next\s*sla\s*event\s*due/i, /sla.*event.*due/i],
    start: [/^start\s*date$/i, /^start(\s*time)?$/i],
    end: [/^end\s*date$/i, /^end(\s*time)?$/i],
    description: [/^description$/i],
  };

  function headerTexts(scope = gridScope()) {
    let best = null;
    for (const row of scope.querySelectorAll('tr:not(.Display)')) {
      const texts = [...row.cells].map(cellText).filter(Boolean);
      if (!best || texts.length > best.length) best = texts;
    }
    return best;
  }

  function missingColumns(q) {
    const RE = q.mode === 'calls' ? CALL_HEADERS : HEADERS;
    const texts = headerTexts();
    if (!texts || !texts.length) return [];
    return (REQUIRED[q.mode] || []).filter(k => !texts.some(t => RE[k].test(t)));
  }

  // Autotask buttons don't always react to a bare click(), so send the full pointer sequence
  function press(el) {
    if (!el) return false;
    const target = el.closest('.Button2, button, [tabindex]') || el;
    const make = type => {
      const E = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      // Inside Tampermonkey's Firefox sandbox, passing the page's window as `view` can throw
      try { return new E(type, { bubbles: true, cancelable: true, view: target.ownerDocument.defaultView }); } catch { /* retry */ }
      try { return new E(type, { bubbles: true, cancelable: true }); } catch { return null; }
    };
    let clicked = false;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const ev = make(type);
      if (!ev) continue;
      try { target.dispatchEvent(ev); if (type === 'click') clicked = true; } catch { /* ignore */ }
    }
    if (!clicked) { try { target.click(); } catch { /* ignore */ } }
    return true;
  }

  async function waitFor(fn, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = fn();
      if (v || Date.now() > end) return v || null;
      await sleep(200);
    }
  }

  // The chooser may open in this page, a frame, or the top window
  function findChooserDialog() {
    const docs = [document, ...searchDocs()];
    for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* cross-origin */ } }
    for (const doc of docs) {
      for (const lm of doc.querySelectorAll('.ListMover2')) {
        const box = lm.closest('.VerticalContainer') || doc.body;
        const title = clean(box.querySelector('.TitleBar1 .Title, .Title')?.textContent || doc.title);
        if (/column\s*chooser/i.test(title) && lm.querySelector('.Left select') && lm.querySelector('.Right select')) return box;
      }
    }
    return null;
  }

  async function addColumnsViaChooser(keys) {
    const tab = activeGrid()?.closest('.TabContainer');
    const btn = (tab && tab.querySelector('[title="Column Chooser"]')) || document.querySelector('[title="Column Chooser"]');
    if (!btn) return { added: [], missing: keys, why: 'no Column Chooser button found' };
    press(btn);
    const dlg = await waitFor(findChooserDialog, 10000);
    if (!dlg) return { added: [], missing: keys, why: 'the Column Chooser did not open' };

    const left = dlg.querySelector('.ListMover2 .Left select');
    const right = dlg.querySelector('.ListMover2 .Right select');
    const close = () => press(dlg.querySelector('.DialogTitleBarIcon.Close'));
    const name = o => clean(o.title || o.textContent);
    const inRight = o => [...right.options].some(r => r.value === o.value && name(r) === name(o));

    const picks = new Map(); // key -> option
    for (const k of keys) {
      for (const re of CHOOSER_MATCH[k] || []) {
        const o = [...left.options].find(x => re.test(name(x)) && ![...picks.values()].includes(x));
        if (o) { picks.set(k, o); break; }
      }
    }
    if (!picks.size) { close(); return { added: [], missing: keys, why: 'not offered in the Column Chooser' }; }

    const opts = [...picks.values()];
    for (const o of left.options) o.selected = opts.includes(o);
    left.dispatchEvent(new Event('change', { bubbles: true }));
    press(dlg.querySelector('.StandardButtonIcon.MoveRight'));
    await sleep(400);
    // Fallback: list movers usually also move an option on double-click
    for (const o of opts.filter(o => !inRight(o))) {
      o.selected = true;
      o.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await sleep(150);
    }
    const added = [...picks].filter(([, o]) => inRight(o)).map(([k]) => k);
    if (!added.length) { close(); return { added: [], missing: keys, why: "the Column Chooser didn't accept the change" }; }

    const marker = gridScope().querySelector('tr.Display');
    press(dlg.querySelector('.StandardButtonIcon.Save'));
    await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
    await sleep(600);
    return { added, missing: keys.filter(k => !added.includes(k)), why: added.length < keys.length ? 'not offered in the Column Chooser' : '' };
  }

  // Before a scan: add any columns this queue needs. Tries a given set at most every 6 hours.
  async function ensureColumns(q) {
    const missing = missingColumns(q);
    if (!missing.length) { if (get(q.state, {}).colNote) setState(q, { colNote: '' }); return; }
    if (!CONFIG.autoColumns) {
      setState(q, { colNote: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.map(k => COLUMN_NAMES[k]).join(', ')}. Add ${missing.length > 1 ? 'them' : 'it'} with the grid's Column Chooser.` });
      return;
    }
    const tried = get(K.colTried, {});
    const key = q.key + ':' + missing.join(',');
    if (tried[key] && Date.now() - tried[key] < 6 * 3600000) return;
    tried[key] = Date.now();
    set(K.colTried, tried);

    const r = await addColumnsViaChooser(missing);
    if (r.added.length) {
      // Logged quietly in Changes (no ping)
      set(K.alerts, get(K.alerts, []).concat([{ ts: Date.now(), q: q.key, qn: qName(q), type: 'status', read: true,
        text: `Added column${r.added.length > 1 ? 's' : ''} to ${qWhere(q)}: ${r.added.map(k => COLUMN_NAMES[k]).join(', ')}` }]).slice(-CONFIG.maxAlerts));
    }
    setState(q, { colNote: r.missing.length
      ? `Couldn't add ${r.missing.map(k => COLUMN_NAMES[k]).join(', ')} (${r.why}). Add ${r.missing.length > 1 ? 'them' : 'it'} with the grid's Column Chooser if your Autotask has ${r.missing.length > 1 ? 'them' : 'it'}.`
      : '' });
  }

  // MutationObserver instead of polling: background tabs throttle timers heavily
  function waitForRefresh(marker, timeout) {
    return new Promise(resolve => {
      let obs, t;
      const done = v => { obs?.disconnect(); clearTimeout(t); resolve(v); };
      const check = () => { if (marker ? !marker.isConnected : !!document.querySelector('tr.Display')) done(true); };
      obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true });
      t = setTimeout(() => done(false), timeout);
      check();
    });
  }

  async function refreshAndScan(q) {
    const resized = await ensureMaxPageSize();
    const btn = resized ? null : findRefreshButton();
    if (btn) {
      const marker = gridScope().querySelector('tr.Display');
      btn.click();
      await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
      await sleep(400);
    }
    if (pageInfo(true).q?.key !== q.key) return setState(q, { mode: 'waiting', note: `Monitoring tab moved off ${qWhere(q)}` });

    await ensureColumns(q);

    if (q.mode === 'calls') {
      const cg = readCallGrid();
      if (!cg) return setState(q, { mode: 'error', note: 'Service calls grid not found' });
      return scanCalls(q, cg);
    }
    const grid = readGrid();
    if (!grid) return setState(q, { mode: 'error', note: 'Queue grid not found' });
    if (grid.rowCount && !grid.tickets.length) {
      return setState(q, { mode: 'error', note: 'Rows found but no ticket numbers recognised. Add the Ticket Number column to the view.' });
    }
    (q.mode === 'intake' ? scanIntake : scanFull)(q, grid);
  }

  let busy = false;
  let localNote = '';
  const owned = new Set();

  async function tick({ manual = false } = {}) {
    if (busy) return;
    if (!manual && !get(K.enabled, false)) return;
    handleMoveRequest();
    if (!manual && Date.now() < retiredUntil) { renderSoon(); return; }

    const pg = pageInfo(true);
    const list = trackedQueues();

    // This tab was monitoring a queue but has moved off it
    for (const key of [...owned]) {
      if (pg.q?.key === key) continue;
      owned.delete(key);
      const q = list.find(x => x.key === key);
      if (!q) continue; // stopped tracking
      releaseLock(q);
      setState(q, { mode: 'waiting', note: `Monitoring tab moved off ${qWhere(q)}` });
    }

    const q = pg.q;
    if (!q) { renderSoon(); return; }
    if (!acquireLock(q)) { owned.delete(q.key); renderSoon(); return; } // another tab monitors it now
    if ((!q.section && pg.cur.section) || (q.mode === 'calls' && (q.section || '') !== (pg.cur.section || ''))) {
      saveQueues(list.map(x => (x.key === q.key ? { ...x, section: pg.cur.section || '' } : x)));
    }
    owned.add(q.key);
    if (get(q.state, {}).url !== location.href) setState(q, { url: location.href });
    busy = true;
    try {
      await refreshAndScan(q);
    } catch (e) {
      console.error('[ATQM]', e);
      setState(q, { mode: 'error', note: 'Scan failed: ' + e.message });
    } finally {
      busy = false;
      renderSoon();
    }
  }

  function requestScan() {
    set(K.scanReq, Date.now()); // monitoring tabs pick this up
    if (pageInfo(true).q) tick({ manual: true });
    localNote = 'Scan requested';
    render();
    setTimeout(() => { localNote = ''; render(); }, 8000);
  }

  function slug(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

  function startTracking(cur, mode) {
    const list = trackedQueues();
    if (findTracked(cur)) return;
    let key = slug(`${cur.section}-${cur.nav}`) || 'queue';
    while (list.some(q => q.key === key)) key += '-2';
    list.push({ key, nav: cur.nav, section: cur.section, mode });
    saveQueues(list);
    if (!get(K.enabled, false)) set(K.enabled, true);
    if (CONFIG.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (CONFIG.sound) beep(false);
    tick({ manual: true });
    render();
  }

  // ---------------------------------------------------------------------------
  // Quick start: open a tab per unmonitored queue; each tab selects its queue itself
  // ---------------------------------------------------------------------------
  const LAUNCH = 'atqm-';
  const SS_KEY = P + 'launchKey';
  // One id per browser tab, shared by the tab's frames. Kept on the tab's top window object rather than
  // in sessionStorage, because tabs opened by script get a copy of their opener's sessionStorage.
  function tabId() {
    try {
      if (!W.top.__atqmTab) W.top.__atqmTab = ID + Math.random().toString(36).slice(2, 8);
      return W.top.__atqmTab;
    } catch { return ID; }
  }
  function launchKey() {
    try { const k = sessionStorage.getItem(SS_KEY); if (k) return k; } catch { /* ignore */ }
    let n = '';
    try { n = W.top.name || ''; } catch { n = W.name || ''; }
    return n.startsWith(LAUNCH) ? n.slice(LAUNCH.length).split('~')[0] : null;
  }
  function clearLaunch() {
    try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
    try { W.top.name = ''; } catch { W.name = ''; }
  }

  // Open one queue's tab in this window; the window name tells the new tab which queue it's for
  function openQueueTab(q, url) {
    return !!W.open(url, LAUNCH + q.key + '~' + Date.now().toString(36));
  }

  // Queues nobody is monitoring right now (excluding the one this tab shows)
  function idleQueues() {
    const here = pageInfo().q?.key;
    return activeQueues().filter(q => q.key !== here && !foreignActive(q) && !ownsLock(q));
  }

  // Tracked queues currently monitored by some other tab
  const busyElsewhere = () => activeQueues().filter(q => foreignActive(q));

  // Quick start / move here. Opens a tab in THIS window for every tracked queue; when queues are
  // already monitored elsewhere, those tabs are asked to stop and close themselves first.
  function quickStart() {
    const moving = busyElsewhere().length > 0;
    const here = pageInfo(true);
    if (moving) {
      set(K.moveReq, { ts: Date.now(), tab: tabId() });
      // This tab keeps (or takes over) the queue it's showing
      if (here.q) {
        if (here.remote) { try { here.remote.postMessage({ atqm: 'takeover', qKey: here.q.key }, '*'); } catch { /* frame gone */ } }
        else takeOver(here.q);
      }
    }
    const idle = moving ? activeQueues().filter(q => q.key !== here.q?.key) : idleQueues();
    const ready = idle.filter(q => get(q.state, {}).url);
    let blocked = 0;
    for (const q of ready) {
      if (!openQueueTab(q, get(q.state, {}).url)) blocked++;
    }
    if (!get(K.enabled, false)) set(K.enabled, true);
    set(K.qsSnooze, Date.now() + 3 * 60000); // give the new tabs time to start monitoring
    const notes = [];
    if (ready.length - blocked) notes.push(`${moving ? 'Moving' : 'Opening'} ${ready.length - blocked} queue tab${ready.length - blocked > 1 ? 's' : ''} ${moving ? 'to' : 'in'} this window…`);
    if (blocked) notes.push(`Your browser blocked ${blocked}. Allow pop-ups for autotask.net and press Quick start again.`);
    const unknown = idle.filter(q => !get(q.state, {}).url);
    if (unknown.length) notes.push(`Open ${unknown.map(qWhere).join(', ')} yourself once so Quick start learns where ${unknown.length > 1 ? 'they are' : 'it is'}.`);
    localNote = notes.join(' ');
    render();
    setTimeout(() => { localNote = ''; render(); }, 15000);
  }

  // In a tab opened by Quick start: click the queue's entry in the menu (or the page tab) until it's showing
  let launchTries = 0, launchSeen = 0;
  function handleLaunch() {
    const key = launchKey();
    if (!key) return;
    launchSeen = launchSeen || Date.now();
    if (Date.now() - launchSeen > 90000) { clearLaunch(); return; } // never reached its queue: let the tab be
    const q = activeQueues().find(x => x.key === key);
    if (!q) { if (isTop) clearLaunch(); return; }
    if (pageInfo(true).q?.key === key) { clearLaunch(); return; } // arrived: monitoring takes over from here
    if (!gridPresent() && !navItems().length) return;              // this frame isn't the queue page (yet)
    const target = navItems().find(i => same(i.name, q.nav) &&
      (!q.section || !sectionOf(i.el) || same(sectionOf(i.el), q.section)));
    if (!target) return;
    if (++launchTries > 8) { clearLaunch(); return; }               // give up quietly after ~20 s
    press(target.el);
    pageCache.t = 0;
  }

  let retiredUntil = 0, moveHandled = Date.now(); // ignore requests made before this page loaded
  function handleMoveRequest(req = get(K.moveReq, null)) {
    if (!req || req.ts <= moveHandled || Date.now() - req.ts > 60000) return;
    moveHandled = req.ts;
    if (req.tab === tabId()) return;                       // the tab that asked keeps its queue
    const mine = trackedQueues().filter(q => owned.has(q.key) || ownsLock(q));
    // A queue tab is one that's monitoring, one Quick start opened that's still on its way,
    // or one showing a tracked queue. Other Autotask tabs are left alone.
    if (!mine.length && !launchKey() && !pageInfo(true).q) return;
    mine.forEach(q => { releaseLock(q); owned.delete(q.key); });
    retiredUntil = Date.now() + 2 * 60000;                 // don't grab the queues back while the new tabs start
    clearLaunch();
    setTimeout(() => {
      try { W.top.close(); } catch { /* not allowed */ }
      // Still here: browsers only let a tab close itself if a script opened it
      showNote('Monitoring moved to another window. You can close this tab.');
    }, 300);
  }
  // Notes from the frame that does the monitoring belong in the widget, which lives in the top window
  function showNote(text) {
    if (!isTop) { try { W.top.postMessage({ atqm: 'note', text }, '*'); } catch { /* ignore */ } }
    localNote = text;
    render();
  }

  function stopTracking(q) {
    releaseLock(q);
    owned.delete(q.key);
    [q.snap, q.state, q.seen].forEach(del);
    saveQueues(trackedQueues().filter(x => x.key !== q.key));
  }

  // Move monitoring of a queue to this tab; the previous tab notices on its next scan
  function takeOver(q) {
    retiredUntil = 0;
    set(q.lock, { id: ID, ts: Date.now() });
    owned.add(q.key);
    if (!get(K.enabled, false)) set(K.enabled, true);
    pageCache.t = 0;
    tick({ manual: true });
    render();
  }

  // ---------------------------------------------------------------------------
  // Widget
  // ---------------------------------------------------------------------------
  const CSS = `
#atqm{position:fixed;right:20px;top:20px;z-index:2147483000;width:370px;background:#1e1f22;color:#e6e6e6;
  border:1px solid #3b4a5e;border-top:3px solid #4ea1ff;border-radius:6px;font:12px/1.45 system-ui,Segoe UI,sans-serif;
  box-shadow:0 8px 24px rgba(0,0,0,.5)}
#atqm *{box-sizing:border-box}
#atqm-head{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:move;user-select:none;touch-action:none}
#atqm-head b{flex:1;font-size:13px}
#atqm-dot{width:9px;height:9px;border-radius:50%;background:#6b6f76;flex:none}
#atqm[data-health=ok] #atqm-dot{background:#3fb950}
#atqm[data-health=warn] #atqm-dot{background:#d29922}
#atqm-min{background:none;border:0;color:#e6e6e6;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
#atqm-health{padding:0 10px 8px;color:#9aa4b2}
#atqm-health div.warn{color:#e3b341}
#atqm-health b{color:#c9d1d9;font-weight:600}
#atqm.min #atqm-body,#atqm.min #atqm-health{display:none}
#atqm.min{width:auto;min-width:150px;max-width:260px}
#atqm.min #atqm-head b{font-size:12px}
#atqm:hover{opacity:1!important}
#atqm-mini{display:none;flex-direction:column;gap:3px;padding:0 8px 7px}
#atqm.min #atqm-mini{display:flex}
.atqm-mq{display:flex;align-items:center;gap:6px;white-space:nowrap}
.atqm-mq span:nth-child(2){flex:1;overflow:hidden;text-overflow:ellipsis}
.atqm-mq b{color:#e6e6e6;margin-left:8px}
.atqm-ml{width:8px;height:8px;border-radius:50%;background:#6b6f76;flex:none}
.atqm-ml.ok{background:#3fb950}.atqm-ml.warn{background:#d29922}
#atqm-tabs{display:flex;border-bottom:1px solid #33363c;padding:0 10px}
#atqm-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:#9aa4b2;padding:5px 8px;cursor:pointer;font:inherit}
#atqm-tabs button[aria-selected=true]{color:#e6e6e6;border-bottom-color:#4ea1ff}
.atqm-count{background:#e5484d;color:#fff;border-radius:8px;padding:0 5px;margin-left:4px;font-size:11px}
#atqm-panel{padding:8px 10px;max-height:440px;overflow:auto}
#atqm-lock{position:fixed;inset:0;z-index:2147482999;background:rgba(10,12,16,.62);backdrop-filter:grayscale(.6);cursor:not-allowed}
#atqm.locked{left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%);
  width:min(920px,94vw)!important;max-height:88vh;display:flex;flex-direction:column;opacity:1!important;
  box-shadow:0 18px 60px rgba(0,0,0,.6)}
#atqm.locked #atqm-head{cursor:default;padding:10px 14px}
#atqm.locked #atqm-head b{font-size:15px}
#atqm.locked #atqm-min{display:none}
#atqm.locked #atqm-body{display:flex;flex-direction:column;min-height:0;flex:1}
#atqm.locked #atqm-panel{max-height:none;flex:1;min-height:200px;padding:10px 14px}
#atqm.locked #atqm-health,#atqm.locked #atqm-tabs,#atqm.locked #atqm-btns{padding-left:14px;padding-right:14px}
#atqm.locked #atqm-page{margin-left:14px;margin-right:14px}
#atqm-lockview{display:none}
#atqm.locked #atqm-body,#atqm.locked #atqm-health,#atqm.locked #atqm-mini,#atqm.locked #atqm-qs,#atqm.locked #atqm-badge{display:none!important}
#atqm.locked:not(.lv-calls) #atqm-rem{display:none!important}
#atqm.locked #atqm-lockview{display:flex;flex-direction:column;gap:10px;padding:2px 16px 14px;overflow:auto;min-height:0;flex:1}
.lv-title{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.lv-title b{font-size:17px}
.lv-title span{color:#9aa4b2}
.lv-title .lv-mode{margin-left:auto;font-size:11px;background:#2b2f36;border-radius:3px;padding:1px 6px}
.lv-health{color:#9aa4b2;margin-top:-4px}
.lv-health.warn{color:#e3b341}
.lv-why{background:#22303f;border-left:3px solid #4ea1ff;border-radius:4px;padding:6px 9px;color:#c9d1d9}
.lv-stats{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:8px}
@media (max-width:720px){.lv-stats{grid-auto-flow:row;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}}
.lv-stat{background:#24262b;border-radius:6px;padding:8px 10px;border-top:3px solid #3b4a5e}
.lv-stat .v{font-size:21px;font-weight:600;color:#e6e6e6;line-height:1.25}
.lv-stat .l{color:#c9d1d9;font-size:11.5px}
.lv-stat .s{color:#9aa4b2;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-stat.overdue{border-top-color:#e5484d}.lv-stat.overdue .v{color:#ff7b7f}
.lv-stat.soon{border-top-color:#d29922}.lv-stat.soon .v{color:#e3b341}
.lv-stat.new{border-top-color:#3fb950}.lv-stat.progress{border-top-color:#4ea1ff}.lv-stat.call{border-top-color:#8b7cf6}
.lv-statuses{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lv-statuses .atqm-chips{margin:0}
.lv-cols{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:start}
.lv-col{min-width:0}
.lv-foot{display:flex;align-items:center;gap:10px;color:#9aa4b2;border-top:1px solid #33363c;padding-top:10px}
.lv-foot span{flex:1}
.lv-foot button{background:#2b2f36;color:#e6e6e6;border:1px solid #555;border-radius:4px;padding:4px 14px;cursor:pointer;font:inherit}
.lv-foot button:hover{background:#3a3e46}
@media (max-width:720px){.lv-cols{grid-template-columns:1fr}}
#atqm-unlock{background:#2b2f36;color:#e6e6e6;border:1px solid #555;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;font-size:11px}
#atqm-unlock:hover{background:#3a3e46}
#atqm.atqm-nudge{animation:atqm-nudge .35s}
@keyframes atqm-nudge{0%,100%{margin-left:0}25%{margin-left:-6px}75%{margin-left:6px}}
@media (prefers-reduced-motion:reduce){#atqm.atqm-nudge{animation:none}}
.atqm-sec{font-size:13px;font-weight:600;margin:4px 0 6px;padding-bottom:3px;border-bottom:1px solid #33363c}
.atqm-sec:not(:first-child){margin-top:14px}
.atqm-sec span{color:#9aa4b2;font-weight:400;font-size:12px;margin-left:6px}
.atqm-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.atqm-chip{background:#2b2f36;border-left:3px solid #6b6f76;border-radius:3px;padding:2px 7px}
.atqm-chip b{margin-left:4px}
.atqm-chip.new{border-color:#3fb950}.atqm-chip.waiting,.atqm-chip.soon{border-color:#d29922}
.atqm-chip.progress{border-color:#4ea1ff}.atqm-chip.high,.atqm-chip.overdue{border-color:#e5484d}
.atqm-h{color:#9aa4b2;margin:2px 0 4px}
.atqm-list{list-style:none;margin:0 0 8px;padding:0}
.atqm-list li{padding:4px 6px;border-left:3px solid #555;margin-bottom:3px;word-break:break-word;background:#24262b;border-radius:0 3px 3px 0}
.atqm-list li.unread{background:#2b313b}
.atqm-list li.new{border-color:#3fb950}.atqm-list li.status{border-color:#4ea1ff}
.atqm-list li.removed{border-color:#6b6f76}.atqm-list li.soon{border-color:#d29922}
.atqm-list li.overdue{border-color:#e5484d}.atqm-list li.ok{border-color:#3b4a5e}
.atqm-list time,.atqm-when{color:#9aa4b2;margin-right:6px}
.atqm-list li.overdue .atqm-when{color:#ff7b7f;font-weight:600}
.atqm-list li.soon .atqm-when{color:#e3b341;font-weight:600}
.atqm-next{counter-reset:n}
.atqm-next li:not(.atqm-next-h){counter-increment:n;padding-left:28px;position:relative}
.atqm-next li:not(.atqm-next-h)::before{content:counter(n);position:absolute;left:7px;top:5px;width:16px;height:16px;border-radius:50%;
  background:#3b4a5e;color:#e6e6e6;font-size:10px;font-weight:600;text-align:center;line-height:16px}
.atqm-next li.overdue::before{background:#e5484d;color:#fff}
.atqm-next li.soon::before{background:#d29922;color:#1e1f22}
.atqm-next li.atqm-next-h{background:none;border:0;padding:6px 0 2px;color:#9aa4b2;font-weight:600;margin:0}
.atqm-tag{display:inline-block;background:#3a2f55;color:#cdb8ff;border-radius:3px;padding:0 4px;margin-right:5px;font-size:11px}
.atqm-tk{white-space:nowrap}
.atqm-id{color:#7fb8ff;text-decoration:none}
.atqm-id:hover{text-decoration:underline}
.atqm-copy{background:none;border:0;color:#6b7686;cursor:pointer;font-size:11px;padding:0 3px;margin-right:2px}
.atqm-copy:hover{color:#e6e6e6}
.atqm-at{color:#9aa4b2;margin-right:6px}
.atqm-sub{color:#9aa4b2}
.atqm-empty{color:#9aa4b2;padding:4px 0}
#atqm-btns{display:flex;gap:4px;padding:8px 10px;border-top:1px solid #33363c}
#atqm-btns button{flex:1;background:#2b2f36;color:#e6e6e6;border:1px solid #444;border-radius:4px;padding:4px 6px;cursor:pointer;font:inherit}
#atqm-btns button:hover{background:#3a3e46}
#atqm button:focus-visible,#atqm input:focus-visible,#atqm select:focus-visible,#atqm a:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
.atqm-set{display:grid;grid-template-columns:1fr auto;gap:7px 10px;align-items:center}
.atqm-field{display:flex;align-items:center;gap:5px;justify-self:end}
.atqm-set input,.atqm-set select{background:#2b2f36;color:#e6e6e6;border:1px solid #444;border-radius:4px;padding:3px 5px;font:inherit}
.atqm-set input[type=number]{width:64px}
.atqm-set input[type=text]{width:110px}
#atqm-rem{display:flex;flex-direction:column;gap:4px;padding:0 10px}
#atqm-rem:not(:empty){padding-bottom:8px}
#atqm.min #atqm-rem{padding-left:8px;padding-right:8px}
.atqm-rem{background:#22303f;border-left:3px solid #4ea1ff;border-radius:4px;padding:5px 7px;white-space:normal}
.atqm-rem.started{background:#1f2e24;border-left-color:#3fb950}
.atqm-rem-top{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.atqm-rem-top b{flex:1}
.atqm-rem-top button{background:#1f6feb;color:#fff;border:0;border-radius:4px;padding:2px 9px;cursor:pointer;font:inherit}
.atqm-rem-top button:hover{filter:brightness(1.15)}
.atqm-tag.atqm-ok{background:#1f3a26;color:#7ee2a0}
.atqm-beta{display:inline-block;margin-left:5px;padding:0 5px;border-radius:3px;background:#3a2f55;color:#cdb8ff;
  font-size:9px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;vertical-align:2px;line-height:15px}
#atqm-qs:not(:empty){padding:0 10px 8px}
#atqm.min #atqm-qs:not(:empty){padding:0 8px 7px}
.atqm-qsbox{background:#22303f;border-left:3px solid #4ea1ff;border-radius:4px;padding:6px 8px}
.atqm-qsbtns{display:flex;gap:6px;margin-top:6px}
.atqm-qsbtns button{background:#2b2f36;color:#e6e6e6;border:1px solid #555;border-radius:4px;padding:3px 10px;cursor:pointer;font:inherit}
.atqm-qsbtns .atqm-qsgo{background:#1f6feb;border-color:#1f6feb;color:#fff}
.atqm-qstop{margin-bottom:10px}
.atqm-qstop .atqm-qsgo{background:#1f6feb;border:1px solid #1f6feb;color:#fff;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit;width:100%}
.atqm-qstop .atqm-qsgo:hover{filter:brightness(1.15)}
.atqm-qstop .atqm-hint{margin-top:5px}
.atqm-list li.call{border-color:#8b7cf6}
.atqm-list li.callsoon{border-color:#4ea1ff;background:#22303f}
.atqm-list li.callsoon .atqm-when{color:#9cc8ff;font-weight:600}
.atqm-list li.callnow{border-color:#3fb950;background:#1f2e24}
.atqm-list li.callnow .atqm-when{color:#7ee2a0;font-weight:600}
.atqm-list li.callpast{border-color:#6b6f76}
.atqm-list li.paused{border-color:#6b7686}
.atqm-next li.callnow::before{background:#3fb950;color:#0d1117}
.atqm-next li.callsoon::before{background:#4ea1ff;color:#0d1117}
.atqm-next li.call::before{background:#8b7cf6;color:#fff}
.atqm-chip.call{border-color:#8b7cf6}
.atqm-mnote{background:none;border:0;border-top:1px solid #33363c;color:#e3b341;cursor:pointer;font:inherit;text-align:left;
  padding:5px 0 0;margin-top:2px;white-space:normal}
.atqm-mnote:hover{text-decoration:underline}
.atqm-set input[type=checkbox]{-webkit-appearance:none!important;appearance:none!important;opacity:1!important;
  visibility:visible!important;position:relative!important;display:inline-block!important;flex:none;
  width:30px!important;height:16px!important;min-width:0!important;margin:0!important;padding:0!important;
  border:1px solid #555!important;border-radius:9px!important;background:#2b2f36!important;cursor:pointer;
  transition:background-color .15s}
.atqm-set input[type=checkbox]::before{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;
  border-radius:50%;background:#9aa4b2;transition:transform .15s}
.atqm-set input[type=checkbox]:checked{background:#1f6feb!important;border-color:#1f6feb!important}
.atqm-set input[type=checkbox]:checked::before{transform:translateX(14px);background:#fff}
.atqm-onoff{color:#9aa4b2;width:22px}
.atqm-set-group{grid-column:1/-1;font-weight:600;margin-top:6px;padding-top:6px;border-top:1px solid #33363c}
.atqm-set-group:first-child{margin-top:0;padding-top:0;border-top:0}
.atqm-hint{grid-column:1/-1;color:#9aa4b2;font-size:11px;margin-top:-5px}
.atqm-warn{color:#e3b341}
.atqm-set-actions{display:flex;gap:4px;margin-top:12px}
.atqm-set-actions button{flex:1;background:#2b2f36;color:#e6e6e6;border:1px solid #444;border-radius:4px;padding:4px 6px;cursor:pointer;font:inherit}
.atqm-set-actions button:first-child{background:#1f6feb;border-color:#1f6feb}
.atqm-set-actions button:hover{filter:brightness(1.15)}
.atqm-saved{color:#3fb950;margin-top:6px;min-height:1.2em}
.atqm-store{margin-top:8px;padding-top:8px;border-top:1px solid #33363c}
@media (prefers-reduced-motion:reduce){.atqm-set input[type=checkbox],.atqm-set input[type=checkbox]::before{transition:none}}
#atqm-page{margin:0 10px 8px;padding:7px 9px;border-radius:4px;border-left:3px solid #4ea1ff;background:#22303f}
#atqm-page.here{border-left-color:#3fb950;background:#1f2e24}
#atqm-page.elsewhere{border-left-color:#6b7686;background:#26292f}
#atqm-page.untracked{border-left-color:#d29922;background:#2e2a1f}
.atqm-start{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.atqm-start button{background:#1f6feb;color:#fff;border:1px solid #1f6feb;border-radius:4px;padding:4px 8px;cursor:pointer;font:inherit;text-align:left}
.atqm-start button + button{background:#2b2f36;border-color:#555;color:#e6e6e6}
.atqm-start button:hover{filter:brightness(1.15)}
.atqm-qname{font-weight:600}
.atqm-qname .atqm-sub{font-weight:400}
.atqm-set select{max-width:150px}
.atqm-stop{background:#2b2f36;color:#ff9b9e;border:1px solid #5a3a3c;border-radius:4px;padding:3px 7px;cursor:pointer;font:inherit}
.atqm-stop:hover{background:#3a2a2c}
#atqm-panel > .atqm-set + .atqm-set{margin-top:6px}
`;

  // Position is kept as the distance from the top-right corner of the screen, so the widget's
  // top-right corner (and the +/- button) stays put when it changes size.
  function place(w, right, top) {
    const r = w.getBoundingClientRect();
    right = Math.max(0, Math.min(right, innerWidth - r.width));
    top = Math.max(0, Math.min(top, innerHeight - 30));
    Object.assign(w.style, { right: right + 'px', top: top + 'px', left: 'auto', bottom: 'auto' });
  }
  const savedPos = () => { const p = get(K.pos, null); return p && typeof p.right === 'number' ? p : null; };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Ticket number as a link (new tab, current window) plus a small copy button
  function ticketLink(id, ref) {
    const wrap = el('span', 'atqm-tk');
    const a = el('a', 'atqm-id', id);
    a.href = ticketUrl(id, ref);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Open ticket in a new tab';
    const copy = el('button', 'atqm-copy', '⧉');
    copy.title = 'Copy ticket number';
    copy.onclick = () => {
      navigator.clipboard?.writeText(id).then(() => { localNote = `Copied ${id}`; render(); });
    };
    wrap.append(a, copy);
    return wrap;
  }

  function linkify(text, urlFor) {
    const frag = document.createDocumentFragment();
    const re = new RegExp(TICKET_RE.source, 'g');
    let last = 0, m;
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index), ticketLink(m[0], urlFor(m[0])));
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  function health(q) {
    if (!get(K.enabled, false)) return { cls: 'off', text: 'Paused.' };
    const st = get(q.state, null);
    const openIt = { cls: 'warn', text: `Open ${qWhere(q)} in a tab and leave it open.` };
    if (!st) return openIt;
    const fresh = Date.now() - (st.ts || 0) < staleMs();
    if (fresh && (st.mode === 'waiting' || st.mode === 'error')) return { cls: 'warn', text: st.note };
    if (!st.lastScan) return openIt;
    if (Date.now() - st.lastScan > staleMs()) {
      return { cls: 'warn', text: `Last scan ${ago(st.lastScan)}. Is the ${qWhere(q)} tab still open?` };
    }
    const left = st.lastScan + CONFIG.refreshMs - Date.now();
    const next = left > 60000 ? `, next in ${dur(left)}` : ', next scan due now';
    if (st.partial) {
      const maxNote = st.max ? ` The grid shows at most ${st.max} rows;` : '';
      return { cls: 'warn', text: `Only ${st.count} of ${st.total} tickets visible, scanned ${ago(st.lastScan)}${next}.${maxNote} ` +
        `tickets beyond that aren't monitored. Narrow the view or sort by Created, newest first.` };
    }
    const unit = (q.mode === 'calls' ? 'call' : 'ticket') + (st.count === 1 ? '' : 's');
    if (st.colNote) return { cls: 'warn', text: `${st.count} ${unit}, scanned ${ago(st.lastScan)}. ${st.colNote}` };
    return { cls: 'ok', text: `${st.count} ${unit}, scanned ${ago(st.lastScan)}${next}${st.note ? '. ' + st.note : ''}` };
  }

  function statusClass(s) {
    if (/^new$/i.test(s)) return 'new';
    if (/waiting|escalat/i.test(s)) return 'waiting';
    if (/progress|dispatch|scheduled/i.test(s)) return 'progress';
    return '';
  }

  function chip(text, n, cls = '') {
    const c = el('span', 'atqm-chip ' + cls, text);
    c.append(el('b', null, n));
    return c;
  }

  function sectionHead(panel, title, sub) {
    const h = el('div', 'atqm-sec', title);
    if (sub) h.append(el('span', null, sub));
    panel.append(h);
  }

  function snapTickets(q) {
    const snap = get(q.snap, null);
    if (!snap) return null;
    const list = Object.entries(snap).map(([id, t]) => ({ id, ...t }));
    const ids = list.map(t => t.tid).filter(Boolean);
    for (const t of list) t.ids = ids;
    return list;
  }

  function dueList(items, dueKey, soon, subFn, emptyText) {
    const list = el('ul', 'atqm-list');
    if (!items.length) list.append(el('li', 'atqm-empty', emptyText));
    for (const t of items) {
      const diff = t[dueKey] - Date.now();
      const li = el('li', dueState(t[dueKey], soon));
      li.title = [t.account, t.priority, new Date(t[dueKey]).toLocaleString()].filter(Boolean).join(' | ');
      li.append(el('span', 'atqm-when', diff < 0 ? `${dur(diff)} overdue` : `in ${dur(diff)}`),
                el('span', 'atqm-at', `(${dueAt(t[dueKey])})`), ticketLink(t.id, t));
      li.append(document.createElement('br'));
      li.append(el('span', 'atqm-sub', subFn(t)));
      list.append(li);
    }
    return list;
  }

  function renderFull(panel, q, opts = {}) {
    if (!opts.compact) sectionHead(panel, qName(q), q.key === 'my' ? 'Open Tickets' : qWhere(q));
    const tickets = snapTickets(q);
    if (!tickets) {
      panel.append(el('div', 'atqm-empty', `No data yet. Fills in after the first scan of ${qWhere(q)}.`));
      return;
    }

    if (CONFIG.showStatusCounts && !opts.compact) {
      const counts = new Map();
      for (const t of tickets) counts.set(t.status || 'Unknown', (counts.get(t.status || 'Unknown') || 0) + 1);
      const chips = el('div', 'atqm-chips');
      for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) chips.append(chip(s, n, statusClass(s)));
      const high = tickets.filter(t => /high|critical|urgent/i.test(t.priority || '')).length;
      if (high) chips.append(chip('High priority', high, 'high'));
      panel.append(chips);
    }

    panel.append(el('div', 'atqm-h', 'Next SLA events'));
    const upcoming = tickets.filter(t => t.due && !slaPaused(t)).sort((a, b) => a.due - b.due).slice(0, CONFIG.upcomingCount);
    panel.append(dueList(upcoming, 'due', CONFIG.dueSoonMinutes,
      t => [t.slaEvent, t.title].filter(Boolean).join(': '), 'No SLA deadlines in this queue.'));
    pausedNote(panel, tickets);

    const recent = get(K.alerts, []).filter(a => (a.q || 'my') === q.key).slice(-3).reverse();
    if (recent.length && !opts.compact) {
      panel.append(el('div', 'atqm-h', 'Latest changes'));
      panel.append(alertList(recent, false));
    }
  }

  function renderIntake(panel, q, opts = {}) {
    if (!opts.compact) sectionHead(panel, qName(q), qWhere(q));
    const tickets = snapTickets(q);
    if (!tickets) {
      panel.append(el('div', 'atqm-empty', `Open ${qWhere(q)} in a tab and leave it open. Sort it by Created, newest first.`));
      return;
    }

    const live = tickets.filter(t => !slaPaused(t));
    const frOver = live.filter(t => dueState(t.frDue, CONFIG.frSoonMinutes) === 'overdue').length;
    const frSoon = live.filter(t => dueState(t.frDue, CONFIG.frSoonMinutes) === 'soon').length;
    const newCount = tickets.filter(t => /^new$/i.test(t.status || '')).length;
    const chips = el('div', 'atqm-chips');
    chips.append(chip('Tickets', tickets.length));
    if (newCount) chips.append(chip('Status New', newCount, 'new'));
    if (frOver) chips.append(chip('Response breached', frOver, 'overdue'));
    if (frSoon) chips.append(chip('Response due soon', frSoon, 'soon'));
    if (!opts.compact) panel.append(chips);

    panel.append(el('div', 'atqm-h', 'First responses due'));
    const due = live.filter(t => t.frDue).sort((a, b) => a.frDue - b.frDue).slice(0, CONFIG.upcomingCount);
    panel.append(dueList(due, 'frDue', CONFIG.frSoonMinutes,
      t => [t.account, t.title].filter(Boolean).join(': '), 'No first response deadlines in this queue.'));

    // Tickets still in status New (not every ticket carries an SLA, but every arrival needs a look)
    const hasStatus = tickets.some(t => t.status);
    const byAge = (a, b) => (b.created || b.firstSeen) - (a.created || a.firstSeen);
    const pool = hasStatus ? tickets.filter(t => /^new$/i.test(t.status || '')) : tickets;
    const cap = Math.max(CONFIG.upcomingCount, 10);
    const newest = pool.slice().sort(byAge).slice(0, cap);
    panel.append(el('div', 'atqm-h', hasStatus ? `Tickets in New status (${pool.length})` : 'Newest tickets'));
    const nl = el('ul', 'atqm-list');
    if (!newest.length) nl.append(el('li', 'atqm-empty', 'Nothing in New status right now.'));
    for (const t of newest) {
      const li = el('li', 'new');
      li.append(el('span', 'atqm-when', ago(t.created || t.firstSeen)), ticketLink(t.id, t));
      li.append(document.createElement('br'));
      li.append(el('span', 'atqm-sub', [t.account, t.title, t.priority].filter(Boolean).join(': ')));
      nl.append(li);
    }
    if (pool.length > cap) nl.append(el('li', 'atqm-empty', `…and ${pool.length - cap} more in New status`));
    panel.append(nl);
  }

  function callLink(c, text) {
    const a = el('a', 'atqm-id', text || c.account || 'Service call');
    a.href = c.url || callUrl(c.id);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Open service call in a new tab';
    return a;
  }

  // Paused-SLA tickets: shown as waiting on their scheduled call rather than as SLA deadlines
  function pausedNote(panel, tickets) {
    const paused = tickets.filter(slaPaused);
    if (!paused.length) return;
    panel.append(el('div', 'atqm-h', `SLA paused (${paused.length}): ${pausedList().join(', ')}`));
    const list = el('ul', 'atqm-list');
    for (const t of paused.slice(0, CONFIG.upcomingCount)) {
      const li = el('li', 'paused');
      li.append(el('span', 'atqm-when', t.status), ticketLink(t.id, t));
      li.append(document.createElement('br'), el('span', 'atqm-sub', [t.account, t.title].filter(Boolean).join(': ')));
      list.append(li);
    }
    if (paused.length > CONFIG.upcomingCount) list.append(el('li', 'atqm-empty', `…and ${paused.length - CONFIG.upcomingCount} more`));
    panel.append(list);
  }

  // One service call row. Calls are appointments: nothing is due until the start time,
  // so there's no overdue/SLA colouring – just upcoming, starting soon, in progress or past.
  function callRow(c, { showDismissed = true } = {}) {
    const now = Date.now();
    const started = c.start && c.start <= now;
    const ended = c.end && c.end <= now;
    const lead = maxLead() * 60000;
    const li = el('li', ended ? 'callpast' : started ? 'callnow' : c.start - now <= lead ? 'callsoon' : 'call');
    li.title = [c.status, c.priority, c.resources].filter(Boolean).join(' | ');
    let when;
    if (!c.start) when = 'no time set';
    else if (ended) when = `ended ${dur(now - c.end)} ago`;
    else if (started) when = `started ${dur(now - c.start)} ago, ends ${timeOf(c.end)}`;
    else when = `starts in ${dur(c.start - now)}`;
    li.append(el('span', 'atqm-when', when));
    if (c.start && !started) li.append(el('span', 'atqm-at', `(${dueAt(c.start)})`));
    li.append(callLink(c));
    if (showDismissed && get(K.dismissed, {})[c.id]) li.append(' ', el('span', 'atqm-tag atqm-ok', 'on it'));
    li.append(document.createElement('br'));
    li.append(el('span', 'atqm-sub', [c.description || '(no description)', c.priority].filter(Boolean).join(': ')));
    return li;
  }

  function renderCalls(panel, q, opts = {}) {
    if (!opts.compact) sectionHead(panel, 'Service calls', qWhere(q));
    const calls = snapTickets(q);
    if (!calls) {
      panel.append(el('div', 'atqm-empty', `No data yet. Fills in after the first scan of ${qWhere(q)}.`));
      return;
    }
    const now = Date.now();
    const live = calls.filter(c => c.start && c.end > now).sort((a, b) => a.start - b.start);
    const inProgress = live.filter(c => c.start <= now);
    const upcoming = live.filter(c => c.start > now);
    const endOfDay = new Date().setHours(23, 59, 59, 999);
    const today = upcoming.filter(c => c.start <= endOfDay);
    const notDone = calls.filter(c => c.end && c.end <= now).sort((a, b) => b.end - a.end);

    const chips = el('div', 'atqm-chips');
    if (inProgress.length) chips.append(chip('Now', inProgress.length, 'new'));
    chips.append(chip('Later today', today.length, today.length ? 'progress' : ''));
    chips.append(chip('Upcoming', upcoming.length, 'call'));
    if (notDone.length) chips.append(chip('Past, not closed', notDone.length));
    if (!opts.compact) panel.append(chips);

    panel.append(el('div', 'atqm-h', 'Now and next'));
    const list = el('ul', 'atqm-list');
    if (!live.length) list.append(el('li', 'atqm-empty', 'No upcoming service calls.'));
    for (const c of live.slice(0, CONFIG.upcomingCount)) list.append(callRow(c));
    if (live.length > CONFIG.upcomingCount) list.append(el('li', 'atqm-empty', `…and ${live.length - CONFIG.upcomingCount} more`));
    panel.append(list);

    if (notDone.length) {
      panel.append(el('div', 'atqm-h', `Past calls not closed in Autotask (${notDone.length})`));
      const nl = el('ul', 'atqm-list');
      for (const c of notDone.slice(0, Math.min(3, CONFIG.upcomingCount))) nl.append(callRow(c, { showDismissed: false }));
      if (notDone.length > 3) nl.append(el('li', 'atqm-empty', `…and ${notDone.length - 3} older`));
      panel.append(nl);
    }
  }

  const renderQueue = (panel, q, opts) =>
    (q.mode === 'calls' ? renderCalls : q.mode === 'intake' ? renderIntake : renderFull)(panel, q, opts);

  // ---- Queue statistics for the locked view ----
  function queueStats(q) {
    const items = snapTickets(q) || [];
    const now = Date.now();
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const endOfDay = new Date().setHours(23, 59, 59, 999);
    const today = get(K.alerts, []).filter(a => (a.q || 'my') === q.key && a.ts >= startOfDay);
    const stat = (label, value, cls = '', sub = '') => ({ label, value, cls, sub });
    const age = t => t.created || t.firstSeen;
    const oldest = list => list.length ? dur(now - Math.min(...list.map(age))) : '–';

    if (q.mode === 'calls') {
      const live = items.filter(c => c.start && c.end > now).sort((a, b) => a.start - b.start);
      const inProgress = live.filter(c => c.start <= now);
      const upcoming = live.filter(c => c.start > now);
      const later = upcoming.filter(c => c.start <= endOfDay);
      const next = upcoming[0];
      return [
        stat('Calls in view', items.length),
        stat('In progress', inProgress.length, inProgress.length ? 'new' : ''),
        stat('Later today', later.length, later.length ? 'progress' : ''),
        stat('Next call', next ? (next.start <= endOfDay ? timeOf(next.start) : dueAt(next.start).replace(/^tomorrow /, 'Tmrw ')) : '–',
          next ? 'call' : '', next ? `in ${dur(next.start - now)}${next.account ? ' · ' + next.account : ''}` : ''),
        stat('Upcoming', upcoming.length, 'call'),
        stat('Past, not closed', items.filter(c => c.end && c.end <= now).length),
        stat('Changes today', today.length, '', today.length ? `${today.filter(a => a.type === 'new').length} new, ${today.filter(a => a.type === 'removed').length} gone` : ''),
      ];
    }

    const live = items.filter(t => !slaPaused(t));
    const isNew = t => /^new$/i.test(t.status || '');
    const high = items.filter(t => /high|critical|urgent/i.test(t.priority || '')).length;

    if (q.mode === 'intake') {
      const newOnes = items.filter(isNew);
      const frOver = live.filter(t => dueState(t.frDue, CONFIG.frSoonMinutes) === 'overdue').length;
      const frSoon = live.filter(t => dueState(t.frDue, CONFIG.frSoonMinutes) === 'soon').length;
      const arrived = today.filter(a => a.type === 'new').length;
      return [
        stat('Tickets', items.length),
        stat('In New status', newOnes.length, newOnes.length ? 'new' : ''),
        stat('Response breached', frOver, frOver ? 'overdue' : ''),
        stat(`Response due < ${CONFIG.frSoonMinutes}m`, frSoon, frSoon ? 'soon' : ''),
        stat('Arrived today', arrived, '', 'new tickets seen since midnight'),
        stat('Longest waiting', oldest(newOnes), newOnes.length ? '' : '', 'oldest ticket still in New'),
        stat('High priority', high, high ? 'overdue' : ''),
      ];
    }

    // All changes
    const breached = live.filter(t => t.due && t.due < now).length;
    const soon = live.filter(t => dueState(t.due, CONFIG.dueSoonMinutes) === 'soon').length;
    const paused = items.filter(slaPaused).length;
    return [
      stat('Tickets', items.length),
      stat('SLA breached', breached, breached ? 'overdue' : ''),
      stat(`SLA due < ${dur(CONFIG.dueSoonMinutes * 60000)}`, soon, soon ? 'soon' : ''),
      stat('SLA paused', paused, '', paused ? pausedList().join(', ') : ''),
      stat('High priority', high, high ? 'overdue' : ''),
      stat('In New status', items.filter(isNew).length, items.some(isNew) ? 'new' : ''),
      stat('Oldest ticket', oldest(items), '', 'by created date, or first seen'),
      stat('Changes today', today.length, '', today.length ? `${today.filter(a => a.type === 'new').length} new, ${today.filter(a => a.type === 'removed').length} left` : ''),
    ];
  }

  function statusBreakdown(q) {
    const items = snapTickets(q) || [];
    const counts = new Map();
    for (const t of items) counts.set(t.status || 'Unknown', (counts.get(t.status || 'Unknown') || 0) + 1);
    const chips = el('div', 'atqm-chips');
    for (const [st, n] of [...counts].sort((a, b) => b[1] - a[1])) chips.append(chip(st, n, statusClass(st)));
    return chips;
  }

  // The locked monitoring tab shows only this queue: its status, stats, lists and changes
  function renderLockView(box, q) {
    const scroll = box.scrollTop;
    box.replaceChildren();
    const title = el('div', 'lv-title');
    title.append(el('b', null, qName(q)), el('span', null, qWhere(q)), el('span', 'lv-mode', MODES[q.mode]?.label || ''));
    const h = health(q);
    const why = el('div', 'lv-why');
    why.append(el('b', null, 'Page locked to keep monitoring running.'),
      ' Clicking around this page (another queue, a ticket, a refresh) would stop it updating, so it\'s greyed out. Use ',
      el('b', null, 'Unlock for 5 min'), ' if you need it.');
    box.append(title, el('div', 'lv-health ' + h.cls, h.text), why);

    if (!snapTickets(q)) {
      box.append(el('div', 'atqm-empty', 'Collecting the first scan of this queue…'));
      return;
    }
    const stats = el('div', 'lv-stats');
    for (const s of queueStats(q)) {
      const card = el('div', 'lv-stat ' + s.cls);
      card.append(el('div', 'v', String(s.value)), el('div', 'l', s.label));
      // Short notes show under the number; longer explanations go in the tooltip
      if (s.sub && s.sub.length <= 22) card.append(el('div', 's', s.sub));
      else if (s.sub) card.title = s.sub;
      stats.append(card);
    }
    box.append(stats);
    if (q.mode !== 'calls') {
      const sb = el('div', 'lv-statuses');
      sb.append(el('span', 'atqm-h', 'By status'), statusBreakdown(q));
      box.append(sb);
    }

    const cols = el('div', 'lv-cols');
    const left = el('div', 'lv-col');
    renderQueue(left, q, { compact: true });
    const right = el('div', 'lv-col');
    right.append(el('div', 'atqm-h', 'Changes in this queue'));
    const changes = get(K.alerts, []).filter(a => (a.q || 'my') === q.key).slice(-15).reverse();
    if (changes.length) right.append(alertList(changes, false));
    else right.append(el('div', 'atqm-empty', 'No changes yet.'));
    cols.append(left, right);
    box.append(cols);

    const foot = el('div', 'lv-foot');
    const scan = el('button', null, 'Scan now');
    scan.onclick = requestScan;
    foot.append(el('span', null, 'Keep this tab open: it refreshes the queue and feeds the Queue monitor in your other tabs.'), scan);
    box.append(foot);
    box.scrollTop = scroll;
  }

  // Page-specific banner: what this tab is doing with the queue it shows
  function renderPageBanner(box, pg) {
    box.replaceChildren();
    box.className = '';
    if (!pg.cur) { box.hidden = true; return; }
    box.hidden = false;
    const where = pg.cur.section ? `${pg.cur.section} > ${pg.cur.nav}` : pg.cur.nav;

    if (pg.q) {
      const enabled = get(K.enabled, false);
      if (pg.owns) {
        box.className = 'here';
        box.append(el('b', null, `This tab is monitoring ${qName(pg.q)}.`), ' Keep it open.');
      } else if (pg.foreign) {
        box.className = 'elsewhere';
        box.append(el('b', null, `${qName(pg.q)} is already tracked in another tab.`), ' This tab only shows the overview.');
        const btns = el('div', 'atqm-start');
        const b = el('button', null, 'Swap monitoring to this tab');
        b.title = 'Monitor from here instead; the other tab stops on its next scan';
        b.onclick = () => {
          if (pg.remote) { try { pg.remote.postMessage({ atqm: 'takeover', qKey: pg.q.key }, '*'); } catch { /* frame gone */ } }
          else takeOver(pg.q);
          localNote = 'Swapping monitoring to this tab…';
          render();
          setTimeout(() => { localNote = ''; pageCache.t = 0; render(); }, 2500);
        };
        btns.append(b);
        box.append(btns);
      } else {
        box.className = 'here';
        box.append(el('b', null, `${qName(pg.q)} is tracked.`), enabled ? ' Starting monitoring in this tab…' : ' Press Start to monitor it here.');
      }
      return;
    }

    if (pg.isCalls && !CONFIG.serviceCalls) {
      box.className = 'elsewhere';
      box.append(el('b', null, 'Service calls page.'), ' Turn on Service calls in Settings to track it.');
      return;
    }
    box.className = 'untracked';
    box.append(el('b', null, `${where} isn't tracked.`));
    const btns = el('div', 'atqm-start');
    const modes = pg.isCalls ? ['calls'] : ['full', 'intake'];
    const labels = { full: 'Start tracking: all changes', intake: 'Start tracking: new tickets & first response', calls: 'Start tracking service calls' };
    for (const mode of modes) {
      const m = MODES[mode];
      const b = el('button', null, labels[mode]);
      b.title = m.hint;
      b.onclick = () => {
        if (pg.remote) { try { pg.remote.postMessage({ atqm: 'start', cur: pg.cur, mode }, '*'); } catch { /* frame gone */ } }
        else startTracking(pg.cur, mode);
        localNote = `Tracking ${pg.cur.nav}…`;
        render();
        setTimeout(() => { localNote = ''; pageCache.t = 0; render(); }, 2500);
      };
      btns.append(b);
    }
    box.append(btns);
  }

  // What to do next, in priority order:
  // 1. first response SLAs  2. new tickets without an SLA  3. your queue's SLAs
  const NEXT_GROUPS = {
    0: 'Service call now',
    1: 'First response SLAs',
    2: 'New tickets without an SLA',
    3: 'Your queue SLAs',
    4: 'Scheduled calls later today',
  };
  function nextUpItems() {
    const qs = activeQueues();
    const intake = qs.filter(q => q.mode === 'intake');
    const full = qs.filter(q => q.mode === 'full');
    const items = [], taken = new Set();
    const add = (pri, t, q, extra) => {
      if (taken.has(t.id)) return;
      taken.add(t.id);
      items.push({ pri, t, q, ...extra });
    };
    const ticketQs = qs.filter(q => q.mode !== 'calls');
    const all = ticketQs.flatMap(q => (snapTickets(q) || []).map(t => ({ t, q })));
    const byTime = key => (a, b) => a.t[key] - b.t[key];

    // Service calls are appointments: one that has started goes to the top (that's what you should be
    // doing); calls still to come today sit at the bottom with their start times – reminders handle the lead-up
    const now = Date.now(), endOfDay = new Date().setHours(23, 59, 59, 999);
    const calls = qs.filter(q => q.mode === 'calls')
      .flatMap(q => (snapTickets(q) || []).map(c => ({ c, q })))
      .filter(x => x.c.start && x.c.end > now).sort((a, b) => a.c.start - b.c.start);
    const later = [];
    for (const x of calls) {
      if (x.c.start <= now) items.push({ pri: 0, kind: 'call', c: x.c, q: x.q });
      else if (x.c.start <= endOfDay) later.push({ pri: 4, kind: 'call', c: x.c, q: x.q });
    }

    // 1. Any ticket with a first response due, soonest first (from every tracked queue)
    all.filter(x => x.t.frDue && !slaPaused(x.t)).sort(byTime('frDue'))
      .forEach(x => add(1, x.t, x.q, { due: x.t.frDue, soon: CONFIG.frSoonMinutes, what: 'First response' }));
    // 2. New tickets in intake queues with no first response SLA, oldest first (longest waiting)
    all.filter(x => intake.includes(x.q) && /^new$/i.test(x.t.status || '') && !x.t.frDue)
      .map(x => ({ ...x, age: x.t.created || x.t.firstSeen })).sort((a, b) => a.age - b.age)
      .forEach(x => add(2, x.t, x.q, { age: x.age }));
    // 3. SLA deadlines in your own queue(s), soonest first
    all.filter(x => full.includes(x.q) && x.t.due && !slaPaused(x.t)).sort(byTime('due'))
      .forEach(x => add(3, x.t, x.q, { due: x.t.due, soon: CONFIG.dueSoonMinutes, what: x.t.slaEvent || 'SLA' }));
    return items.concat(later);
  }

  function renderNextUp(panel) {
    const qs = activeQueues();
    const items = nextUpItems();
    if (!qs.some(q => q.mode === 'intake')) {
      panel.append(el('div', 'atqm-hint', 'Tip: track a queue for new tickets & first response to fill the first two groups.'));
    }
    if (!items.length) {
      panel.append(el('div', 'atqm-empty', 'All clear. Nothing needs action right now.'));
      return;
    }
    const list = el('ol', 'atqm-list atqm-next');
    let lastPri = -1;
    for (const it of items) {
      if (it.pri !== lastPri) {
        lastPri = it.pri;
        list.append(el('li', 'atqm-next-h', NEXT_GROUPS[it.pri]));
      }
      if (it.kind === 'call') { list.append(callRow(it.c)); continue; }
      const t = it.t;
      const li = el('li', it.due ? dueState(it.due, it.soon) : 'new');
      li.title = [qWhere(it.q), t.account, t.priority, t.status].filter(Boolean).join(' | ');
      if (it.due) {
        const diff = it.due - Date.now();
        li.append(el('span', 'atqm-when', diff < 0 ? `${dur(diff)} overdue` : `in ${dur(diff)}`),
                  el('span', 'atqm-at', `(${dueAt(it.due)})`));
      } else {
        li.append(el('span', 'atqm-when', `waiting ${dur(Date.now() - it.age)}`));
      }
      li.append(ticketLink(t.id, t));
      li.append(document.createElement('br'));
      if (qs.length > 1) li.append(el('span', 'atqm-tag', qName(it.q)));
      li.append(el('span', 'atqm-sub', [it.what, t.account, t.title].filter(Boolean).join(': ')));
      list.append(li);
    }
    panel.append(list);
  }

  function renderOverview(panel, pg) {
    const qs = activeQueues();
    if (!qs.length) {
      panel.append(el('div', 'atqm-empty', 'No queues tracked. Open a queue in My Workspace & Queues and press Start tracking.'));
      return;
    }
    // On a queue's own monitoring tab, focus on that queue only
    if (pg.q && !pg.foreign) { renderQueue(panel, pg.q); return; }
    const order = pg.q ? [pg.q, ...qs.filter(q => q.key !== pg.q.key)] : qs;
    for (const q of order) renderQueue(panel, q);
  }

  function alertList(alerts, showTags = true) {
    const list = el('ul', 'atqm-list');
    const snaps = {};
    for (const q of trackedQueues()) for (const t of snapTickets(q) || []) snaps[t.id] = t;
    for (const a of alerts) {
      const li = el('li', a.type + (a.read ? '' : ' unread'));
      const urlFor = id => snaps[id] || (id === a.ticket ? a : null);
      li.append(el('time', null, fmtTime(a.ts)));
      if (showTags && (a.q || 'my') !== 'my') li.append(el('span', 'atqm-tag', a.qn || (a.q === 'first' ? 'Support 1st Line' : a.q)));
      li.append(linkify(a.text, urlFor));
      if (a.callUrl) {
        const link = callLink({ url: a.callUrl, id: a.call }, 'Open call');
        li.append(' ', link);
      }
      list.append(li);
    }
    return list;
  }

  function renderChanges(panel) {
    const alerts = get(K.alerts, []).slice(-CONFIG.displayAlerts).reverse();
    if (!alerts.length) panel.append(el('div', 'atqm-empty', 'No changes since monitoring started.'));
    else panel.append(alertList(alerts));
  }

  const FIELDS = [
    { group: 'General' },
    { key: 'refreshMs', label: 'Refresh queues every', unit: 'min', type: 'number', min: 0.5, max: 60, step: 0.5,
      toUi: v => v / 60000, fromUi: v => Math.round(v * 60000),
      hint: 'Browsers may slow background tabs to about one refresh a minute.' },
    { key: 'upcomingCount', label: 'Rows shown in each list', type: 'number', min: 1, max: 20, step: 1 },
    { key: 'maxAlerts', label: 'Changes kept in history', type: 'number', min: 20, max: 1000, step: 10 },
    { key: 'dateOrder', label: 'Date format in Autotask', type: 'select', options: [['DMY', 'Day/month (UK)'], ['MDY', 'Month/day (US)']] },
    { key: 'linkStyle', label: 'Open tickets using', type: 'select',
      options: [['detail', 'Ticket page'], ['command', 'Autotask command link'], ['grid', 'Grid link']],
      hint: 'Ticket page opens the normal ticket tab. The other two tend to pop out into a separate window.' },
    { group: 'Window' },
    { key: 'lockMonitorTabs', label: 'Lock monitoring tabs', type: 'checkbox',
      hint: "A tab that's monitoring a queue shows this window large in the middle and greys out the page, so it can't be changed by accident. Automatic refreshes still work. You can unlock it for 5 minutes from the window." },
    { key: 'opacity', label: 'Opacity when expanded', unit: '%', type: 'number', min: 20, max: 100, step: 5 },
    { key: 'opacityMin', label: 'Opacity when minimised', unit: '%', type: 'number', min: 20, max: 100, step: 5,
      hint: 'The window turns fully opaque while the mouse is over it.' },
    { key: 'autoColumns', label: 'Add missing columns automatically', type: 'checkbox',
      hint: "Uses the grid's Column Chooser to add columns the monitor needs, like Ticket Number or Next SLA Event Due. This changes your saved view for that grid." },
    { key: 'showStatusCounts', label: 'Show status counts', type: 'checkbox',
      hint: 'Ticket counts per status at the top of queues tracked for all changes.' },
    { key: 'firstLineOverview', label: 'First line overview', type: 'checkbox',
      hint: 'Adds a "Next up" tab: first response SLAs, then new tickets without an SLA, then your queue\'s SLAs. Work from the top.' },
    { group: 'Service calls' },
    { key: 'serviceCalls', label: 'Service calls', type: 'checkbox',
      hint: 'Lets you track My Workspace > Service Calls. Your calls then appear in Overview and Next up.' },
    { key: 'callReminders', label: 'Call reminders', type: 'checkbox',
      hint: 'Pings before a call starts, with a Dismiss button in this window.' },
    { key: 'callLeadTimes', label: 'Remind before start', unit: 'min', type: 'text',
      sanitize: v => {
        const n = [...new Set(String(v).split(/[^\d]+/).filter(Boolean).map(Number).filter(x => x >= 0 && x <= 240))].sort((a, b) => b - a);
        return n.length ? n.join(', ') : DEFAULTS.callLeadTimes;
      },
      hint: 'Comma-separated minutes, e.g. 15, 10, 5, 0.' },
    { key: 'callPingAfterStart', label: 'Keep pinging after the call starts', type: 'checkbox',
      hint: 'Every minute until you press Dismiss or the call ends.' },
    { group: 'SLA warnings' },
    { key: 'dueSoonMinutes', label: 'Warn when an SLA is due within', unit: 'min', type: 'number', min: 5, max: 1440, step: 5,
      hint: 'Queues tracked for all changes.' },
    { key: 'frSoonMinutes', label: 'Warn when a first response is due within', unit: 'min', type: 'number', min: 5, max: 240, step: 5,
      hint: 'Queues tracked for new tickets & first response.' },
    { key: 'pausedStatuses', label: 'Statuses that pause the SLA', type: 'text',
      sanitize: v => String(v).split(',').map(clean).filter(Boolean).join(', '),
      hint: 'Comma-separated. Tickets in these statuses get no SLA warnings, e.g. Scheduled while waiting for a service call. Leave empty to never pause.' },
    { group: 'Alerts' },
    { key: 'notify', label: 'Desktop notifications', type: 'checkbox' },
    { key: 'sound', label: 'Sound on new alerts', type: 'checkbox' },
    { key: 'hideInPopups', label: 'Hide in ticket pop-up windows', type: 'checkbox', hint: 'Takes effect on the next page load.' },
  ];

  function renderTrackedQueues(panel, rerender) {
    const box = el('div', 'atqm-set');
    box.append(el('div', 'atqm-set-group', 'Tracked queues'));
    const qs = trackedQueues();
    if (!qs.length) box.append(el('div', 'atqm-hint', 'None yet.'));
    for (const q of qs) {
      const name = el('div', 'atqm-qname', qName(q));
      if (q.key !== 'my' || q.section) name.append(el('span', 'atqm-sub', ' ' + qWhere(q)));
      const ctl = el('span', 'atqm-field');
      if (q.mode === 'calls' && !CONFIG.serviceCalls) name.append(el('span', 'atqm-warn', ' (Service calls setting is off)'));
      const sel = el('select');
      sel.setAttribute('aria-label', `Tracking for ${qName(q)}`);
      const choices = q.mode === 'calls' ? ['calls'] : ['full', 'intake'];
      for (const v of choices) { const o = el('option', null, MODES[v].label); o.value = v; sel.append(o); }
      sel.value = q.mode;
      sel.disabled = q.mode === 'calls';
      sel.onchange = () => {
        saveQueues(trackedQueues().map(x => (x.key === q.key ? { ...x, mode: sel.value } : x)));
        [q.snap, q.seen].forEach(del); // fresh baseline for the new style
        rerender('Tracking style updated. It takes a fresh baseline on the next scan.');
      };
      const stop = el('button', 'atqm-stop', 'Stop');
      stop.title = 'Stop tracking this queue';
      stop.onclick = () => {
        if (!confirm(`Stop tracking ${qWhere(q)}? Its tickets are cleared from the overview; past changes stay in history.`)) return;
        stopTracking(q);
        rerender(`Stopped tracking ${qName(q)}.`);
      };
      ctl.append(sel, stop);
      box.append(name, ctl);
    }
    box.append(el('div', 'atqm-hint', 'To track another queue, open it in My Workspace & Queues and press Start tracking.'));
    panel.append(box);
  }

  function renderSettings(panel, message = '') {
    panel.replaceChildren();
    const msg = el('div', 'atqm-saved', message);
    const flash = t => { msg.textContent = t; setTimeout(() => { if (msg.textContent === t) msg.textContent = ''; }, 5000); };
    const rerender = t => { renderSettings(panel, t); render(); };

    // Quick start / move queue tabs to this window – first thing in Settings
    const qsBox = el('div', 'atqm-qsbox atqm-qstop');
    const moving = busyElsewhere().length > 0;
    const qsBtn = el('button', 'atqm-qsgo', moving ? 'Move queue tabs to this window' : 'Quick start: open all tracked queues');
    qsBtn.onclick = () => { set(K.qsSnooze, 0); quickStart(); setTimeout(() => rerender(''), 1500); };
    qsBox.append(qsBtn, el('div', 'atqm-hint', moving
      ? 'Closes the tabs monitoring your queues and reopens them in this window, so you can minimise it out of the way.'
      : 'Opens a tab for each tracked queue in this window. Press it again later from another window to move them there.'));
    panel.append(qsBox);

    renderTrackedQueues(panel, rerender);

    const grid = el('div', 'atqm-set');
    const inputs = {};
    for (const f of FIELDS) {
      if (f.group) { grid.append(el('div', 'atqm-set-group', f.group)); continue; }
      const id = 'atqm-f-' + f.key;
      const lab = el('label', null, f.label);
      lab.htmlFor = id;
      let input;
      if (f.type === 'select') {
        input = el('select');
        for (const [v, t] of f.options) { const o = el('option', null, t); o.value = v; input.append(o); }
        input.value = CONFIG[f.key];
      } else {
        input = el('input');
        input.type = f.type;
        if (f.type === 'checkbox') input.checked = !!CONFIG[f.key];
        else {
          input.value = f.toUi ? f.toUi(CONFIG[f.key]) : CONFIG[f.key];
          if (f.type === 'number') Object.assign(input, { min: f.min, max: f.max, step: f.step });
        }
      }
      input.id = id;
      inputs[f.key] = input;
      const wrap = el('span', 'atqm-field');
      wrap.append(input);
      if (f.type === 'checkbox') {
        const state = el('span', 'atqm-onoff', input.checked ? 'On' : 'Off');
        input.addEventListener('change', () => { state.textContent = input.checked ? 'On' : 'Off'; });
        wrap.append(state);
      }
      if (f.unit) wrap.append(el('span', 'atqm-sub', f.unit));
      grid.append(lab, wrap);
      if (f.hint) grid.append(el('div', 'atqm-hint', f.hint));
    }

    if ('Notification' in window && Notification.permission === 'denied') {
      grid.append(el('div', 'atqm-hint atqm-warn', 'Notifications are blocked for this site in your browser settings.'));
    }

    const save = el('button', null, 'Save');
    save.onclick = () => {
      const out = {};
      for (const f of FIELDS) {
        if (f.group) continue;
        const input = inputs[f.key];
        if (f.type === 'checkbox') out[f.key] = input.checked;
        else if (f.type === 'number') {
          let v = parseFloat(input.value);
          if (Number.isNaN(v)) v = f.toUi ? f.toUi(DEFAULTS[f.key]) : DEFAULTS[f.key];
          v = Math.min(f.max, Math.max(f.min, v));
          input.value = v;
          out[f.key] = f.fromUi ? f.fromUi(v) : v;
        } else {
          out[f.key] = f.sanitize ? f.sanitize(input.value) : clean(input.value) || DEFAULTS[f.key];
          input.value = out[f.key];
        }
      }
      const turnedOn = out.firstLineOverview && !CONFIG.firstLineOverview;
      set(K.settings, out);
      loadSettings();
      if (turnedOn) set(K.tab, 'next');
      if (CONFIG.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      reschedule();
      flash('Settings saved. All Autotask tabs now use them.');
      render();
    };

    const test = el('button', null, 'Test alert');
    test.onclick = () => {
      notify('Queue monitor', [{ type: 'new', text: 'Test alert from Queue monitor' }]);
      flash(CONFIG.notify || CONFIG.sound ? 'Test alert sent.' : 'Sound and notifications are both off.');
    };

    const reset = el('button', null, 'Reset to defaults');
    reset.title = 'Resets the settings below; tracked queues are kept';
    reset.onclick = () => {
      if (!confirm('Reset monitor settings to their defaults? Your tracked queues are kept.')) return;
      del(K.settings);
      loadSettings();
      reschedule();
      rerender('Settings reset to defaults.');
    };

    const actions = el('div', 'atqm-set-actions');
    actions.append(save, test, reset);
    const note = el('div', 'atqm-hint atqm-store',
      `Settings and history are stored in this browser only. Clearing site data for autotask.net, resetting the browser profile, or using another browser or PC starts fresh. Queue monitor ${VERSION} (beta).`);
    panel.append(grid, actions, msg, note);
  }

  function createWidget() {
    if (document.getElementById('atqm') || !document.body || document.body.tagName === 'FRAMESET') return;

    document.head.append(el('style', null, CSS));
    const w = el('div');
    w.id = 'atqm';
    w.innerHTML = `
      <div id="atqm-head"><span id="atqm-dot"></span><b>Queue monitor <span class="atqm-beta" title="Queue monitor ${VERSION} (beta)">Beta</span></b>
        <span id="atqm-badge" class="atqm-count"></span>
        <button id="atqm-min" title="Minimise">–</button></div>
      <div id="atqm-rem"></div>
      <div id="atqm-qs"></div>
      <div id="atqm-lockview"></div>
      <div id="atqm-mini"></div>
      <div id="atqm-health"></div>
      <div id="atqm-body">
        <div id="atqm-page" hidden></div>
        <div id="atqm-tabs" role="tablist">
          <button role="tab" data-tab="next" hidden>Next up</button>
          <button role="tab" data-tab="overview">Overview</button>
          <button role="tab" data-tab="changes">Changes</button>
          <button role="tab" data-tab="settings">Settings</button>
        </div>
        <div id="atqm-panel"></div>
        <div id="atqm-btns">
          <button id="atqm-toggle"></button>
          <button id="atqm-scan">Scan now</button>
          <button id="atqm-read">Mark read</button>
          <button id="atqm-clear">Clear</button>
        </div>
      </div>`;
    document.body.appendChild(w);

    w.classList.add('min'); // always starts minimised; expand when you need the detail
    const pos = savedPos();
    if (pos) place(w, pos.right, pos.top);

    w.querySelectorAll('#atqm-tabs button').forEach(b => {
      b.onclick = () => { set(K.tab, b.dataset.tab); render(); };
    });

    w.querySelector('#atqm-toggle').onclick = () => {
      const on = !get(K.enabled, false);
      set(K.enabled, on);
      if (on) {
        if (CONFIG.sound) beep(false); // unlocks audio with a user gesture
        if (CONFIG.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        tick();
      } else {
        trackedQueues().forEach(releaseLock);
        owned.clear();
      }
      render();
    };
    w.querySelector('#atqm-scan').onclick = requestScan;
    w.querySelector('#atqm-read').onclick = () => {
      set(K.alerts, get(K.alerts, []).map(a => ({ ...a, read: true })));
      render();
    };
    w.querySelector('#atqm-clear').onclick = () => {
      if (!confirm('Clear change history and re-baseline every tracked queue on its next scan?')) return;
      del(K.alerts);
      trackedQueues().forEach(q => { del(q.snap); del(q.seen); });
      render();
    };
    w.querySelector('#atqm-min').onclick = () => { w.classList.toggle('min'); render(); };

    const head = w.querySelector('#atqm-head');
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button') || w.classList.contains('locked')) return;
      const r = w.getBoundingClientRect();
      const dxr = r.right - e.clientX, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = ev => place(w, innerWidth - (ev.clientX + dxr), ev.clientY - dy);
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        head.removeEventListener('pointercancel', up);
        set(K.pos, { right: parseInt(w.style.right, 10) || 0, top: parseInt(w.style.top, 10) || 0 });
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      head.addEventListener('pointercancel', up);
    });
    addEventListener('resize', () => { const p = savedPos(); if (p) place(w, p.right, p.top); });

    render();
  }

  // ---- Lock monitoring tabs ----
  const UNLOCK_KEY = P + 'unlockedUntil';
  const unlockedUntil = () => { try { return +sessionStorage.getItem(UNLOCK_KEY) || 0; } catch { return 0; } };
  // Is this tab a locked monitoring tab? (the frame doing the monitoring owns the lock; the top window learns it from the frame)
  function lockActive(pg = pageInfo()) {
    if (!CONFIG.lockMonitorTabs || !get(K.enabled, false) || Date.now() < unlockedUntil()) return false;
    return trackedQueues().some(ownsLock) || !!(pg.q && pg.owns);
  }
  // Keyboard input to the page is swallowed while locked (mouse input is stopped by the overlay).
  // Our automations never use the keyboard, so they're unaffected.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    addEventListener(type, e => {
      if (!lockActive()) return;
      if (e.target && e.target.closest && e.target.closest('#atqm')) return; // the monitor window itself still works
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  function renderLock(w, pg) {
    const locked = isTop && lockActive(pg);
    let overlay = document.getElementById('atqm-lock');
    if (locked && !overlay) {
      overlay = el('div');
      overlay.id = 'atqm-lock';
      overlay.title = 'Locked so the queue monitoring isn\'t stopped by accident. Use "Unlock for 5 min" in the Queue monitor window to use this page.';
      // Swallow every pointer interaction with the page underneath
      for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'wheel']) {
        overlay.addEventListener(t, e => { e.preventDefault(); e.stopPropagation(); w.classList.add('atqm-nudge'); setTimeout(() => w.classList.remove('atqm-nudge'), 400); }, { passive: false });
      }
      document.body.insertBefore(overlay, w);
      try { document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); } catch { /* ignore */ }
    } else if (!locked && overlay) {
      overlay.remove();
    }
    w.classList.toggle('locked', locked);
    if (locked) w.classList.remove('min');

    // Unlock / re-lock control in the header
    let btn = w.querySelector('#atqm-unlock');
    const showBtn = isTop && CONFIG.lockMonitorTabs && pg.q && pg.owns;
    if (!showBtn) { btn?.remove(); return; }
    if (!btn) {
      btn = el('button');
      btn.id = 'atqm-unlock';
      w.querySelector('#atqm-head').insertBefore(btn, w.querySelector('#atqm-min'));
    }
    const left = unlockedUntil() - Date.now();
    if (locked) {
      btn.textContent = 'Unlock for 5 min';
      btn.title = 'Use this page for a few minutes; it locks again automatically';
      btn.onclick = () => { try { sessionStorage.setItem(UNLOCK_KEY, String(Date.now() + 5 * 60000)); } catch { /* ignore */ } render(); };
    } else {
      btn.textContent = left > 0 ? `Lock now (unlocked ${dur(left)})` : 'Lock now';
      btn.title = 'Grey out this page again';
      btn.onclick = () => { try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignore */ } render(); };
    }
  }

  let wasMonitoring = false; // expand the widget when this tab becomes a monitoring tab
  let renderTimer = null;
  function renderSoon() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = null; render(); }, 120);
  }

  function render() {
    const w = document.getElementById('atqm');
    const pg = pageInfo();

    // Start/stop monitoring promptly when this tab moves onto or off a tracked queue
    if (!pg.remote && get(K.enabled, false) && !busy) {
      const wantsLock = pg.q && !pg.foreign && !pg.owns;
      const movedOff = [...owned].some(k => k !== pg.q?.key);
      if (wantsLock || movedOff) setTimeout(() => tick(), 0);
    }
    reportPage(pg);
    if (!w) return;

    const monitoring = !!(pg.q && pg.owns);
    if (monitoring && !wasMonitoring) w.classList.remove('min');
    renderLock(w, pg);
    w.classList.toggle('lv-calls', !!(pg.q && pg.q.mode === 'calls'));
    if (w.classList.contains('locked') && pg.q) renderLockView(w.querySelector('#atqm-lockview'), pg.q);
    wasMonitoring = monitoring;

    renderReminders(w.querySelector('#atqm-rem'));
    renderQuickStart(w.querySelector('#atqm-qs'));

    const qs = activeQueues();
    const box = w.querySelector('#atqm-health');
    box.replaceChildren();
    const hs = qs.map(q => [q, health(q)]);

    // Minimised: one line, a light + name + ticket count per queue
    const mini = w.querySelector('#atqm-mini');
    mini.replaceChildren();
    for (const [q, h] of hs) {
      const st = get(q.state, {});
      const item = el('span', 'atqm-mq');
      item.title = h.text;
      item.append(el('span', 'atqm-ml ' + h.cls), el('span', null, qName(q)),
                  el('b', null, st.count == null ? '–' : st.count + (st.partial ? '+' : '')));
      mini.append(item);
    }
    if (!qs.length) mini.append(el('span', 'atqm-mq', 'No queues tracked'));
    // An untracked queue page: point at the Start tracking buttons hidden in the expanded view
    if (pg.cur && !pg.q && (!pg.isCalls || CONFIG.serviceCalls)) {
      const note = el('button', 'atqm-mnote', `${pg.cur.nav} isn't tracked. Expand to track it.`);
      note.onclick = () => { w.classList.remove('min'); render(); };
      mini.append(note);
    }
    const minimised = w.classList.contains('min');
    const minBtn = w.querySelector('#atqm-min');
    minBtn.textContent = minimised ? '+' : '–';
    minBtn.title = minimised ? 'Expand' : 'Minimise';
    w.style.opacity = w.classList.contains('locked') ? '1' : String((minimised ? CONFIG.opacityMin : CONFIG.opacity) / 100);
    if (w.style.top && !w.classList.contains('locked')) { const p = savedPos(); if (p) place(w, p.right, p.top); } // re-clamp after size change
    for (const [q, h] of hs) {
      const line = el('div', h.cls === 'warn' ? 'warn' : '');
      if (qs.length > 1) line.append(el('b', null, qName(q) + ': '));
      line.append(h.text);
      box.append(line);
    }
    if (!qs.length) box.append(el('div', 'warn', 'No queues tracked.'));
    if (localNote) box.append(el('div', null, localNote));
    w.dataset.health = !qs.length || hs.some(([, h]) => h.cls === 'warn') ? 'warn'
      : hs.every(([, h]) => h.cls === 'ok') ? 'ok' : 'off';
    w.querySelector('#atqm-toggle').textContent = get(K.enabled, false) ? 'Pause' : 'Start';

    renderPageBanner(w.querySelector('#atqm-page'), pg);

    const unread = get(K.alerts, []).filter(a => !a.read).length;
    const badge = w.querySelector('#atqm-badge');
    badge.textContent = unread;
    badge.style.display = unread ? '' : 'none';

    let tab = get(K.tab, 'overview');
    if (tab === 'next' && !CONFIG.firstLineOverview) tab = 'overview';
    const nextCount = CONFIG.firstLineOverview ? nextUpItems().length : 0;
    const TAB_LABELS = {
      next: nextCount ? `Next up (${nextCount})` : 'Next up',
      overview: 'Overview',
      changes: unread ? `Changes (${unread})` : 'Changes',
      settings: 'Settings',
    };
    w.querySelectorAll('#atqm-tabs button').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      if (b.dataset.tab === 'next') b.hidden = !CONFIG.firstLineOverview;
      b.textContent = TAB_LABELS[b.dataset.tab] || b.dataset.tab;
    });

    const panel = w.querySelector('#atqm-panel');
    if (tab === 'settings') {
      if (panel.dataset.tab !== 'settings') renderSettings(panel);
      panel.dataset.tab = 'settings';
      return;
    }
    panel.dataset.tab = tab;
    const scroll = panel.scrollTop;
    panel.replaceChildren();
    if (tab === 'changes') renderChanges(panel);
    else if (tab === 'next') renderNextUp(panel);
    else renderOverview(panel, pg);
    panel.scrollTop = scroll;
  }

  // ---------------------------------------------------------------------------
  // Service call reminders: 15/10/5/0 minutes before, then every minute until dismissed
  // ---------------------------------------------------------------------------
  function leadTimes() {
    const n = String(CONFIG.callLeadTimes || '').split(/[^\d]+/).filter(Boolean).map(Number);
    return n.length ? n : [15, 10, 5, 0];
  }
  const maxLead = () => Math.max(15, ...leadTimes());

  function trackedCalls() {
    if (!CONFIG.serviceCalls) return [];
    return activeQueues().filter(q => q.mode === 'calls').flatMap(q => snapTickets(q) || []);
  }

  // Calls inside the reminder window that haven't been dismissed
  function activeReminders() {
    if (!CONFIG.callReminders || !get(K.enabled, false)) return [];
    const now = Date.now(), lead = maxLead() * 60000, dismissed = get(K.dismissed, {});
    return trackedCalls()
      .filter(c => c.start && c.end > now && c.start - now <= lead && !dismissed[c.id])
      .sort((a, b) => a.start - b.start);
  }

  // Which reminder is due now: 'b15', 'b10'… before start, 'a1', 'a2'… minutes after start
  function reminderSlot(c) {
    const now = Date.now(), leads = leadTimes();
    if (now < c.start) {
      const due = leads.filter(L => now >= c.start - L * 60000);
      return due.length ? 'b' + Math.min(...due) : null;
    }
    const mins = Math.floor((now - c.start) / 60000);
    if (mins === 0 && leads.includes(0)) return 'b0';
    return CONFIG.callPingAfterStart ? 'a' + mins : null;
  }

  function slotText(slot) {
    if (slot === 'b0' || slot === 'a0') return 'starting now';
    return slot[0] === 'b' ? `in ${slot.slice(1)} min` : `started ${slot.slice(1)} min ago`;
  }

  function callNotify(c, slot) {
    if (CONFIG.sound) beep(slot[0] === 'a' || slot === 'b0');
    if (!CONFIG.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const body = [c.description, c.start ? `${timeOf(c.start)}–${timeOf(c.end)}` : '',
      slot[0] === 'a' ? 'Press Dismiss in the queue monitor once you are on it.' : ''].filter(Boolean).join('\n');
    try {
      const n = new Notification(`Service call ${slotText(slot)}: ${c.account || ''}`.trim(), { body, tag: 'atqm-call-' + c.id, renotify: true });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* not allowed here */ }
  }

  // Every tab checks; only one claims each reminder so you get one ping, not one per tab
  async function callTicker() {
    if (!isTop || !CONFIG.serviceCalls) return;
    const rems = activeReminders();
    for (const c of rems) {
      const slot = reminderSlot(c);
      if (!slot || get(K.pings, {})[c.id]?.slot === slot) continue;
      const pings = get(K.pings, {});
      pings[c.id] = { slot, by: ID, ts: Date.now() };
      set(K.pings, pings);
      await sleep(300);
      if (get(K.pings, {})[c.id]?.by === ID && get(K.pings, {})[c.id]?.slot === slot) callNotify(c, slot);
    }
    // Tidy reminder bookkeeping for calls that ended over a day ago
    const known = new Map(trackedCalls().map(c => [c.id, c]));
    for (const key of [K.pings, K.dismissed]) {
      const m = get(key, {}); let changed = false;
      for (const id of Object.keys(m)) {
        const c = known.get(id);
        if (!c || (c.end && Date.now() - c.end > 86400000)) { delete m[id]; changed = true; }
      }
      if (changed) set(key, m);
    }
    if (rems.length || document.querySelector('#atqm-rem')?.childElementCount) renderSoon();
  }

  function renderQuickStart(box) {
    if (!box) return;
    box.replaceChildren();
    if (!isTop || launchKey() || Date.now() < get(K.qsSnooze, 0)) return;
    const idle = idleQueues();
    if (!idle.length) return;
    const r = el('div', 'atqm-qsbox');
    r.append(el('b', null, `${idle.length} tracked queue${idle.length > 1 ? 's aren\'t' : ' isn\'t'} being monitored`));
    r.append(el('div', 'atqm-sub', idle.map(qName).join(', ')));
    const btns = el('div', 'atqm-qsbtns');
    const go = el('button', 'atqm-qsgo', 'Quick start');
    go.title = 'Open a tab for each queue and start monitoring';
    go.onclick = quickStart;
    const later = el('button', null, 'Not now');
    later.onclick = () => { set(K.qsSnooze, Date.now() + 8 * 3600000); render(); };
    btns.append(go, later);
    r.append(btns);
    box.append(r);
  }

  function renderReminders(box) {
    if (!box) return;
    box.replaceChildren();
    const now = Date.now();
    for (const c of activeReminders()) {
      const started = c.start <= now;
      const r = el('div', 'atqm-rem' + (started ? ' started' : ''));
      const top = el('div', 'atqm-rem-top');
      top.append(el('b', null, started
        ? `Service call started ${dur(now - c.start)} ago`
        : `Service call in ${dur(c.start - now)} (${timeOf(c.start)})`));
      const dismiss = el('button', null, 'Dismiss');
      dismiss.title = "I'm on it: stop reminders for this call";
      dismiss.onclick = () => {
        const d = get(K.dismissed, {});
        d[c.id] = Date.now();
        set(K.dismissed, d);
        render();
      };
      top.append(dismiss);
      r.append(top, callLink(c), ' ', el('span', 'atqm-sub', c.description || ''));
      box.append(r);
    }
  }

  // ---------------------------------------------------------------------------
  // Frame messaging: the frame holding the queue tells the outer page what it shows
  // ---------------------------------------------------------------------------
  let isTop = true;
  try { isTop = W.top === W; } catch { isTop = false; }
  let lastReportHadQueue = false;

  function reportPage(pg) {
    if (isTop || pg.remote) return;
    if (!pg.cur && !lastReportHadQueue) return;
    lastReportHadQueue = !!pg.cur;
    const msg = { atqm: 'page', ts: Date.now(), cur: pg.cur || null, qKey: pg.q?.key || null, owns: !!pg.owns, foreign: !!pg.foreign, isCalls: !!pg.isCalls };
    try { W.top.postMessage(msg, '*'); } catch { /* ignore */ }
  }

  const fromAutotask = origin => { try { return /(^|\.)autotask\.net$/i.test(new URL(origin).hostname); } catch { return false; } };
  addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m !== 'object' || !m.atqm || !fromAutotask(e.origin)) return;
    if (m.atqm === 'page' && isTop) {
      remotePage = { ...m, ts: Date.now(), source: e.source };
      pageCache.t = 0;
      renderSoon();
    } else if (m.atqm === 'start' && !isTop && m.cur && MODES[m.mode]) {
      startTracking({ nav: String(m.cur.nav || ''), section: String(m.cur.section || '') }, m.mode);
    } else if (m.atqm === 'note' && isTop) {
      localNote = String(m.text || '');
      render();
    } else if (m.atqm === 'takeover' && !isTop) {
      const q = trackedQueues().find(x => x.key === m.qKey);
      if (q && pageInfo(true).q?.key === q.key) takeOver(q);
    }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  let topHasNoBody = false;
  try { topHasNoBody = !isTop && W.top.document.body?.tagName === 'FRAMESET'; } catch { /* ignore */ }
  if (isTop && launchKey()) {
    try { sessionStorage.setItem(SS_KEY, launchKey()); sessionStorage.setItem(P + 'launched', '1'); } catch { /* ignore */ }
  }
  const launchedTab = () => { try { return !!sessionStorage.getItem(P + 'launched'); } catch { return false; } };
  const isPopup = () => isTop && !!W.opener && !launchedTab();

  const wantsWidget = () => !(CONFIG.hideInPopups && isPopup()) && (isTop || (topHasNoBody && gridPresent()));
  if (wantsWidget()) createWidget();
  const boot = setInterval(() => { if (!document.getElementById('atqm') && wantsWidget()) createWidget(); }, 3000);
  // (No pagehide clean-up here: a tab opened by script can receive a stale pagehide from the blank
  //  page it started as, which would stop the widget ever appearing. Timers end with the page anyway.)

  // Notice queue switches inside the page quickly (clicking a different queue in the menu)
  document.addEventListener('click', () => setTimeout(() => { pageCache.t = 0; renderSoon(); }, 800), true);

  addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(P)) return;
    if (e.key === K.scanReq && trackedQueues().some(ownsLock)) tick({ manual: true });
    if (e.key === K.moveReq) handleMoveRequest();
    if (e.key === K.settings) { loadSettings(); reschedule(); }
    if (e.key === K.queues) {
      pageCache.t = 0;
      const p = document.querySelector('#atqm-panel');
      if (p?.dataset.tab === 'settings') renderSettings(p);
    }
    renderSoon();
  });
  setInterval(render, isTop ? 30000 : 10000); // countdowns up to date; frames keep reporting their page
  if (isTop) setInterval(() => { const u = unlockedUntil(); if (u && Date.now() > u - 15000 && Date.now() < u + 15000) render(); }, 5000);

  let loopTimer = null;
  function schedule(delay) {
    clearTimeout(loopTimer);
    loopTimer = setTimeout(async () => { await tick(); schedule(CONFIG.refreshMs); }, delay);
  }
  function reschedule() {
    const mine = trackedQueues().filter(q => owned.has(q.key)).map(q => get(q.state, {}).lastScan || 0);
    const last = mine.length ? Math.max(...mine) : 0;
    schedule(Math.max(2000, last + CONFIG.refreshMs - Date.now()));
  }
  schedule(3000);
  if (isTop) { setTimeout(callTicker, 3000); setInterval(callTicker, 15000); }
  let launchChecks = 0;
  const launchTimer = setInterval(() => {
    if (launchKey()) handleLaunch();
    else if (launchTries || ++launchChecks > 12) clearInterval(launchTimer); // nothing to do after ~30 s
  }, 2500);
})();