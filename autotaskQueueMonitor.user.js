// ==UserScript==
// @name         Autotask Queue Monitor
// @namespace    autotask
// @version      0.16.1
// @description  Track any My Workspace & Queues queue (My queue by default) in its own tab, with a live overview on every Autotask page
// @author       AdamConnell1565
// @homepageURL  https://github.com/AdamConnell1565/Autotask-Queue-Monitor
// @supportURL   https://github.com/AdamConnell1565/Autotask-Queue-Monitor/issues
// @updateURL    https://raw.githubusercontent.com/AdamConnell1565/Autotask-Queue-Monitor/main/autotaskQueueMonitor.user.js
// @downloadURL  https://raw.githubusercontent.com/AdamConnell1565/Autotask-Queue-Monitor/main/autotaskQueueMonitor.user.js
// @icon         data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Crect%20width='16'%20height='16'%20rx='3'%20fill='%231e1f22'/%3E%3Crect%20x='3'%20y='4'%20width='10'%20height='2'%20rx='1'%20fill='%234ea1ff'/%3E%3Crect%20x='3'%20y='7'%20width='7'%20height='2'%20rx='1'%20fill='%233fb950'/%3E%3Crect%20x='3'%20y='10'%20width='8'%20height='2'%20rx='1'%20fill='%23e3b341'/%3E%3C/svg%3E
// @match        *://*.autotask.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  // The version lives in the header above only; Tampermonkey hands it over in GM_info
  const VERSION = typeof GM_info !== 'undefined' && GM_info.script ? GM_info.script.version : 'dev';
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ---------------------------------------------------------------------------
  // Autotask page details. Everything that depends on how Autotask builds its pages is collected
  // here, so an Autotask update usually means changing this section only. Text matching assumes
  // Autotask is in English.
  // ---------------------------------------------------------------------------
  const AT = {
    sel: {
      row: 'tr.Display',                       // a data row in any grid
      nonRow: 'tr:not(.Display)',              // header rows (and anything else that isn't data)
      gridRows: 'tr.Display, tr.Heading',
      grid: '.Grid',
      tabBox: '.TabContainer',                 // My Workspace keeps one per page tab
      activeTabBox: '.TabContainer.Active',
      inactiveTabBox: '.TabContainer:not(.Active)',
      pager: '.Pager',
      pagerRows: '.VisibleRows',               // "1 - 18 of 18"
      pageSize: 'select[id$="PageSizeDropDownList"], .PageSizeStatus select',
      refreshIcon: '.StandardButtonIcon.Refresh',
      clickable: '.Button2, button, [tabindex]',
      callGridId: 'ServiceCallIndexGrid',
      callRowKey: 'data-row-key',
      callIdInHtml: /service_call_id['"]?\s*,\s*['"](\d+)/i,
      chooser: '.ListMover2',                  // the Column Chooser's two lists
      chooserBox: '.VerticalContainer',
      chooserTitle: '.TitleBar1 .Title, .Title',
      chooserLeft: '.Left select',
      chooserRight: '.Right select',
      chooserMoveRight: '.StandardButtonIcon.MoveRight',
      chooserSave: '.StandardButtonIcon.Save',
      dialogClose: '.DialogTitleBarIcon.Close',
      topBar: '[data-slot="header"]',          // Autotask's bar across the top (logo, menus, search, New): the dashboard sits below it
      topBarNav: '[data-slot="header:navigation-section"]', // its menus (Dashboards, My, Calendar): the Queue monitor menu goes after them
      topBarMenu: '[data-slot="header:navigation-menu-button"]', // one of those menus' buttons, copied for the Queue monitor menu's
      ticketTitle: '.TitleBarItem.Title',      // a ticket's page: "Ticket - T20261007.0081 - Title"
      ticketTitleKind: '.Text',
      // Ticket pages and the ticket edit page (the Macros tab works them)
      button: '.Button2',                      // Edit, Save: <div class="Button2"><span class="Text2">Edit</span></div>
      buttonText: '.Text2',
      detailField: '.ReadOnlyData',            // a field on the ticket's page, label and value (read only):
      detailLabel: '.ReadOnlyLabelContainer',  //   <div class="ReadOnlyData"><div class="ReadOnlyLabelContainer">…Account…</div>
      detailValue: '.ReadOnlyValueContainer',  //   <div class="ReadOnlyValueContainer">…The account…</div></div>
      accountLink: '.LinkButton2 .Text2',      // a page without those: its account is one of these links
      fieldLabel: 'label, span, div',          // the edit page's field names ("Account", "Work Type")
      textInput: 'input:not([type]), input[type="text"], input[type="search"]',
      formTemplate: '.FormTemplateSelector',   // the speed code box: never one of the fields a macro fills in
      pickItem: '.Item, [role="option"]',      // choices in a drop-down list
      dialog: '[role="dialog"], [role="alertdialog"], .Dialog, .DialogBox, .MessageBox, .Modal',
      dialogButton: '.Button2, button',
      formError: '[role="alert"], .ErrorMessage, .ValidationMessage, .Error, .Invalid',
      // A grid row you've ticked: a checkbox, or Autotask's own kind (<div class="Checkbox2"><div class="TabIndexHack Checked">);
      // not a disabled one, which is a yes/no column
      rowTicked: 'input[type="checkbox"]:checked:not(:disabled), .Checkbox2 .Checked:not(.Disabled), [role="checkbox"][aria-checked="true"]:not([aria-disabled="true"])',
    },
    text: {
      myQueueNav: 'Open Tickets',
      mySection: 'My Workspace',
      workspaceTitle: /workspace\s*&\s*queues/i,
      workspaceNav: /^My Workspace\b/i,
      sections: ['My Workspace', 'All', 'Not Assigned', 'Assigned'],
      refreshTitles: ['Refresh grid only', 'Refresh'],
      columnChooserTitle: 'Column Chooser',
      columnChooserDialog: /column\s*chooser/i,
      ticketTitle: /^ticket\b/i,
      editButton: 'Edit',
      saveButtons: ['Save', 'Save & Close'],
      accountLabel: /^account\s*\*?:?$/i,
      subIssueLabel: /^sub[\s-]*issue\s*type\s*\*?:?$/i,
      workTypeLabel: /^work\s*type\s*\*?:?$/i,
      dialogOk: /^(ok|close)$/i,               // a message box with only this button is just acknowledged
      statuses: [                              // fallback only, if no Status column header is found
        'New', 'In Progress', 'Waiting Customer', 'Waiting Materials', 'Waiting Vendor',
        'Scheduled', 'Escalate', 'Dispatched', 'Customer Note Added', 'Complete',
      ],
    },
    path: {
      ticketDetail: '/Mvc/ServiceDesk/TicketDetail.mvc',
      command: '/Autotask/AutotaskExtend/ExecuteCommand.aspx',
      serviceCall: '/Autotask/Popups/TechScheduling/service_call.aspx',
    },
  };

  // Grid column headers
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
  // Columns as the Column Chooser names them, and how to find them there (most specific first)
  const COLUMN_NAMES = {
    ticket: 'Ticket Number', title: 'Title', status: 'Status', account: 'Account', priority: 'Priority',
    created: 'Created', slaEvent: 'Next SLA Event', slaDue: 'Next SLA Event Due',
    start: 'Start Date', end: 'End Date', description: 'Description',
  };
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

  // ---------------------------------------------------------------------------
  // Default settings (editable in the Settings window, behind the cog; saved per browser)
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    refreshMs: 120000,            // refresh + scan interval in each monitoring tab
    callRefreshMs: 600000,        // the same for the Service calls page (calls change less often)
    postRefreshTimeoutMs: 15000,  // max wait for the grid to re-render after refresh
    maxAlerts: 300,               // change history kept
    displayAlerts: 40,            // changes shown in the widget
    upcomingCount: 6,             // rows shown in each overview list
    showStatusCounts: false,      // status count chips on "all changes" queues
    dueSoonMinutes: 60,           // "SLA due soon" threshold (all-changes queues)
    frSoonMinutes: 15,            // "first response due soon" threshold (new-ticket queues)
    responseTarget: 60,           // minutes to respond to tickets in New with no first response SLA (0 = off)
    // Statuses that need action. A ticket in any other status rests: visible, but no deadlines in Next up,
    // no SLA warnings, and an alert when it moves back into one of these.
    actionStatuses: 'New, First Response, In Progress, Action Required, Waiting Internal, Escalated, Workshop, Dispatch',
    autoColumns: false,           // add missing columns via the grid's Column Chooser without asking
    autoPageSize: false,          // switch the grid to its largest page size without asking
    dateOrder: 'auto',            // 'auto', 'DMY' (UK), 'MDY' (US) or 'YMD' (year first)
    timeZone: '',                 // time zone Autotask shows times in; '' = the same as this PC
    linkStyle: 'detail',          // 'detail' = normal ticket page; 'command' = Autotask open-ticket command; 'grid' = grid's own link
    serviceCalls: false,          // allow tracking My Workspace > Service Calls
    callReminders: true,          // ping before / during scheduled calls
    callLeadTimes: '15, 10, 5, 0',// minutes before start to ping
    callPingAfterStart: true,     // keep pinging every minute after start until dismissed or the call ends
    opacity: 100,                 // window opacity (%) when expanded
    opacityMin: 85,               // window opacity (%) when minimised
    lockMonitorTabs: true,        // monitoring tabs: big centred window, page greyed out and not clickable
    oneTab: false,                // Quick start opens one tab that monitors every queue in turn
    dashboard: true,              // a button that opens the full-window dashboard
    showWindow: true,             // the Queue monitor window (hidden only where the Queue monitor menu in Autotask's top bar can bring it back)
    ticketMacroButton: true,      // the Macros button in the corner of ticket pop-ups
    notify: true,
    sound: true,
    hideInPopups: true,
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
    viewed: P + 'viewed',             // ticket number -> last time its page was open in front of you
    macro: P + 'macro',               // the macro running (or last run): { id, kind, account, by, ts, here, items, finished, note }
    macroAccounts: P + 'macro:accounts', // accounts changed to, most recent first
    macroFills: P + 'macro:fills',    // Sub-Issue Types and Work Types filled in, most recent first: { subIssue: [], workType: [] }
    colTried: P + 'columns:tried',    // queue + missing columns -> last time we tried to add them
    gridFixReq: P + 'gridfix',        // "add the missing columns / show more rows" pressed in some tab
    qsSnooze: P + 'quickstart:snooze',// Quick start prompt hidden until this time
    moveReq: P + 'quickstart:move',   // "move all queue tabs to the window this request came from"
    wsUrl: P + 'quickstart:wsurl',    // a My Workspace & Queues address, for queues Quick start hasn't opened yet
    dateOrder: P + 'date:order',      // date order worked out from the grids: { order, ts }
    tzHint: P + 'date:tzhint',        // Autotask's clock looks hours off this PC's: { hours, dir, recent, ts }
    beepReq: P + 'beep',              // a tab that can't play sound asks another tab to
    beepClaims: P + 'beep:claims',
    healthPinged: P + 'health:pinged',// queue -> the outage we already sent a "stopped updating" alert for
    launchPending: P + 'launch:pending',// queue -> when a tab was opened to monitor it (it's on its way)
    rotator: P + 'rotator',           // the one-tab monitor's heartbeat: { id, tab, ts, queues }
    popups: P + 'popups',             // what opening tabs has shown: { state: 'blocked' | 'allowed', ts, dismissed }
    statusColors: P + 'status:colors',// status (lower case) -> its colour in Autotask's grid, or null for plain
    priorityColors: P + 'priority:colors', // the same for priorities
  };

  const CONFIG = { ...DEFAULTS };
  const ID = Math.random().toString(36).slice(2);
  const TICKET_RE = /\bT\d{8}\.\d{3,5}(?:\.\d{3})?\b/;
  const STATUS_SET = new Set(AT.text.statuses.map(s => s.toLowerCase()));
  const RANK = { ok: 0, soon: 1, overdue: 2 };
  const staleMs = () => CONFIG.refreshMs * 2.5;
  // A queue's own refresh: Service calls have their own, longer one. A monitoring record (lock, state)
  // older than 2.5 of these means the tab stopped.
  const refreshOf = q => (q?.mode === 'calls' ? CONFIG.callRefreshMs : CONFIG.refreshMs);
  const staleFor = q => refreshOf(q) * 2.5;

  // Parsed values are cached against the stored text, so reading the same key again doesn't re-parse it.
  // What get() returns may be shared: copy it before changing it.
  const readCache = new Map();
  const get = (k, d) => {
    try {
      const raw = localStorage.getItem(k);
      if (raw === null) return d;
      const hit = readCache.get(k);
      if (hit && hit.raw === raw) return hit.v;
      const v = JSON.parse(raw);
      readCache.set(k, { raw, v });
      return v;
    } catch { return d; }
  };
  let storageFail = null; // { ts, key } of the last write that failed
  const isQuotaError = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
  // Returns false when the write failed. Storage is shared with Autotask itself, so when it's full the
  // older half of the change history is dropped to make room and the write is tried once more.
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      if (isQuotaError(e)) {
        try {
          const alerts = k === K.alerts ? v : get(K.alerts, []);
          if (Array.isArray(alerts) && alerts.length >= 10) {
            localStorage.setItem(K.alerts, JSON.stringify(alerts.slice(-Math.floor(alerts.length / 2))));
            if (k !== K.alerts) localStorage.setItem(k, JSON.stringify(v));
            return true;
          }
        } catch { /* still full */ }
      }
      console.warn('[ATQM] storage write failed', k, e);
      storageFail = { ts: Date.now(), key: k };
      return false;
    }
  }
  // Snapshots that couldn't be saved stay in memory, so the next scan doesn't report the same changes again
  const memSnap = new Map();
  const del = k => { memSnap.delete(k); try { localStorage.removeItem(k); } catch { /* ignore */ } };
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // innerText keeps the break between "02/10/2026" and "10:55" when they're separate elements
  const cellText = c => (c ? clean(c.innerText ?? c.textContent) : '');

  function loadSettings() { Object.assign(CONFIG, DEFAULTS, get(K.settings, {})); }
  loadSettings();

  // ---------------------------------------------------------------------------
  // Tracked queues (per person / per browser). My queue is tracked by default.
  // ---------------------------------------------------------------------------
  const MY_QUEUE = { key: 'my', nav: AT.text.myQueueNav, section: AT.text.mySection, mode: 'full' };
  if (!get(K.queues, null)) set(K.queues, [MY_QUEUE]);

  // Storage keys per queue (My queue keeps the key names it has always had)
  function qStore(q) {
    if (q.key === 'my') return { snap: P + 'snap:my-open-tickets', lock: P + 'lock:my-open-tickets', state: P + 'state', seen: P + 'seen:my' };
    return { snap: P + 'snap:q:' + q.key, lock: P + 'lock:q:' + q.key, state: P + 'state:q:' + q.key, seen: P + 'seen:q:' + q.key };
  }
  const readSnap = q => (memSnap.has(q.snap) ? memSnap.get(q.snap) : get(q.snap, null));
  function writeSnap(q, v) {
    if (set(q.snap, v)) memSnap.delete(q.snap);
    else memSnap.set(q.snap, v);
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
    const d = new Date(ts), now = new Date(Date.now());
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
    return d.toDateString() === new Date(Date.now()).toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  // Tickets in these statuses have their SLA paused (Scheduled = waiting for the service call to start)
  // Statuses that need action (Settings). A ticket in any other status is resting: it stays visible but
  // gets no deadlines in Next up and no SLA warnings, and you're alerted when it moves back into one of
  // these. A ticket without a status (no Status column), or an empty list, always counts as needing action.
  const actionList = () => String(CONFIG.actionStatuses || '').split(',').map(clean).filter(Boolean);
  const needsAction = t => !t?.status || !actionList().length || actionList().some(st => same(st, t.status));
  const resting = t => !!t && !needsAction(t);

  function dueState(due, soonMinutes) {
    if (!due) return null;
    const diff = due - Date.now();
    if (diff < 0) return 'overdue';
    if (diff <= soonMinutes * 60000) return 'soon';
    return 'ok';
  }

  // ---------------------------------------------------------------------------
  // Reading Autotask dates. Autotask shows them in the date format and time zone set in each
  // person's Autotask profile, which needn't match this PC.
  // ---------------------------------------------------------------------------
  // 02/10/2026, 2/10/26, 2026-10-02, optionally followed by 10:55, 10:55:00, 10:55 PM or 10:55 p.m.
  const DATE_RE = /(?<!\d)(\d{4}|\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{1,2})(?:\s*,?\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s?m\b\.?)?)?/i;
  const ORDER_NAMES = { DMY: 'Day/month', MDY: 'Month/day', YMD: 'Year first' };

  // The order in use: the setting, or (on auto) what the grids have shown, or a guess from the browser language
  function dateOrder() {
    if (CONFIG.dateOrder && CONFIG.dateOrder !== 'auto') return CONFIG.dateOrder;
    return get(K.dateOrder, null)?.order || (/^en-US$/i.test(navigator.language || '') ? 'MDY' : 'DMY');
  }
  // A first number over 12 can only be a day (02/10 is ambiguous; 25/10 isn't)
  function detectDateOrder(strings) {
    let dmy = false, mdy = false;
    for (const s of strings) {
      const m = String(s || '').match(DATE_RE);
      if (!m) continue;
      if (m[1].length === 4) return 'YMD';
      if (+m[1] > 12 && +m[2] <= 12) dmy = true;
      if (+m[2] > 12 && +m[1] <= 12) mdy = true;
    }
    return dmy === mdy ? null : dmy ? 'DMY' : 'MDY';
  }
  function learnDateOrder(strings) {
    const order = detectDateOrder(strings);
    if (order && get(K.dateOrder, null)?.order !== order) set(K.dateOrder, { order, ts: Date.now() });
  }

  // Offset of a time zone from UTC at a given moment (ms), via the browser's time zone data
  const zoneFormats = new Map();
  function zoneOffset(ts, zone) {
    if (!zoneFormats.has(zone)) {
      zoneFormats.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    }
    const p = {};
    for (const part of zoneFormats.get(zone).formatToParts(new Date(ts))) p[part.type] = part.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
  }
  // A wall-clock time in `zone` ('' = this PC's zone) as a timestamp
  function wallClockToTs(y, mo, d, h, mi, zone) {
    if (zone) {
      try {
        const guess = Date.UTC(y, mo - 1, d, h, mi);
        // Second pass gets times near a daylight saving change right
        return guess - zoneOffset(guess - zoneOffset(guess, zone), zone);
      } catch { /* unknown zone name: fall back to this PC's zone */ }
    }
    return new Date(y, mo - 1, d, h, mi).getTime();
  }
  const validZone = z => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };

  // Returns null for anything that isn't a real date, rather than guessing
  function parseDate(s, order = dateOrder()) {
    const m = String(s || '').match(DATE_RE);
    if (!m) return null;
    const [, p1, p2, p3, hh, mm, ap] = m;
    let y, mo, d;
    if (p1.length === 4) [y, mo, d] = [+p1, +p2, +p3];
    else if (p3.length === 4 || p3.length === 2) {
      y = +p3;
      [d, mo] = order === 'MDY' ? [+p2, +p1] : [+p1, +p2];
    } else return null;
    if (y < 100) y += 2000;
    let h = hh == null ? 0 : +hh;
    const mi = mm == null ? 0 : +mm;
    if (ap) {
      if (h < 1 || h > 12) return null;
      const pm = /p/i.test(ap);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const probe = new Date(Date.UTC(y, mo - 1, d)); // rejects dates that don't exist, like 30/02
    if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    return wallClockToTs(y, mo, d, h, mi, CONFIG.timeZone);
  }

  // Tickets still in New status with no first response SLA get the team's own response target
  function targetDue(t) {
    const from = t.created || t.firstSeen;
    return CONFIG.responseTarget > 0 && !t.frDue && from && /^new$/i.test(t.status || '') ? from + CONFIG.responseTarget * 60000 : null;
  }
  const targetState = t => (resting(t) ? null : dueState(targetDue(t), CONFIG.frSoonMinutes));
  // Alert when a ticket without an SLA comes up to, or passes, the response target. `before` is its state
  // at the last scan (snapshots from before 0.11 don't have one: no alert for those, just the baseline).
  function targetAlert(push, id, t, before) {
    if (!t.tgt || RANK[t.tgt] <= RANK[before || 'ok']) return;
    push(t.tgt, `Response target ${t.tgt === 'overdue' ? 'passed' : 'due soon'} (${dueAt(targetDue(t))}, no SLA): ${label(id, t)}`, id);
  }

  // A status change. Into a status that needs action from one that didn't: the alert to notice ('action').
  // Into a resting status (usually your own doing): logged in the history without a ping. With the
  // ticket open in front of you it's no news either (often you just made it).
  function statusAlert(push, id, t, p) {
    const from = p.status || '', to = t.status || '';
    const text = `${label(id, t)}: ${from || '?'} → ${to || '?'}`;
    const open = viewingNow(id);
    if (resting(p) && !resting(t)) push('action', text, id, { from, to, ...(open ? { read: true, quiet: true } : {}) });
    else push('status', text, id, { from, to, ...(open || resting(t) ? { read: true, quiet: true } : {}) });
  }

  // New arrivals were created moments ago. When their Created times sit a whole number of hours away
  // from now, Autotask is showing times in a different zone from this PC.
  function checkClock(arrivals, now = Date.now()) {
    const gaps = arrivals.filter(t => t.created).map(t => (now - t.created) / 3600000);
    if (!gaps.length) return;
    const hint = get(K.tzHint, null) || {};
    const recent = (hint.recent || []).slice();
    let next = hint.hours ? { hours: hint.hours, dir: hint.dir, ts: hint.ts } : null;
    for (const g of gaps) {
      if (g < -1 / 3) { next = { hours: Math.max(1, Math.round(-g)), dir: 'ahead of', ts: now }; continue; } // created 20+ min in the future
      if (Math.abs(g) < 1 / 3) next = null;                                                                // looks right
      recent.push(g);
    }
    const last = recent.slice(-3);
    const H = last.length === 3 ? Math.round(last[0]) : 0;
    if (H >= 1 && last.every(g => Math.abs(g - H) <= 1 / 6)) next = { hours: H, dir: 'behind', ts: now };
    set(K.tzHint, next ? { ...next, recent: last } : { recent: last });
  }
  function clockWarning() {
    const h = get(K.tzHint, null);
    if (!h || !h.hours || Date.now() - h.ts > 7 * 86400000) return null;
    return `Autotask times look about ${h.hours} h ${h.dir} this PC's clock, so due times may be off. ` +
      (CONFIG.timeZone ? 'Check "Autotask time zone" in Settings.' : 'Set "Autotask time zone" in Settings.');
  }

  // ---------------------------------------------------------------------------
  // Locks: one tab per queue refreshes and alerts
  // ---------------------------------------------------------------------------
  // Where the browser has Web Locks, they decide which tab monitors a queue: the browser frees one
  // when its tab closes or crashes, and a takeover steals it outright. The { id, ts } record in
  // localStorage is still written each scan so every tab can show who's monitoring.
  const webLocks = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function'
    ? navigator.locks : null;
  const held = new Map(); // queue key -> { release, token } for Web Locks this page holds

  function holdWebLock(q, steal) {
    return new Promise(resolve => {
      const token = {};
      let release;
      const hold = new Promise(r => { release = r; });
      webLocks.request(P + 'lock:' + q.key, steal ? { steal: true } : { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return null; }
        held.set(q.key, { release, token });
        resolve(true);
        return hold; // kept until release()
      }).catch(() => {
        // AbortError: another tab took this queue over
        resolve(false);
        if (held.get(q.key)?.token !== token) return;
        held.delete(q.key);
        owned.delete(q.key);
        pageCache.t = 0;
        renderSoon();
      });
    });
  }

  async function acquireLock(q) {
    const now = Date.now(), l = get(q.lock, null);
    if (webLocks) {
      // A holder that stopped scanning (a frozen tab) loses the queue to a tab that can monitor it
      const stuck = !!l && now - l.ts >= staleFor(q);
      if (!held.has(q.key) && !(await holdWebLock(q, false)) && !(stuck && await holdWebLock(q, true))) return false;
      set(q.lock, { id: ID, ts: now });
      return true;
    }
    if (l && l.id !== ID && now - l.ts < staleFor(q)) return false;
    set(q.lock, { id: ID, ts: now });
    return get(q.lock, null)?.id === ID;
  }
  const ownsLock = q => (webLocks ? held.has(q.key) : get(q.lock, null)?.id === ID);
  function foreignActive(q) {
    const l = get(q.lock, null);
    return !!l && l.id !== ID && Date.now() - l.ts < staleFor(q);
  }
  function releaseLock(q) {
    const h = held.get(q.key);
    if (h) { held.delete(q.key); h.release(); }
    if (get(q.lock, null)?.id === ID) del(q.lock);
  }
  addEventListener('pagehide', () => {
    trackedQueues().forEach(releaseLock);
    if (get(K.rotator, null)?.id === ID) del(K.rotator);
  });

  function setState(q, patch) {
    const prev = get(q.state, {});
    const next = { ...prev, ...patch, id: ID, ts: Date.now() };
    // Learn how far apart this queue's scans really are (see scanStaleMs). A gap long enough to be an
    // outage (the tab was closed or asleep) isn't its rhythm.
    const gap = patch.lastScan && prev.lastScan ? patch.lastScan - prev.lastScan : 0;
    if (gap > 0 && gap < 3 * staleFor(q)) next.every = Math.round(prev.every ? prev.every * 0.75 + gap * 0.25 : gap);
    set(q.state, next);
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
  const navCandidates = root => [...root.querySelectorAll('a, span, div, li, td, p, h1, h2, h3')]
    .filter(el => el.childElementCount <= 3 && !el.closest('#atqm') && !el.closest(AT.sel.row));

  // Searching a whole page with a big grid is slow, so once the queue menu is found only that part
  // of the page is searched, with a full search each minute in case the menu has grown.
  const navRoots = new WeakMap(); // document -> { root, ts }
  function menuRoot(doc) {
    const r = navRoots.get(doc);
    return r && r.root.isConnected && Date.now() - r.ts < 60000 ? r.root : null;
  }
  function commonAncestor(els) {
    let a = els[0]?.parentElement;
    while (a && !els.every(e => a.contains(e))) a = a.parentElement;
    // A little wider, so groups added beside the current ones are still inside
    for (let i = 0; i < 2 && a?.parentElement && a.parentElement !== a.ownerDocument.body; i++) a = a.parentElement;
    return a || null;
  }

  function isWorkspacePage() {
    return searchDocs().some(doc => AT.text.workspaceTitle.test(doc.title) ||
      navCandidates(menuRoot(doc) || doc).some(el => el.textContent.length < 80 && AT.text.workspaceNav.test(clean(el.textContent))));
  }

  const SECTION_RE = new RegExp('^(' + AT.text.sections.join('|') + ')\\s*\\(', 'i');
  const ITEM_RE = /^(.{2,60}?)\s*\(([\d\s+]+)\)$/;

  function menuEntries(root) {
    const out = [];
    for (const el of navCandidates(root)) {
      const m = clean(el.textContent).match(ITEM_RE);
      if (!m || AT.text.sections.some(s => same(s, m[1]))) continue;
      out.push({ el, name: clean(m[1]), count: m[2].split('+').reduce((s, x) => s + (parseInt(x, 10) || 0), 0) });
    }
    return out;
  }

  // Queue entries in the left menu, e.g. "Support 1st Line (172 + 30)"
  function navItems() {
    const out = [];
    for (const doc of searchDocs()) {
      const root = menuRoot(doc);
      let found = root ? menuEntries(root) : [];
      if (!found.length) {
        found = menuEntries(doc);
        const r = found.length >= 2 ? commonAncestor(found.map(i => i.el)) : null;
        if (r) navRoots.set(doc, { root: r, ts: Date.now() });
        else navRoots.delete(doc);
      }
      out.push(...found);
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
        if (known) return AT.text.sections.find(k => same(k, known[1]));
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
      const rows = gridScope().querySelectorAll(AT.sel.row).length;
      const m = items.filter(i => i.count === rows);
      if (m.length === 1) hit = m[0];
    }
    return hit ? { nav: hit.name, section: sectionOf(hit.el) } : null;
  }

  // Autotask usually shows the queue inside a frame while the widget sits in the outer page,
  // so frames report what they're showing (see "Frame messaging" below).
  let remotePage = null; // latest report from a frame in this tab: { cur, qKey, owns, foreign, choose, url, ts, source }
  let pageCache = { t: 0, v: {} };
  // { cur, q, owns, foreign, choose, isCalls, url, remote, grid, ticked }. choose: nobody monitors this
  // tracked queue, and this tab should ask before it starts to. grid: a ticket grid is showing, a queue or
  // any other list of tickets (a dashboard widget's drill-down has no queue menu, so no cur).
  function pageInfo(fresh = false) {
    if (!fresh && Date.now() - pageCache.t < 1500) return pageCache.v;
    const v = {};
    if (gridPresent()) {
      v.grid = true;
      v.cur = currentQueue();
      v.isCalls = isCallGrid();
      v.url = location.href;
      v.ownsAny = trackedQueues().some(ownsLock);
      v.ticked = v.isCalls ? [] : tickedTickets();
      if (v.cur) {
        // Quick start opens queues it hasn't seen yet from here
        if (!get(K.wsUrl, null)) set(K.wsUrl, location.href);
        v.q = findTracked(v.cur);
        if (v.q) {
          v.owns = ownsLock(v.q);
          v.foreign = foreignActive(v.q);
          v.choose = !v.owns && !v.foreign && !mayMonitorHere(v.q);
        }
      }
    } else if (remotePage && (remotePage.cur || remotePage.grid || remotePage.ticket) && Date.now() - remotePage.ts < 25000) {
      // The page shows Autotask's content in a frame (its own layout does): the frame says what it shows
      v.grid = !!(remotePage.cur || remotePage.grid);
      v.remoteTicket = remotePage.ticket || null;
      v.cur = remotePage.cur || null;
      v.q = v.cur ? findTracked(v.cur) : null;
      v.owns = !!remotePage.owns;
      v.foreign = !!remotePage.foreign;
      v.ownsAny = !!remotePage.ownsAny;
      v.choose = !!remotePage.choose;
      v.isCalls = !!remotePage.isCalls;
      v.url = remotePage.url;
      v.remote = remotePage.source;
      v.ticked = Array.isArray(remotePage.ticked) ? remotePage.ticked : [];
    }
    v.ticket = openTicketId() || v.remoteTicket || null;
    pageCache = { t: Date.now(), v };
    return v;
  }

  // ---------------------------------------------------------------------------
  // Grid reading
  // ---------------------------------------------------------------------------
  // The grid the user is looking at. My Workspace keeps every tab's grid in the page
  // (Tasks & Tickets, To-Dos, Service Calls); only the one in the active tab counts.
  function activeGrid() {
    const grids = [...document.querySelectorAll(AT.sel.grid)].filter(g => g.querySelector(AT.sel.gridRows));
    if (!grids.length) return null;
    return grids.find(g => g.closest(AT.sel.activeTabBox))
      || grids.find(g => g.getClientRects().length && !g.closest(AT.sel.inactiveTabBox))
      || grids.find(g => !g.closest(AT.sel.tabBox))
      || null;
  }
  const gridScope = () => activeGrid() || document;

  function findColumns(scope = gridScope()) {
    for (const row of scope.querySelectorAll(AT.sel.nonRow)) {
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

  function gridPresent() { return !!document.querySelector(AT.sel.row) || !!findColumns(); }

  // Autotask's own deep link: works for any ticket number while you're logged in
  const commandUrl = (param, value) =>
    `${location.origin}${AT.path.command}?Code=OpenTicketDetail&${param}=${encodeURIComponent(value)}`;
  // Link for a ticket. ref: { tid (Autotask's internal ticket ID), url (grid link), ids (queue's IDs, for next/prev) }
  // The grid link and the ExecuteCommand link both open Autotask's pop-out window; the normal
  // ticket page is TicketDetail.mvc with the internal ticket ID, like the address bar shows.
  function ticketUrl(id, ref) {
    const r = ref || {};
    if (CONFIG.linkStyle === 'grid' && r.url) return r.url;
    if (CONFIG.linkStyle === 'command' || !r.tid) return commandUrl('TicketNumber', id);
    const ids = (r.ids || []).map((x, i) => `ids%5B${i}%5D=${x}`).join('&');
    return `${location.origin}${AT.path.ticketDetail}?workspace=False&${ids ? ids + '&' : ''}ticketId=${r.tid}`;
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
    const rows = [...scope.querySelectorAll(AT.sel.row)];
    const cols = findColumns(scope);
    if (!rows.length && !cols) return null;

    let offset = 0; // header and body can be separate tables with extra leading cells
    if (cols && rows.length) {
      const actual = [...rows[0].cells].findIndex(c => TICKET_RE.test(cellText(c)));
      if (actual >= 0) offset = actual - cols.ticket;
    }
    const col = (cells, i) => (i == null ? '' : cellText(cells[i + offset]));
    const noneToEmpty = s => (/^(none|-)?$/i.test(s) ? '' : s);

    // Text first: every date in the grid helps tell day/month from month/day before any is read
    const raw = [];
    for (const r of rows) {
      const cells = [...r.cells];
      const byCol = cols ? cells[cols.ticket + offset] : null;
      const tCell = byCol && TICKET_RE.test(cellText(byCol)) ? byCol : cells.find(c => TICKET_RE.test(cellText(c)));
      if (!tCell) continue;
      let status = col(cells, cols?.status);
      if (!status) status = cells.map(cellText).find(t => STATUS_SET.has(t.toLowerCase())) || '';
      raw.push({
        r, tCell, status,
        sCell: cols?.status != null ? cells[cols.status + offset] : null,
        pCell: cols?.priority != null ? cells[cols.priority + offset] : null,
        plainCell: cols?.title != null ? cells[cols.title + offset] : null,
        id: cellText(tCell).match(TICKET_RE)[0],
        slaEvent: noneToEmpty(col(cells, cols?.slaEvent)),
        due: col(cells, cols?.slaDue ?? cols?.due),
        frDue: col(cells, cols?.frDue),
        created: col(cells, cols?.created),
        title: col(cells, cols?.title),
        priority: col(cells, cols?.priority),
        account: col(cells, cols?.account),
      });
    }
    learnDateOrder(raw.flatMap(x => [x.due, x.frDue, x.created]));
    learnColors(raw, 'status', 'sCell', K.statusColors);
    learnColors(raw, 'priority', 'pCell', K.priorityColors);

    const tickets = raw.map(({ r, tCell, sCell, pCell, plainCell, ...x }) => {
      const due = parseDate(x.due);
      let frDue = parseDate(x.frDue);
      if (!frDue && /first\s*response/i.test(x.slaEvent)) frDue = due;
      return { ...x, due, frDue, created: parseDate(x.created), ...findTicketRef(r, tCell) };
    });
    return { tickets, rowCount: rows.length };
  }

  // Autotask shows each status and priority in its own colour (set up in Autotask). Read it off the cell,
  // ignoring the grid's ordinary text colour, so the monitor can show them the same way.
  function textColor(cell) {
    let n = cell;
    while (n.childElementCount === 1 && clean(n.firstElementChild.textContent) === clean(n.textContent)) n = n.firstElementChild;
    try { return n.ownerDocument.defaultView.getComputedStyle(n).color || ''; } catch { return ''; }
  }
  function learnColors(rows, field, cellKey, storeKey) {
    const found = {};
    for (const x of rows) {
      const key = clean(x[field]).toLowerCase();
      if (!key || !x[cellKey] || key in found) continue;
      const c = textColor(x[cellKey]);
      found[key] = c && c !== (x.plainCell ? textColor(x.plainCell) : '') ? c : null;
    }
    const cur = get(storeKey, {});
    if (Object.entries(found).some(([k, v]) => cur[k] !== v)) set(storeKey, { ...cur, ...found });
  }

  // ---------------------------------------------------------------------------
  // Service calls grid (My Workspace > Service Calls)
  // ---------------------------------------------------------------------------
  function findCallColumns(scope = gridScope()) {
    for (const row of scope.querySelectorAll(AT.sel.nonRow)) {
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
    if (g) return g.id === AT.sel.callGridId || (!!findCallColumns(g) && !findColumns(g));
    return !!findCallColumns(document) && !findColumns(document);
  }

  const callUrl = id => `${location.origin}${AT.path.serviceCall}?service_call_id=${encodeURIComponent(id)}`;

  function readCallGrid() {
    const g = activeGrid();
    const scope = (g && isCallGrid() ? g : document.getElementById(AT.sel.callGridId)) || document;
    const rows = [...scope.querySelectorAll(AT.sel.row)];
    const cols = findCallColumns(scope);
    if (!cols) return null;
    const col = (cells, i) => (i == null ? '' : cellText(cells[i]));
    const raw = [];
    for (const r of rows) {
      const cells = [...r.cells];
      let id = r.getAttribute(AT.sel.callRowKey);
      if (!id) { const m = r.innerHTML.match(AT.sel.callIdInHtml); id = m && m[1]; }
      if (!id) continue;
      raw.push({
        id,
        start: col(cells, cols.start),
        end: col(cells, cols.end),
        created: col(cells, cols.created),
        account: col(cells, cols.account),
        status: col(cells, cols.status),
        resources: col(cells, cols.resources),
        priority: col(cells, cols.priority),
        createdBy: col(cells, cols.createdBy),
        description: col(cells, cols.description),
      });
    }
    learnDateOrder(raw.flatMap(x => [x.start, x.end, x.created]));
    const calls = raw.map(x => {
      const start = parseDate(x.start);
      let end = parseDate(x.end);
      if (start && (!end || end < start)) end = start + 30 * 60000;
      return { ...x, start, end, created: parseDate(x.created), url: callUrl(x.id) };
    });
    return { calls, rowCount: rows.length };
  }

  const callLabel = c => [c.account, c.description].filter(Boolean).join(' – ') || 'Service call';
  const timeOf = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------
  // Several tabs can see the same event (a reminder, a beep request, a queue going quiet). Each writes a
  // claim; the one whose claim is still there after a short wait acts, so you get one ping, not one per tab.
  async function claim(mapKey, id, slot) {
    if (get(mapKey, {})[id]?.slot === slot) return false;
    const now = Date.now(), map = {};
    for (const [k, v] of Object.entries(get(mapKey, {}))) if (now - (v.ts || 0) < 86400000) map[k] = v;
    map[id] = { slot, by: ID, ts: now };
    set(mapKey, map);
    await sleep(300);
    const c = get(mapKey, {})[id];
    return c?.by === ID && c?.slot === slot;
  }

  // Browsers only play sound in a page someone has clicked or typed in. Tabs opened by Quick start
  // often never have been, so they hand the beep to a tab that has (see the storage listener).
  let hadGesture = false;
  for (const t of ['pointerdown', 'keydown']) addEventListener(t, () => { hadGesture = true; }, { capture: true, passive: true });
  const canPlay = () => hadGesture || !!navigator.userActivation?.hasBeenActive;

  let audioCtx = null;
  function beep(urgent, relay = true) {
    if (relay && !canPlay()) { set(K.beepReq, { ts: Date.now(), urgent: !!urgent, by: ID }); return; }
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
  function playRelayedBeep() {
    const r = get(K.beepReq, null);
    if (!isTop || !CONFIG.sound || !canPlay() || !r || r.by === ID || Date.now() - r.ts > 10000) return;
    claim(K.beepClaims, 'beep', r.ts).then(ok => { if (ok) beep(r.urgent, false); });
  }

  // Each batch gets its own notification (no tag), so a newer one never silently replaces an unread one
  function notify(name, list) {
    if (CONFIG.sound) beep(list.some(a => a.type === 'overdue' || a.type === 'new' || a.type === 'action'));
    if (!CONFIG.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = list.length, s = n > 1 ? 's' : '';
    const title = list.every(a => a.type === 'new') ? `${name}: ${n} new ticket${s}`
      : list.every(a => a.type === 'action') ? `${name}: ${n} ticket${s} need${n > 1 ? '' : 's'} action`
      : `${name}: ${n} change${s}`;
    const body = list.slice(0, 4).map(a => a.text).join('\n') + (list.length > 4 ? `\n…and ${list.length - 4} more` : '');
    try {
      const n = new Notification(title, { body });
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
    const loud = fresh.filter(a => !a.quiet);
    if (loud.length) notify(qName(q), loud);
  }

  const label = (id, t) => (t?.title ? `${id} – ${t.title}` : id);

  // ---------------------------------------------------------------------------
  // Scanning
  // ---------------------------------------------------------------------------
  // "All changes": new, status changes, leaving the queue, any SLA
  function scanFull(q, grid) {
    const now = Date.now();
    const prev = readSnap(q);
    const current = {};
    for (const { id, ...t } of grid.tickets) {
      const c = current[id] = { ...t, sla: resting(t) ? null : dueState(t.due, CONFIG.dueSoonMinutes), firstSeen: prev?.[id]?.firstSeen ?? now };
      c.tgt = targetState(c);
    }
    writeSnap(q, current);

    const n = grid.tickets.length;
    if (!prev) return setState(q, { mode: 'ok', lastScan: now, count: n, ...coverage(grid), note: 'Baseline saved' });

    const fresh = [];
    const qn = qName(q);
    const push = (type, text, ticket, extra) => fresh.push({
      ts: now, q: q.key, qn, type, text, ticket, read: false,
      url: current[ticket]?.url || prev[ticket]?.url || null, tid: current[ticket]?.tid || prev[ticket]?.tid || null, ...extra,
    });

    checkClock(Object.keys(current).filter(id => !prev[id]).map(id => current[id]), now);
    for (const [id, t] of Object.entries(current)) {
      const p = prev[id];
      if (!p) push('new', `New: ${label(id, t)}${t.status ? ` [${t.status}]` : ''}`, id, { status: t.status || '' });
      else if (p.status !== t.status) statusAlert(push, id, t, p);
      if (t.sla && RANK[t.sla] > RANK[p?.sla || 'ok']) {
        const what = t.slaEvent ? `${t.slaEvent} ` : '';
        push(t.sla, `${t.sla === 'overdue' ? 'SLA breached' : 'SLA due soon'} (${dueAt(t.due)}): ${what}${label(id, t)}`, id);
      }
      targetAlert(push, id, t, !p ? 'ok' : p.tgt === undefined ? t.tgt : p.tgt);
    }
    const cov = coverage(grid);
    if (!cov.partial) { // with only part of the queue visible, "left queue" can't be judged
      for (const [id, p] of Object.entries(prev)) {
        if (!current[id]) push('removed', `Left queue: ${label(id, p)}`, id);
      }
    }

    commitAlerts(q, fresh);
    setState(q, { mode: 'ok', lastScan: now, count: n, ...cov, note: '' });
  }

  // "New tickets & first response": only arrivals and first response SLAs
  function scanIntake(q, grid) {
    const now = Date.now();
    const prev = readSnap(q);
    const rebase = !prev;
    const seen = rebase ? {} : { ...get(q.seen, {}) };
    const prevSnap = prev || {};

    const current = {};
    for (const { id, ...t } of grid.tickets) {
      const c = current[id] = { ...t, fr: resting(t) ? null : dueState(t.frDue, CONFIG.frSoonMinutes), firstSeen: prevSnap[id]?.firstSeen ?? seen[id] ?? now };
      c.tgt = targetState(c);
    }

    const fresh = [];
    const qn = qName(q);
    const push = (type, text, ticket, extra) => fresh.push({
      ts: now, q: q.key, qn, type, text, ticket, read: false, url: current[ticket]?.url || null, tid: current[ticket]?.tid || null, ...extra,
    });

    if (!rebase) {
      checkClock(Object.keys(current).filter(id => !seen[id]).map(id => current[id]), now);
      for (const [id, t] of Object.entries(current)) {
        // "seen" remembers tickets for 2 weeks, so tickets moving between grid pages don't re-alert
        if (!seen[id]) {
          const extra = [t.account, t.priority].filter(Boolean).join(', ');
          push('new', `New: ${label(id, t)}${extra ? ` (${extra})` : ''}`, id);
        }
        if (t.fr && RANK[t.fr] > RANK[prevSnap[id]?.fr || 'ok']) {
          push(t.fr, `First response ${t.fr === 'overdue' ? 'breached' : 'due soon'} (${dueAt(t.frDue)}): ${label(id, t)}`, id);
        }
        // A ticket back on the visible page after a while away gets no catch-up alert
        const p = prevSnap[id];
        // This kind of queue doesn't report every status change, only one that means it needs action again
        if (p && p.status !== t.status && resting(p) && !resting(t)) statusAlert(push, id, t, p);
        targetAlert(push, id, t, p ? (p.tgt === undefined ? t.tgt : p.tgt) : seen[id] ? t.tgt : 'ok');
      }
    }

    for (const id of Object.keys(current)) seen[id] = seen[id] || now;
    const cutoff = now - 14 * 86400000;
    for (const [id, ts] of Object.entries(seen)) if (ts < cutoff && !current[id]) delete seen[id];

    writeSnap(q, current);
    set(q.seen, seen);
    commitAlerts(q, fresh);
    setState(q, { mode: 'ok', lastScan: now, count: grid.tickets.length, ...coverage(grid), note: rebase ? 'Baseline saved' : '' });
  }

  // Service calls: new calls, moved calls, status changes, calls that disappear (completed or deleted)
  function scanCalls(q, grid) {
    const now = Date.now();
    const prev = readSnap(q);
    const current = {};
    for (const { id, ...c } of grid.calls) current[id] = { ...c, firstSeen: prev?.[id]?.firstSeen ?? now };
    writeSnap(q, current);

    const base = { mode: 'ok', lastScan: now, count: grid.calls.length, ...coverage(grid) };
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
    if (!base.partial) {
      for (const [id, p] of Object.entries(prev)) {
        if (!current[id]) push('removed', `Service call gone (completed or removed): ${callLabel(p)}`, id);
      }
    }
    commitAlerts(q, fresh);
    setState(q, { ...base, note: '' });
  }

  // Grid pager: "1 - 18 of 18" and the rows-per-page dropdown
  function pagerInfo() {
    const pager = gridScope().querySelector(AT.sel.pager);
    if (!pager) return null;
    const sel = pager.querySelector(AT.sel.pageSize);
    const m = (pager.querySelector(AT.sel.pagerRows)?.textContent || '').match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/);
    const sizes = sel ? [...sel.options].map(o => parseInt(o.value, 10)).filter(n => n > 0) : [];
    return {
      sel, from: m ? +m[1] : null, to: m ? +m[2] : null, total: m ? +m[3] : null,
      size: sel ? parseInt(sel.value, 10) || null : null, max: sizes.length ? Math.max(...sizes) : null,
    };
  }

  // Switch the grid to its largest page size so a scan sees as much as possible. This changes the
  // person's saved view, so it only happens with the setting on, or when they press the button
  // (force). Returns true if it changed.
  async function ensureMaxPageSize(force = false) {
    if (!force && !CONFIG.autoPageSize) return false;
    const pi = pagerInfo();
    if (!pi?.sel || !pi.max || parseInt(pi.sel.value, 10) >= pi.max) return false;
    const marker = gridScope().querySelector(AT.sel.row);
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
    return { total, partial: total > grid.rowCount, max: pi?.max ?? null, size: pi?.size ?? null };
  }

  // Each tab has its own toolbar; use the refresh button that belongs to the active grid
  function findRefreshButton() {
    const tab = activeGrid()?.closest(AT.sel.tabBox);
    for (const box of tab ? [tab, document] : [document]) {
      for (const t of AT.text.refreshTitles) {
        const btn = box.querySelector(`[title="${t}"]`);
        if (btn) return btn;
      }
      const icon = box.querySelector(AT.sel.refreshIcon);
      if (icon) return icon.closest(AT.sel.clickable) || icon;
    }
    return null;
  }
  function findColumnChooserButton() {
    const tab = activeGrid()?.closest(AT.sel.tabBox);
    const sel = `[title="${AT.text.columnChooserTitle}"]`;
    return (tab && tab.querySelector(sel)) || document.querySelector(sel);
  }

  // ---------------------------------------------------------------------------
  // Missing columns: add them through the grid's own Column Chooser
  // ---------------------------------------------------------------------------
  const REQUIRED = {
    full: ['ticket', 'title', 'status', 'account', 'priority', 'slaEvent', 'slaDue'],
    intake: ['ticket', 'title', 'status', 'account', 'priority', 'created', 'slaEvent', 'slaDue'],
    calls: ['account', 'start', 'end', 'status', 'priority', 'description'],
  };
  const colList = keys => keys.map(k => COLUMN_NAMES[k]).join(', ');

  function headerTexts(scope = gridScope()) {
    let best = null;
    for (const row of scope.querySelectorAll(AT.sel.nonRow)) {
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

  // Autotask buttons don't always react to a bare click(), so send the full pointer sequence. `exact`:
  // to this element itself, not the nearest clickable around it (a choice inside a drop-down list).
  function press(el, exact = false) {
    if (!el) return false;
    const target = exact ? el : el.closest(AT.sel.clickable) || el;
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
      for (const lm of doc.querySelectorAll(AT.sel.chooser)) {
        const box = lm.closest(AT.sel.chooserBox) || doc.body;
        const title = clean(box.querySelector(AT.sel.chooserTitle)?.textContent || doc.title);
        if (AT.text.columnChooserDialog.test(title) && lm.querySelector(AT.sel.chooserLeft) && lm.querySelector(AT.sel.chooserRight)) return box;
      }
    }
    return null;
  }

  async function addColumnsViaChooser(keys) {
    const btn = findColumnChooserButton();
    if (!btn) return { added: [], missing: keys, why: 'no Column Chooser button found' };
    press(btn);
    const dlg = await waitFor(findChooserDialog, 10000);
    if (!dlg) return { added: [], missing: keys, why: 'the Column Chooser did not open' };

    const left = dlg.querySelector(`${AT.sel.chooser} ${AT.sel.chooserLeft}`);
    const right = dlg.querySelector(`${AT.sel.chooser} ${AT.sel.chooserRight}`);
    const close = () => press(dlg.querySelector(AT.sel.dialogClose));
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
    press(dlg.querySelector(AT.sel.chooserMoveRight));
    await sleep(400);
    // Fallback: list movers usually also move an option on double-click
    for (const o of opts.filter(o => !inRight(o))) {
      o.selected = true;
      o.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await sleep(150);
    }
    const added = [...picks].filter(([, o]) => inRight(o)).map(([k]) => k);
    if (!added.length) { close(); return { added: [], missing: keys, why: "the Column Chooser didn't accept the change" }; }

    const marker = gridScope().querySelector(AT.sel.row);
    press(dlg.querySelector(AT.sel.chooserSave));
    await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
    await sleep(600);
    return { added, missing: keys.filter(k => !added.includes(k)), why: added.length < keys.length ? 'not offered in the Column Chooser' : '' };
  }

  function logColumnsAdded(q, r) {
    if (!r.added.length) return;
    // Logged quietly in Changes (no ping)
    set(K.alerts, get(K.alerts, []).concat([{ ts: Date.now(), q: q.key, qn: qName(q), type: 'status', read: true,
      text: `Added column${r.added.length > 1 ? 's' : ''} to ${qWhere(q)}: ${colList(r.added)}` }]).slice(-CONFIG.maxAlerts));
  }
  const columnState = r => (r.missing.length
    ? { colMissing: r.missing, colNote: `Couldn't add ${colList(r.missing)} (${r.why}). Add ${r.missing.length > 1 ? 'them' : 'it'} with the grid's Column Chooser if your Autotask has ${r.missing.length > 1 ? 'them' : 'it'}.` }
    : { colMissing: [], colNote: '' });

  // Before a scan: note any columns this queue needs. Adding them changes the person's saved view for
  // that grid, so it happens only with the setting on (each set tried at most every 6 hours) or when
  // they press "Add missing columns".
  async function ensureColumns(q) {
    const missing = missingColumns(q);
    if (!missing.length) { if (get(q.state, {}).colNote) setState(q, { colNote: '', colMissing: [] }); return; }
    if (!CONFIG.autoColumns) {
      setState(q, { colMissing: missing, colNote: `Missing column${missing.length > 1 ? 's' : ''}: ${colList(missing)}.` });
      return;
    }
    const tried = { ...get(K.colTried, {}) };
    const key = q.key + ':' + missing.join(',');
    if (tried[key] && Date.now() - tried[key] < 6 * 3600000) return;
    tried[key] = Date.now();
    set(K.colTried, tried);

    const r = await addColumnsViaChooser(missing);
    logColumnsAdded(q, r);
    setState(q, columnState(r));
  }

  // "Add missing columns" / "Show up to N rows" can be pressed in any tab; the tab monitoring the
  // queue does the work (directly if that's this page, otherwise through the storage event)
  function requestGridFix(q, what) {
    set(K.gridFixReq, { qKey: q.key, what, ts: Date.now() });
    if (ownsLock(q)) fixGrid(q, what);
    flashNote(what === 'columns' ? 'Adding the missing columns…' : 'Switching the grid to more rows per page…');
  }
  function handleGridFixRequest() {
    const r = get(K.gridFixReq, null);
    if (!r || Date.now() - r.ts > 30000) return;
    const q = trackedQueues().find(x => x.key === r.qKey);
    if (q && ownsLock(q)) fixGrid(q, r.what);
  }
  async function fixGrid(q, what) {
    await waitFor(() => !busy, 30000);
    if (busy || !ownsLock(q)) return;
    busy = true;
    try {
      if (what === 'columns') {
        const missing = missingColumns(q);
        if (missing.length) {
          const r = await addColumnsViaChooser(missing);
          logColumnsAdded(q, r);
          setState(q, columnState(r));
        }
      } else if (what === 'rows') {
        await ensureMaxPageSize(true);
      }
    } catch (e) {
      console.error('[ATQM]', e);
    } finally {
      busy = false;
    }
    tick({ manual: true });
  }

  // MutationObserver instead of polling: background tabs throttle timers heavily
  function waitForRefresh(marker, timeout) {
    return new Promise(resolve => {
      let obs, t;
      const done = v => { obs?.disconnect(); clearTimeout(t); resolve(v); };
      const check = () => { if (marker ? !marker.isConnected : !!document.querySelector(AT.sel.row)) done(true); };
      obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true });
      t = setTimeout(() => done(false), timeout);
      check();
    });
  }

  async function refreshAndScan(q, { staleSig = '' } = {}) {
    const resized = await ensureMaxPageSize();
    const btn = resized ? null : findRefreshButton();
    if (btn) {
      const marker = gridScope().querySelector(AT.sel.row);
      btn.click();
      await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
      await sleep(400);
    }
    if (pageInfo(true).q?.key !== q.key) return setState(q, { mode: 'waiting', note: `Monitoring tab moved off ${qWhere(q)}` });

    await ensureColumns(q);
    if (staleSig && gridSignature() === staleSig) {
      staleSkips.set(q.key, (staleSkips.get(q.key) || 0) + 1);
      return setState(q, { note: 'Waiting for the grid to switch to this queue' });
    }
    staleSkips.delete(q.key);

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
  let lastTick = 0;
  const owned = new Set();

  // A short message in the widget that clears itself
  function flashNote(text, ms = 5000) {
    localNote = text;
    render();
    setTimeout(() => { if (localNote === text) { localNote = ''; render(); } }, ms);
  }

  async function tick({ manual = false } = {}) {
    if (busy) return;
    if (!manual && !get(K.enabled, false)) return;
    handleMoveRequest();
    if (!manual && Date.now() < retiredUntil) { renderSoon(); return; }
    if (rotationTab()) {
      // Only the page that shows the queue grid does the rounds (not the outer page around a frame)
      if (!gridPresent() || !get(K.enabled, false)) return;
      busy = true;
      lastTick = Date.now();
      try { await rotate(); } catch (e) { console.error('[ATQM]', e); } finally { busy = false; renderSoon(); }
      return;
    }
    busy = true;
    lastTick = Date.now();
    let q = null;
    try {
      const pg = pageInfo(true);
      const list = trackedQueues();

      // This tab was monitoring a queue but has moved off it
      for (const key of [...owned]) {
        if (pg.q?.key === key) continue;
        owned.delete(key);
        const old = list.find(x => x.key === key);
        if (!old) continue; // stopped tracking
        releaseLock(old);
        setState(old, { mode: 'waiting', note: `Monitoring tab moved off ${qWhere(old)}` });
      }

      // A queue shown in a frame is monitored by that frame, not by this page
      if (!pg.q || pg.remote) return;
      q = pg.q;
      // Nobody monitors it, but this ordinary tab hasn't been asked to: the page banner offers the choice
      if (!owned.has(q.key) && !ownsLock(q) && !mayMonitorHere(q)) return;
      if (!(await acquireLock(q))) { owned.delete(q.key); return; } // another tab monitors it now
      if ((!q.section && pg.cur.section) || (q.mode === 'calls' && (q.section || '') !== (pg.cur.section || ''))) {
        saveQueues(list.map(x => (x.key === q.key ? { ...x, section: pg.cur.section || '' } : x)));
      }
      owned.add(q.key);
      if (get(q.state, {}).url !== location.href) setState(q, { url: location.href });
      await refreshAndScan(q);
    } catch (e) {
      console.error('[ATQM]', e);
      if (q) setState(q, { mode: 'error', note: 'Scan failed: ' + e.message });
    } finally {
      busy = false;
      renderSoon();
    }
  }

  function requestScan() {
    set(K.scanReq, Date.now()); // monitoring tabs pick this up
    if (pageInfo(true).q) tick({ manual: true });
    flashNote('Scan requested', 8000);
  }

  function slug(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

  // Track a queue and get it monitored somewhere other than the tab you're working in, so that tab isn't
  // taken over and locked: a copy of this page in a new tab, or (one-tab setting) the tab that monitors
  // every queue. Runs from the button press (browsers block tabs opened later). Returns what
  // monitorElsewhere did: 'opened', 'running' or 'blocked'.
  function startTracking(cur, mode, url) {
    const list = trackedQueues();
    const existing = findTracked(cur);
    if (existing) return monitorElsewhere(existing, url);
    let key = slug(`${cur.section}-${cur.nav}`) || 'queue';
    while (list.some(q => q.key === key)) key += '-2';
    list.push({ key, nav: cur.nav, section: cur.section, mode });
    saveQueues(list);
    if (!get(K.enabled, false)) set(K.enabled, true);
    // The tab first, while the click still counts: browsers only allow a new tab straight after a click
    const result = monitorElsewhere(trackedQueues().find(q => q.key === key), url);
    if (CONFIG.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (CONFIG.sound) beep(false);
    render();
    return result;
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
  function launchedTab() { try { return !!sessionStorage.getItem(P + 'launched'); } catch { return false; } }

  // Tabs Quick start opened monitor their queue straight away. Any other tab asks first (the page
  // banner offers "Monitor in this tab" or "Open a separate monitoring tab"), so the tab you're
  // working in isn't taken over and locked without warning. The answer lasts for this tab.
  const CONSENT_KEY = P + 'monitorHere';
  function consented() { try { return JSON.parse(sessionStorage.getItem(CONSENT_KEY) || '[]'); } catch { return []; } }
  function consentHere(q) {
    try {
      const list = consented();
      if (!list.includes(q.key)) sessionStorage.setItem(CONSENT_KEY, JSON.stringify([...list, q.key]));
    } catch { /* ignore */ }
  }
  // A tab opened for a queue (Quick start, Start tracking) monitors only that queue while it's on its way
  // there: it usually opens on whichever queue My Workspace shows first, and mustn't grab that one.
  function mayMonitorHere(q) {
    if (rotationTab()) return true;
    const going = launchKey();
    if (going) return going === q.key;
    return launchedTab() || consented().includes(q.key);
  }

  // Open one queue's tab in this window; the window name tells the new tab which queue it's for
  function openQueueTab(q, url) {
    const win = W.open(url, LAUNCH + q.key + '~' + Date.now().toString(36));
    if (!win) { notePopups('blocked'); return false; }
    // Some blockers hand back a tab and close it straight away
    setTimeout(() => { try { if (win.closed) notePopups('blocked'); } catch { /* ignore */ } }, 1500);
    return true;
  }
  // Remembered for every tab, so the notice shows wherever you are next
  function notePopups(state) {
    const cur = get(K.popups, null);
    if (cur && cur.state === state && (state === 'allowed' || !cur.dismissed)) return;
    set(K.popups, { state, ts: Date.now() });
    renderSoon();
  }
  const popupsBlocked = () => { const p = get(K.popups, null); return !!p && p.state === 'blocked' && Date.now() - p.ts < 7 * 86400000; };
  // A tab of its own to monitor q: it starts by itself (see mayMonitorHere) and clicks the queue in the
  // menu if the page doesn't open on it. Meanwhile the page banner here says it's on its way.
  function openMonitorTab(q, url) {
    if (!q || !url || !openQueueTab(q, url)) return false;
    const now = Date.now(), pending = {};
    for (const [k, ts] of Object.entries(get(K.launchPending, {}))) if (now - ts < 60000) pending[k] = ts;
    set(K.launchPending, { ...pending, [q.key]: now });
    return true;
  }
  const launchPending = q => Date.now() - (+get(K.launchPending, {})[q.key] || 0) < 60000;

  // Where Quick start opens a queue: the address it was last monitored at, or any My Workspace & Queues
  // page (the new tab then clicks the queue in the menu itself)
  const queueUrl = q => get(q.state, {}).url || get(K.wsUrl, null);

  // Queues nobody is monitoring and no tab is on its way to. The one this tab shows counts too unless
  // this tab monitors it: ordinary tabs only monitor when asked, so Quick start opens it a tab of its own.
  function idleQueues() {
    const pg = pageInfo();
    const mine = pg.q && pg.owns ? pg.q.key : null;
    return activeQueues().filter(q => q.key !== mine && !foreignActive(q) && !ownsLock(q) && !monitorPending(q));
  }

  // Tracked queues currently monitored by some other tab
  const busyElsewhere = () => activeQueues().filter(q => foreignActive(q));

  // Quick start / move here. Opens a tab in THIS window for every tracked queue, including the one this
  // tab shows (this tab is never taken over). When queues are already monitored elsewhere, those tabs
  // are asked to stop and close themselves first; a queue this tab monitors itself stays here.
  let qsBlockedAt = 0; // when the browser last blocked some of Quick start's tabs (the Quick start box says so)
  function quickStart() {
    const moving = busyElsewhere().length > 0;
    if (CONFIG.oneTab) return quickStartOneTab(moving);
    const here = pageInfo(true);
    const mine = here.q && here.owns ? here.q.key : null;
    if (moving) set(K.moveReq, { ts: Date.now(), tab: tabId() });
    const idle = moving ? activeQueues().filter(q => q.key !== mine && !ownsLock(q) && !launchPending(q)) : idleQueues();
    const ready = idle.filter(queueUrl);
    // Unless pop-ups are allowed for the site, browsers let one click open one tab and block the rest
    let opened = 0;
    for (const q of ready) if (openMonitorTab(q, queueUrl(q))) opened++;
    const blocked = ready.length - opened;
    qsBlockedAt = blocked ? Date.now() : 0;
    if (opened > 1) notePopups('allowed');
    if (!get(K.enabled, false)) set(K.enabled, true);
    if (!blocked) set(K.qsSnooze, Date.now() + 3 * 60000); // give the new tabs time to start monitoring
    const notes = [];
    if (opened) notes.push(`${moving ? 'Moving' : 'Opening'} ${opened} queue tab${opened > 1 ? 's' : ''} ${moving ? 'to' : 'in'} this window…`);
    if (blocked) {
      notes.push(`Your browser only let ${opened} of ${ready.length} tabs open. Allow pop-ups for autotask.net ` +
        '(the icon at the right of the address bar), then press Quick start again for the rest.');
    }
    const unknown = idle.filter(q => !queueUrl(q));
    if (unknown.length) notes.push(`Monitoring is on. Open My Workspace & Queues once so Quick start can open ${unknown.map(qWhere).join(', ')} for you.`);
    flashNote(notes.join(' '), 15000);
  }

  // q's entry in the queue menu
  const menuEntryFor = q => navItems().find(i => same(i.name, q.nav) &&
    (!q.section || !sectionOf(i.el) || same(sectionOf(i.el), q.section)));

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
    const target = menuEntryFor(q);
    if (!target) return;
    if (++launchTries > 8) { clearLaunch(); return; }               // give up quietly after ~20 s
    press(target.el);
    pageCache.t = 0;
  }

  // ---------------------------------------------------------------------------
  // One tab for all queues (setting "Monitor all queues from one tab"). Quick start opens a single tab
  // that takes every queue nobody else is monitoring and checks them in turn: it clicks the queue in
  // the menu, refreshes it and scans it, then moves on. One new tab needs no pop-up permission.
  // ---------------------------------------------------------------------------
  const ROTATE_KEY = '*';           // launch key of the one-tab monitor (queue keys are slugs, never '*')
  const ROTATE_SS = P + 'rotate';   // in that tab's sessionStorage, so it stays one across page reloads
  const ROTATOR = { key: ROTATE_KEY };
  function rotationTab() {
    try { if (sessionStorage.getItem(ROTATE_SS)) return true; } catch { /* ignore */ }
    return launchKey() === ROTATE_KEY;
  }
  // Each queue should come round about once per refresh interval. Switching takes a few seconds, so
  // never move on more often than every 20 s.
  const rotationStep = n => Math.max(20000, CONFIG.refreshMs / Math.max(1, n));
  const rotatorAlive = () => { const r = get(K.rotator, null); return !!r && Date.now() - r.ts < staleMs(); };
  // How old a queue's last scan may get before it counts as stopped. The one-tab monitor reaches each
  // queue once per round, and with many queues a round takes longer than one refresh (about 30 s a queue).
  // Scans also come further apart than the refresh setting says: the browser holds back a background
  // tab's timers (often by up to a minute each), so allow for the gaps this queue has actually had too.
  function scanStaleMs(q) {
    const r = get(K.rotator, null);
    const queues = r && Date.now() - r.ts < staleMs() && (r.queues || []).includes(q.key) ? r.queues.length : 0;
    return Math.max(staleFor(q), queues * 30000 * 2.5, (get(q.state, {}).every || 0) * 2.5);
  }

  // What the grid shows, to tell whether it has really switched to another queue
  const gridSignature = () => [...gridScope().querySelectorAll(AT.sel.row)].slice(0, 30).map(r => clean(r.textContent)).join('\n');

  // Show q in this page by clicking it in the queue menu. True once the menu shows it and the grid
  // has been redrawn.
  async function switchToQueue(q) {
    if (pageInfo(true).q?.key === q.key) return true;
    const target = menuEntryFor(q);
    if (!target) return false;
    const marker = gridScope().querySelector(AT.sel.row);
    press(target.el);
    const shown = await waitFor(() => { pageCache.t = 0; return pageInfo(true).q?.key === q.key; }, 20000);
    if (!shown) return false;
    if (marker) await waitForRefresh(marker, CONFIG.postRefreshTimeoutMs);
    await sleep(600);
    return pageInfo(true).q?.key === q.key;
  }

  const lastTry = new Map();    // queue key -> when this tab last tried it (a queue that fails can't hog the turn)
  const staleSkips = new Map(); // queue key -> scans skipped because the grid still showed the previous queue

  // One step of the rounds: take the queue whose turn it is, switch to it and scan it
  async function rotate() {
    const r = get(K.rotator, null);
    // Another page in this same tab (another frame) is already doing the rounds
    if (r && r.id !== ID && r.tab === tabId() && Date.now() - r.ts < staleMs()) return;
    const qs = activeQueues();
    // Take every queue nobody else monitors, keep the ones held, let go of ones no longer tracked
    for (const q of qs) if (await acquireLock(q)) owned.add(q.key);
    for (const key of [...owned]) {
      if (qs.some(q => q.key === key)) continue;
      releaseLock({ key, ...qStore({ key }) });
      owned.delete(key);
    }
    const mine = qs.filter(q => owned.has(q.key) && ownsLock(q));
    set(K.rotator, { id: ID, tab: tabId(), ts: Date.now(), queues: mine.map(q => q.key) });
    if (!mine.length) return;

    // The one due soonest: each queue comes round about once per its own refresh (Service calls less often)
    const due = q => Math.max(get(q.state, {}).lastScan || 0, lastTry.get(q.key) || 0) + refreshOf(q);
    const q = mine.slice().sort((a, b) => due(a) - due(b))[0];
    lastTry.set(q.key, Date.now());
    const switching = pageInfo(true).q?.key !== q.key;
    const before = switching ? gridSignature() : '';
    if (switching && !(await switchToQueue(q))) {
      return setState(q, { mode: 'error', note: `The monitoring tab couldn't open ${qWhere(q)} from the queue menu` });
    }
    if (get(q.state, {}).url !== location.href) setState(q, { url: location.href });
    // The grid can lag behind the menu. Scanning it then would credit one queue's tickets to another, so
    // wait for it (but not forever: two queues can genuinely show the same tickets)
    await refreshAndScan(q, { staleSig: (staleSkips.get(q.key) || 0) < 2 ? before : '' });
  }

  // Get q monitored without using this tab. Returns 'opened', 'running' (the one-tab monitor will pick
  // it up on its next round) or 'blocked' (the browser stopped the new tab).
  function monitorElsewhere(q, url) {
    if (CONFIG.oneTab) {
      if (rotatorAlive()) return 'running';
      return openMonitorTab(ROTATOR, url) ? 'opened' : 'blocked';
    }
    return openMonitorTab(q, url) ? 'opened' : 'blocked';
  }
  // A tab is on its way to monitor q (its own, or the one-tab monitor)
  const monitorPending = q => launchPending(q) || (CONFIG.oneTab && launchPending(ROTATOR));

  // Quick start in one-tab mode: open the tab that monitors every queue, unless one is already running
  function quickStartOneTab(moving) {
    if (!moving && rotatorAlive()) {
      flashNote('Your monitoring tab is running. It picks up new queues on its next round.', 6000);
      return;
    }
    const url = get(K.wsUrl, null) || activeQueues().map(queueUrl).find(Boolean);
    if (!url) {
      flashNote('Open My Workspace & Queues once so Quick start knows where your queues are.', 8000);
      return;
    }
    if (moving) set(K.moveReq, { ts: Date.now(), tab: tabId() });
    if (!get(K.enabled, false)) set(K.enabled, true);
    if (openMonitorTab(ROTATOR, url)) {
      qsBlockedAt = 0;
      set(K.qsSnooze, Date.now() + 3 * 60000);
      flashNote(`${moving ? 'Moving monitoring to' : 'Opening'} one tab for all your queues…`, 6000);
    } else {
      qsBlockedAt = Date.now();
      flashNote(BLOCKED, 10000);
    }
  }

  let retiredUntil = 0, moveHandled = Date.now(); // ignore requests made before this page loaded
  function handleMoveRequest(req = get(K.moveReq, null)) {
    if (!req || req.ts <= moveHandled || Date.now() - req.ts > 60000) return;
    moveHandled = req.ts;
    if (req.tab === tabId()) return;                       // the tab that asked keeps its queue
    const mine = trackedQueues().filter(q => owned.has(q.key) || ownsLock(q));
    // A queue tab is one that's monitoring, one Quick start opened that's still on its way,
    // or one showing a tracked queue. Other Autotask tabs are left alone.
    if (!mine.length && !launchKey() && !rotationTab() && !pageInfo(true).q) return;
    mine.forEach(q => { releaseLock(q); owned.delete(q.key); });
    retiredUntil = Date.now() + 2 * 60000;                 // don't grab the queues back while the new tabs start
    clearLaunch();
    try { sessionStorage.removeItem(ROTATE_SS); } catch { /* ignore */ }
    setTimeout(() => {
      try { W.top.close(); } catch { /* not allowed */ }
      // Still here: browsers only let a tab close itself if a script opened it
      showNote('Monitoring moved to another window. You can close this tab.');
    }, 300);
  }
  // Notes from the frame that does the monitoring belong in the widget, which lives in the top window
  function showNote(text) {
    if (!isTop) postToTop({ atqm: 'note', text });
    localNote = text;
    render();
  }

  function stopTracking(q) {
    releaseLock(q);
    owned.delete(q.key);
    [q.snap, q.state, q.seen].forEach(del);
    saveQueues(trackedQueues().filter(x => x.key !== q.key));
  }

  // Move monitoring of a queue to this tab. With Web Locks the previous tab is told at once; without,
  // it notices on its next scan.
  function takeOver(q) {
    retiredUntil = 0;
    consentHere(q);
    owned.add(q.key);
    if (!get(K.enabled, false)) set(K.enabled, true);
    const start = () => {
      set(q.lock, { id: ID, ts: Date.now() });
      pageCache.t = 0;
      tick({ manual: true });
      render();
    };
    if (webLocks && !held.has(q.key)) holdWebLock(q, true).then(start);
    else start();
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
#atqm-head b{flex:1;font-size:13px;white-space:nowrap}
#atqm-dot{width:9px;height:9px;border-radius:50%;background:#6b6f76;flex:none}
#atqm[data-health=ok] #atqm-dot{background:#3fb950}
#atqm[data-health=warn] #atqm-dot{background:#d29922}
#atqm-min,#atqm-dashbtn{background:none;border:0;color:#e6e6e6;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
#atqm-dashbtn{font-size:14px}
#atqm-health{padding:0 10px 8px;color:#9aa4b2}
#atqm-health div.warn{color:#e3b341}
#atqm-health b{color:#c9d1d9;font-weight:600}
#atqm.min #atqm-body,#atqm.min #atqm-health{display:none}
#atqm.min{width:auto;min-width:150px;max-width:290px}
#atqm.min #atqm-head{gap:6px}
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
.atqm-hint{grid-column:1/-1;color:#9aa4b2;font-size:11px;margin-top:-5px}
.atqm-warn{color:#e3b341}
#atqm-page{margin:0 10px 8px;padding:7px 9px;border-radius:4px;border-left:3px solid #4ea1ff;background:#22303f}
#atqm-page.here{border-left-color:#3fb950;background:#1f2e24}
#atqm-page.elsewhere{border-left-color:#6b7686;background:#26292f}
#atqm-page.untracked{border-left-color:#d29922;background:#2e2a1f}
.atqm-start{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.atqm-start button{background:#1f6feb;color:#fff;border:1px solid #1f6feb;border-radius:4px;padding:4px 8px;cursor:pointer;font:inherit;text-align:left}
.atqm-start button + button{background:#2b2f36;border-color:#555;color:#e6e6e6}
.atqm-start button:hover{filter:brightness(1.15)}
.atqm-basis{align-items:center;margin-bottom:4px}
.atqm-chip.ok{border-color:#3fb950}.atqm-chip.warn{border-color:#d29922}
.atqm-hint.atqm-basis-hint{margin:0 0 8px}
.atqm-tag.atqm-chg{background:#1f3350;color:#9cc8ff}
.atqm-seen{background:#2b2f36;color:#c9d1d9;border:1px solid #444;border-radius:4px;padding:0 6px;margin-left:2px;cursor:pointer;font:inherit;font-size:11px}
.atqm-seen:hover{background:#3a3e46}
.atqm-next li.doing::before{background:#4ea1ff;color:#0d1117}
.atqm-list li.doing{border-color:#4ea1ff}.atqm-list li.doing .atqm-when{color:#9cc8ff;font-weight:600}
.atqm-next li.atqm-next-more{font-weight:400}
.atqm-more{background:none;border:0;color:#7fb8ff;cursor:pointer;font:inherit;padding:2px 0}
.atqm-more:hover{text-decoration:underline}
.atqm-qsbox.atqm-popwarn{border-left-color:#d29922;background:#2e2a1f}
#atqm-qs .atqm-qsbox + .atqm-qsbox{margin-top:6px}
#atqm-dash{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;background:#141518;color:#e6e6e6;
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;animation:atqm-set-in .18s ease-out}
#atqm-dash *{box-sizing:border-box}
#atqm-dash [hidden]{display:none!important}
#atqm-dash:focus{outline:none}
#atqm-dash button:focus-visible,#atqm-dash a:focus-visible,#atqm-dash [tabindex]:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
.dash-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.dash-main{flex:1;min-height:0;overflow:auto;padding:24px 32px 48px;overscroll-behavior:contain}
.dash-inner{max-width:1760px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.dash-note{display:flex;align-items:center;gap:10px;background:#2e2a1f;border:1px solid #4a3f22;border-radius:10px;padding:10px 14px;color:#e3b341}
.dash-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.dash-kpi{background:#1e1f22;border:1px solid #2c2f35;border-radius:12px;padding:14px 16px;min-width:0}
.dash-kpi .l{display:flex;align-items:center;gap:10px;color:#c9d1d9;font-weight:500}
.dash-kpi .l > .atqm-ico{width:28px;height:28px;border-radius:8px;background:#22262d;color:#9cc8ff}
.dash-kpi .v{font-size:28px;font-weight:600;line-height:1.15;margin-top:10px;font-variant-numeric:tabular-nums}
.dash-kpi .s{color:#9aa4b2;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash-kpi.critical{border-color:#5a3a3c}.dash-kpi.critical .l > .atqm-ico{background:#3a2226;color:#ff7b7f}
.dash-kpi.warning{border-color:#4a3f22}.dash-kpi.warning .l > .atqm-ico{background:#352c1a;color:#e3b341}
.dash-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1400px){.dash-layout{grid-template-columns:minmax(0,1fr)}}
@media (max-width:820px){.dash-main{padding:16px 16px 32px}}
.dash-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
.dash-card{background:#1e1f22;border:1px solid #2c2f35;border-radius:12px;overflow:hidden;min-width:0}
.dash-card-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #272a2f;flex-wrap:wrap}
.dash-card-h > .atqm-ico{width:26px;height:26px;border-radius:7px;background:#22262d;color:#9cc8ff}
#atqm-dash .dash-card-h h2{font-size:15px;font-weight:600;margin:0;line-height:1.4;color:#e6e6e6}
.dash-count{color:#9aa4b2;font-size:12.5px}
.dash-tools{margin-left:auto;display:flex;align-items:center;gap:6px}
.dash-card-b{padding:12px 16px 14px}
.dash-card-b.rows{padding:0}
.dash-card-b > .atqm-hint{margin:0 0 10px}
.dash-tablewrap{overflow-x:auto;margin:0 -16px}
.dash-tt{font-size:13px}
.dash-tt th{white-space:nowrap}.dash-tt.dash-mq th:last-child{text-align:right}
.dash-tt td{padding:6px 8px;white-space:nowrap}
.dash-tt th:first-child,.dash-tt td:first-child{padding-left:16px}.dash-tt th:last-child,.dash-tt td:last-child{padding-right:16px}
.dash-tt td.fill{width:100%;max-width:0;overflow:hidden;text-overflow:ellipsis}
.dash-tt .tt{color:#e6e6e6}.dash-tt .acct,.dash-tt .was,.dash-tt td.dl{color:#9aa4b2}
.dash-tt td.when{font-weight:600}
.dash-tt tr.dash-grp td{background:#1a1b1f;color:#9aa4b2;font-weight:600;font-size:12px;padding-top:7px;padding-bottom:7px;border-bottom-color:#272a2f}
.dash-tt tr:not(.dash-grp):hover td{background:#202227}
.dash-tt tr.overdue td:first-child{box-shadow:inset 3px 0 #e5484d}.dash-tt tr.soon td:first-child{box-shadow:inset 3px 0 #d29922}
.dash-tt tr.doing td:first-child{box-shadow:inset 3px 0 #4ea1ff}.dash-tt tr.doing .when{color:#9cc8ff}.dash-tt tr.fresh td:first-child{box-shadow:inset 3px 0 #3fb950}
.dash-tt tr.callnow td:first-child{box-shadow:inset 3px 0 #3fb950}.dash-tt tr.call td:first-child{box-shadow:inset 3px 0 #8b7cf6}
.dash-tt tr.overdue .when{color:#ff7b7f}.dash-tt tr.soon .when{color:#e3b341}
.dash-tt tr.resting td{color:#9aa4b2}.dash-tt tr.resting .tt{color:#c9d1d9}
.dash-chart{position:relative;height:150px;margin:18px 4px 24px 30px}
.dash-gl,.dash-base{position:absolute;left:0;right:0;height:0;border-top:1px solid #2c2f35}
.dash-base{border-top-color:#383835}
.dash-tick{position:absolute;left:-30px;width:24px;text-align:right;transform:translateY(-50%);color:#898781;font-size:11px;font-variant-numeric:tabular-nums}
.dash-cols{position:absolute;inset:0;display:flex}
.dash-col{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;outline-offset:-2px}
.dash-bar{width:min(24px,60%);background:#3987e5;border-radius:4px 4px 0 0}
.dash-col:hover .dash-bar,.dash-col:focus .dash-bar{background:#5598e7}
.dash-cap{color:#c9d1d9;font-size:11px;margin-bottom:2px}
.dash-xl{position:absolute;bottom:-20px;color:#898781;font-size:11px;white-space:nowrap}
.dash-tip{position:absolute;top:-8px;z-index:2;width:200px;background:#2b2f36;border:1px solid #3a3d44;border-radius:8px;
  padding:6px 8px;font-size:12px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.45)}
.dash-tip b{font-size:14px}
.dash-table{width:100%;border-collapse:collapse;font-size:12px}
.dash-table th{text-align:left;color:#9aa4b2;font-weight:600;border-bottom:1px solid #2c2f35;padding:6px}
.dash-table td{border-bottom:1px solid #272a2f;padding:4px 6px;vertical-align:top}
.dash-table td.num{font-variant-numeric:tabular-nums;text-align:right}
.dash-q{padding:12px 16px;border-top:1px solid #272a2f}.dash-q:first-child{border-top:0}
.dash-q .atqm-chips{margin:6px 0 0}
.dash-qh{display:flex;align-items:center;gap:8px}.dash-qh .atqm-sub{font-size:12px}
.dash-qn{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}
.dash-qs{font-size:12px;margin:2px 0 0}
.dash-card-b .atqm-list{margin:0}
.set-btn.sm{height:26px;padding:0 10px;font-size:12px}
.atqm-st{font-weight:600}
.atqm-meta{margin-right:6px}.atqm-meta > * + *{margin-left:6px}
.atqm-pri{color:#9aa4b2}.atqm-pri.hi{color:#ff7b7f;font-weight:600}
.atqm-list li.action{border-color:#f0883e}
.atqm-tag.atqm-acttag{background:#3d2a14;color:#ffb86b}
#atqm-tabs button[data-tab=macros]{margin-left:auto}
.mc-hint{margin-bottom:8px}
.mc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.mc-sq{aspect-ratio:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;
  background:#24262b;color:#e6e6e6;border:1px solid #33363c;border-top:3px solid #4ea1ff;border-radius:6px;cursor:pointer;
  font:inherit;text-align:center;overflow-wrap:anywhere;user-select:none}
.mc-sq:hover,.mc-sq.on{background:#22303f;border-color:#4ea1ff}
.mc-sq b{font-size:12.5px;font-weight:600;line-height:1.3}
.mc-sq .atqm-sub{font-size:10.5px}
.mc-sq:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
#atqm-mcwin{position:fixed;z-index:2147483002;width:320px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;
  background:#1e1f22;color:#e6e6e6;border:1px solid #3b4a5e;border-top:3px solid #4ea1ff;border-radius:6px;padding:8px 12px 12px;
  font:12px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)}
#atqm-mcwin *,#atqm-mcwin{box-sizing:border-box}
#atqm-mcwin [hidden]{display:none!important}
#atqm-mcwin .atqm-qsbtns{margin-top:10px}
#atqm-mcwin button:focus-visible,#atqm-mcwin select:focus-visible,#atqm-mcwin input:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
.mcw-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.mcw-head b{flex:1;font-size:13px}
.mcw-x{background:none;border:0;color:#9aa4b2;cursor:pointer;font:inherit;font-size:16px;line-height:1;padding:0 3px}
.mcw-x:hover{color:#e6e6e6}
.mc-field > label,.mcw-lbl{display:block;margin:8px 0 2px;color:#c9d1d9;font-weight:600}
.mc-field > .atqm-sub{margin-top:3px}
.mc-acc select,.mc-acc input,.mc-text{width:100%;background:#2b2f36;color:#e6e6e6;border:1px solid #444;border-radius:4px;padding:3px 6px;font:inherit}
.mc-acc input{margin-top:4px}
.mc-acc [hidden]{display:none}
.mcw-way{display:flex;align-items:flex-start;gap:6px;background:#24262b;border-radius:4px;padding:5px 8px;margin-top:4px;cursor:pointer}
.mcw-way > div{min-width:0}
.mcw-way input{margin:2px 0 0;flex:none}
.mcw-way.off{cursor:default}.mcw-way.off b{color:#9aa4b2}
.mcw-on,.mcw-how{margin-top:8px}
.atqm-qsbtns button:disabled{opacity:.5;cursor:default}
#atqm-tkpill{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:12px/1.45 system-ui,Segoe UI,sans-serif;color:#e6e6e6}
#atqm-tkpill *{box-sizing:border-box}
#atqm-tkpill [hidden]{display:none!important}
#atqm-tkpill .tk-open{background:#1e1f22;color:#e6e6e6;border:1px solid #3b4a5e;border-left:3px solid #4ea1ff;border-radius:14px;
  padding:4px 12px;cursor:pointer;font:inherit;opacity:.85;box-shadow:0 4px 12px rgba(0,0,0,.4)}
#atqm-tkpill .tk-open:hover,#atqm-tkpill .tk-open:focus-visible{opacity:1}
#atqm-tkpill .tk-box,#atqm-tkpill .tk-result{width:300px;background:#1e1f22;border:1px solid #3b4a5e;border-top:3px solid #4ea1ff;
  border-radius:6px;padding:8px 10px 10px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
#atqm-tkpill .tk-result{display:flex;align-items:center;gap:8px}
#atqm-tkpill .tk-result b{flex:1;font-weight:600}
#atqm-tkpill .tk-result button{background:#2b2f36;color:#e6e6e6;border:1px solid #555;border-radius:4px;padding:3px 10px;cursor:pointer;font:inherit}
#atqm-tkpill button:focus-visible,#atqm-tkpill select:focus-visible,#atqm-tkpill input:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
.mc-head{font-size:13px}
.mc-run .atqm-list{margin-top:6px}
.atqm-list li.mc-done{border-color:#3fb950}.atqm-list li.mc-failed{border-color:#e5484d}
.atqm-list li.mc-check,.atqm-list li.mc-skipped{border-color:#d29922}
.atqm-list li.mc-open,.atqm-list li.mc-edit,.atqm-list li.mc-verify{border-color:#4ea1ff;background:#22303f}
.atqm-mnote.atqm-mnext{color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.atqm-act{background:#1f6feb;color:#fff;border:0;border-radius:4px;padding:1px 8px;margin-left:4px;cursor:pointer;font:inherit;font-size:11px;vertical-align:1px}
.atqm-act:hover{filter:brightness(1.15)}
.atqm-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
#atqm-setbtn{background:none;border:0;color:#9aa4b2;cursor:pointer;padding:0 2px;line-height:0;display:inline-flex;align-items:center}
#atqm-setbtn svg{transition:transform .3s}
#atqm-setbtn:hover{color:#e6e6e6}#atqm-setbtn:hover svg{transform:rotate(60deg)}
.atqm-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0}
#atqm-settings{position:fixed;inset:0;z-index:2147483002;display:flex;flex-direction:column;background:#141518;color:#e6e6e6;
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;animation:atqm-set-in .18s ease-out}
@keyframes atqm-set-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#atqm-settings *{box-sizing:border-box}
html.atqm-set-open #atqm{visibility:hidden}
#atqm.atqm-off{display:none!important}
#atqm-navbtn{max-width:none}
.atqm-navlabel{position:relative;min-width:0;text-align:left}
.atqm-navby{position:absolute;left:0;top:100%;margin-top:1px;font-size:10px;line-height:1.1;white-space:nowrap;opacity:.75}
#atqm-navmenu{position:fixed;z-index:2147483003;min-width:250px;padding:4px 0;box-shadow:0 8px 24px rgba(0,0,0,.35);
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}
#atqm-navmenu *{box-sizing:border-box}
.atqm-navitem{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:6px 12px;border:0;font:inherit;text-align:left;cursor:pointer}
.atqm-navitem .atqm-ico{opacity:.8}
:where(#atqm-navmenu){background:#1e1f22;color:#e6e6e6;border:1px solid #3b4a5e;border-radius:6px}
:where(.atqm-navitem){background:transparent;color:inherit}
:where(.atqm-navitem:hover,.atqm-navitem:focus-visible){background:rgba(127,127,127,.2)}
.atqm-navitem:focus-visible{outline:2px solid #4ea1ff;outline-offset:-2px}
#atqm-settings [hidden]{display:none!important}
#atqm-settings:focus{outline:none}
#atqm-settings button:focus-visible,#atqm-settings input:focus-visible,#atqm-settings select:focus-visible,
#atqm-settings textarea:focus-visible{outline:2px solid #4ea1ff;outline-offset:1px}
.set-head{display:flex;align-items:center;gap:16px;padding:12px 24px;background:#1a1b1f;border-bottom:1px solid #2c2f35;flex:none}
.set-brand{display:flex;align-items:center;gap:12px;min-width:0}
.set-brand > .atqm-ico{width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#1f6feb,#4ea1ff);color:#fff}
#atqm-settings h1,#atqm-dash h1{font-size:18px;font-weight:600;margin:0;line-height:1.2;color:#e6e6e6}
.set-sub{color:#9aa4b2;font-size:12px}
.set-find{position:relative;margin-left:auto;width:min(340px,40vw);display:block}
.set-find .atqm-ico{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#9aa4b2;pointer-events:none}
#atqm-settings .set-find input[type=search]{width:100%;height:34px;padding:0 12px 0 32px;border-radius:17px;background:#141518}
.set-x{width:34px;height:34px;border-radius:8px;background:none;border:1px solid transparent;color:#9aa4b2;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;flex:none}
.set-x:hover{background:#2b2f36;color:#e6e6e6}
.set-body{flex:1;min-height:0;display:flex}
.set-nav{width:240px;flex:none;overflow:auto;padding:20px 12px;border-right:1px solid #2c2f35;display:flex;flex-direction:column;gap:2px;background:#17181b}
.set-nav button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border-radius:7px;background:none;border:0;
  color:#c9d1d9;text-align:left;cursor:pointer;font:inherit;white-space:nowrap}
.set-nav button .atqm-ico{color:#7d8794}
.set-nav button:hover{background:#202227}
.set-nav button[aria-current=true]{background:#1c2b40;color:#fff;box-shadow:inset 3px 0 #4ea1ff}
.set-nav button[aria-current=true] .atqm-ico{color:#4ea1ff}
.set-main{flex:1;min-width:0;overflow:auto;position:relative;padding:24px 32px 48px;scroll-behavior:smooth;overscroll-behavior:contain}
.set-inner{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:26px}
.set-hero{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:12px;border:1px solid #2b4a72;
  background:linear-gradient(120deg,#17263a,#1b2230 60%,#1e1f22)}
.set-hero > .atqm-ico{width:40px;height:40px;border-radius:10px;background:#1f6feb33;color:#7fb8ff}
.set-hero-t{font-size:15px;font-weight:600;color:#e6e6e6}
.set-sec{display:flex;flex-direction:column;gap:10px}
.set-sec-h{display:flex;align-items:flex-start;gap:10px;padding:0 2px}
.set-sec-h > .atqm-ico{margin-top:2px;width:26px;height:26px;border-radius:7px;background:#22262d;color:#9cc8ff}
#atqm-settings h2{font-size:15px;font-weight:600;margin:0;line-height:1.4;color:#e6e6e6}
.set-sec-h p{margin:1px 0 0;color:#9aa4b2;font-size:12.5px}
.set-card{background:#1e1f22;border:1px solid #2c2f35;border-radius:12px;overflow:hidden}
.set-row{display:flex;align-items:center;gap:20px;padding:14px 18px;border-top:1px solid #272a2f;transition:background-color .2s}
.set-card > .set-row:first-child,.set-card > [hidden] + .set-row{border-top:0}
.set-row.wide{flex-direction:column;align-items:stretch;gap:10px}
.set-row.changed{background:#1b2533;box-shadow:inset 3px 0 #4ea1ff}
.set-row.flash{animation:atqm-set-flash 1.8s ease-out}
@keyframes atqm-set-flash{0%,40%{background:#24395a}100%{background:transparent}}
.set-text{flex:1 1 220px;min-width:0}
.set-label{display:block;font-weight:500;color:#e6e6e6;cursor:default}
label.set-label{cursor:pointer}
.set-hint{color:#9aa4b2;font-size:12px;margin-top:2px}
.set-where{margin-left:8px;color:#9aa4b2;font-weight:400;font-size:12px}
.set-ctl{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.set-row.wide .set-text{flex:none}
.set-row.wide .set-ctl{flex-direction:column;align-items:stretch;gap:8px}
#atqm-settings input[type=text],#atqm-settings input[type=number],#atqm-settings input[type=search],#atqm-settings select{
  background:#15161a;color:#e6e6e6;border:1px solid #3a3d44;border-radius:7px;padding:0 10px;height:32px;font:inherit;margin:0;box-shadow:none}
#atqm-settings input:focus,#atqm-settings select:focus{border-color:#4ea1ff;box-shadow:0 0 0 3px #4ea1ff40;outline:none}
#atqm-settings select{width:250px;max-width:100%;-webkit-appearance:none;appearance:none;padding-right:30px;cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa4b2' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 9px center;background-size:14px}
#atqm-settings select option{background:#1e1f22;color:#e6e6e6}
.set-num{display:inline-flex;align-items:stretch}
#atqm-settings input[type=number]{width:84px;text-align:right}
#atqm-settings .set-num input{border-radius:7px 0 0 7px;text-align:right}
#atqm-settings .set-num input[type=text]{width:150px;text-align:left}
.set-num > span{display:flex;align-items:center;padding:0 10px;border:1px solid #3a3d44;border-left:0;border-radius:0 7px 7px 0;
  background:#24262b;color:#9aa4b2;font-size:12px}
#atqm-settings input.set-switch{-webkit-appearance:none!important;appearance:none!important;opacity:1!important;visibility:visible!important;
  position:relative!important;display:inline-block!important;flex:none;width:40px!important;height:22px!important;min-width:0!important;
  margin:0!important;padding:0!important;border:1px solid #4a4e57!important;border-radius:11px!important;background:#2b2f36!important;
  cursor:pointer;transition:background-color .15s,border-color .15s}
#atqm-settings input.set-switch::before{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
  background:#9aa4b2;transition:transform .15s,background-color .15s;box-shadow:0 1px 2px rgba(0,0,0,.4)}
#atqm-settings input.set-switch:checked{background:#1f6feb!important;border-color:#1f6feb!important}
#atqm-settings input.set-switch:checked::before{transform:translateX(18px);background:#fff}
.set-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:7px;background:#2b2f36;color:#e6e6e6;
  border:1px solid #3a3d44;cursor:pointer;font:inherit;font-weight:500;white-space:nowrap}
.set-btn:hover{background:#353941}
.set-btn.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
.set-btn.primary:hover{background:#3a82f0}
.set-btn.danger{background:none;color:#ff9b9e;border-color:#5a3a3c}
.set-btn.danger:hover{background:#3a2a2c}
.set-btn:disabled{opacity:.45;cursor:default;filter:none}
.set-q .atqm-ml{width:10px;height:10px}
.set-seg{display:inline-flex;background:#15161a;border:1px solid #3a3d44;border-radius:8px;padding:2px;gap:2px}
.set-seg button{background:none;border:0;color:#9aa4b2;padding:0 11px;height:26px;border-radius:6px;cursor:pointer;font:inherit;white-space:nowrap}
.set-seg button:hover{color:#e6e6e6}
.set-seg button[aria-pressed=true]{background:#1c2b40;color:#fff;box-shadow:inset 0 0 0 1px #2b4a72}
.set-pill{display:inline-block;background:#2b2440;color:#cdb8ff;border-radius:999px;padding:3px 10px;font-size:12px}
.set-tip,.set-empty,.set-fine{color:#9aa4b2;font-size:12.5px;gap:8px;justify-content:flex-start}
.set-tip{background:#1a1b1f}
.set-alert{background:#2e2a1f;color:#e3b341;gap:10px;justify-content:flex-start}
.set-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px;min-height:42px;background:#15161a;border:1px solid #3a3d44;
  border-radius:9px;cursor:text}
.set-chips:focus-within{border-color:#4ea1ff;box-shadow:0 0 0 3px #4ea1ff40}
.set-chip{display:inline-flex;align-items:center;gap:7px;background:#25282e;border:1px solid #363a42;border-radius:999px;
  padding:2px 3px 2px 10px;font-size:12.5px;line-height:20px}
.set-chip i{width:8px;height:8px;border-radius:50%;background:#6b7686;flex:none}
.set-chip button{width:20px;height:20px;border-radius:50%;border:0;background:none;color:#9aa4b2;cursor:pointer;font:inherit;
  font-size:14px;line-height:1;padding:0;display:inline-flex;align-items:center;justify-content:center}
.set-chip button:hover{background:#3a2a2c;color:#ff9b9e}
#atqm-settings input.set-chip-in{flex:1;min-width:150px;border:0;background:none;height:26px;padding:0 6px;box-shadow:none}
.set-sugg{display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:#9aa4b2;font-size:12px}
.set-sugg button{background:none;border:1px dashed #4a4e57;border-radius:999px;color:#c9d1d9;padding:1px 10px;cursor:pointer;font:inherit}
.set-sugg button:hover{border-color:#4ea1ff;color:#fff;background:#1c2b40}
.set-diag{padding:0 18px 16px;display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.set-diag textarea{width:100%;height:180px;background:#15161a;color:#c9d1d9;border:1px solid #3a3d44;border-radius:8px;padding:8px 10px;
  font:11.5px/1.45 ui-monospace,Consolas,monospace;resize:vertical}
.set-none{text-align:center;color:#9aa4b2;padding:40px 0}
.set-foot{display:flex;align-items:center;gap:10px;padding:12px 24px;background:#1a1b1f;border-top:1px solid #2c2f35;flex:none;
  transition:background-color .2s,border-color .2s}
.set-foot.dirty{background:#172233;border-top-color:#2b4a72}
.set-msg{flex:1;min-width:0;color:#9aa4b2}
.set-foot.dirty .set-msg{color:#9cc8ff;font-weight:500}
.set-msg.ok,.set-foot.dirty .set-msg.ok{color:#3fb950}
@media (max-width:820px){
  .set-head{padding:10px 16px;gap:10px}.set-sub{display:none}
  .set-find{width:auto;flex:1}
  .set-body{flex-direction:column}
  .set-nav{width:auto;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:8px 12px;border-right:0;border-bottom:1px solid #2c2f35}
  .set-nav button{width:auto}
  .set-nav button[aria-current=true]{box-shadow:inset 0 -2px #4ea1ff}
  .set-main{padding:16px 16px 32px}
  .set-row{flex-wrap:wrap;gap:10px}.set-ctl{justify-content:flex-start}
  .set-hero{flex-wrap:wrap}
  .set-foot{padding:10px 16px}
}
@media (prefers-reduced-motion:reduce){
  #atqm-settings,#atqm-dash,.set-row.flash{animation:none}.set-main{scroll-behavior:auto}
  #atqm-setbtn svg,#atqm-settings input.set-switch,#atqm-settings input.set-switch::before{transition:none}
}
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
    copy.setAttribute('aria-label', `Copy ticket number ${id}`);
    copy.onclick = () => copyText(id).then(ok => flashNote(ok ? `Copied ${id}` : `Couldn't copy ${id}. Select it and copy instead.`));
    wrap.append(a, copy);
    return wrap;
  }

  // Clipboard API first; pages in frames often aren't allowed it, so fall back to a hidden text box
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    ta.remove();
    return ok;
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

  // { cls: 'ok' | 'warn' | 'off', text, action?: { label, run } }
  function health(q) {
    if (!get(K.enabled, false)) return { cls: 'off', text: 'Paused.' };
    const st = get(q.state, null);
    const openIt = { cls: 'warn', text: rotatorAlive() ? 'Waiting for its turn in the monitoring tab.' : `Open ${qWhere(q)} in a tab and leave it open.` };
    if (!st) return openIt;
    const fresh = Date.now() - (st.ts || 0) < staleFor(q);
    if (fresh && (st.mode === 'waiting' || st.mode === 'error')) return { cls: 'warn', text: st.note };
    if (!st.lastScan) return openIt;
    if (Date.now() - st.lastScan > scanStaleMs(q)) {
      return { cls: 'warn', text: `Last scan ${ago(st.lastScan)}. Is the ${qWhere(q)} tab still open? ` +
        'If it is, your browser may have put it to sleep (see "Keeping monitoring alive" in the README).' };
    }
    const left = st.lastScan + refreshOf(q) - Date.now();
    const next = left > 60000 ? `, next in ${dur(left)}` : ', next scan due now';
    const unit = (q.mode === 'calls' ? 'call' : 'ticket') + (st.count === 1 ? '' : 's');
    if (st.partial) {
      const units = q.mode === 'calls' ? 'calls' : 'tickets';
      // The grid could show more per page: offer to switch it (that changes the saved view, so it asks)
      if (st.max && st.size && st.max > st.size) {
        return { cls: 'warn', text: `Only ${st.count} of ${st.total} ${units} visible (${st.size} per page), scanned ${ago(st.lastScan)}${next}. ` +
          "The rest aren't monitored.", action: { label: `Show up to ${st.max} rows`, run: () => requestGridFix(q, 'rows') } };
      }
      const rest = st.max ? `The grid shows at most ${st.max} rows, so ${units} beyond that aren't monitored.` : "The rest aren't monitored.";
      return { cls: 'warn', text: `Only ${st.count} of ${st.total} ${units} visible, scanned ${ago(st.lastScan)}${next}. ${rest} ` +
        'Narrow the view or sort by Created, newest first.' };
    }
    if (st.colNote) {
      return { cls: 'warn', text: `${st.count} ${unit}, scanned ${ago(st.lastScan)}. ${st.colNote}`,
        action: st.colMissing?.length ? { label: 'Add missing columns', run: () => requestGridFix(q, 'columns') } : null };
    }
    return { cls: 'ok', text: `${st.count} ${unit}, scanned ${ago(st.lastScan)}${next}${st.note ? '. ' + st.note : ''}` };
  }

  // Warnings about the monitor as a whole rather than one queue
  function globalWarnings() {
    const out = [];
    const failed = Math.max(storageFail?.ts || 0, remotePage?.storageFail || 0);
    if (Date.now() - failed < 10 * 60000) {
      out.push('Browser storage is full or blocked, so some changes may be reported twice. ' +
        'Lower "Changes kept in history" in Settings, or press Clear.');
    }
    const clock = clockWarning();
    if (clock) out.push(clock);
    return out;
  }

  // A health line: its text, plus a button when there's something to press
  function healthLine(h, prefix) {
    const line = el('div', h.cls === 'warn' ? 'warn' : '');
    if (prefix) line.append(el('b', null, prefix));
    line.append(h.text);
    if (h.action) {
      const b = el('button', 'atqm-act', h.action.label);
      b.onclick = h.action.run;
      line.append(' ', b);
    }
    return line;
  }

  function statusClass(s) {
    if (/^new$/i.test(s)) return 'new';
    if (/waiting|escalat/i.test(s)) return 'waiting';
    if (/progress|dispatch|scheduled/i.test(s)) return 'progress';
    return '';
  }

  // Autotask's colours are picked for a white page: dark ones are lightened until they read on this
  // dark window (4.5:1, the contrast for normal text)
  const readableCache = new Map();
  function readableColor(c) {
    if (!c) return null;
    if (readableCache.has(c)) return readableCache.get(c);
    const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
    let out = null;
    if (m && !(m[4] != null && +m[4] === 0)) {
      let [r, g, b] = [+m[1], +m[2], +m[3]];
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const lum = (x, y, z) => 0.2126 * lin(x) + 0.7152 * lin(y) + 0.0722 * lin(z);
      const bg = lum(0x1e, 0x1f, 0x22);
      for (let i = 0; i < 20 && (lum(r, g, b) + 0.05) / (bg + 0.05) < 4.5; i++) {
        r += (255 - r) * 0.15; g += (255 - g) * 0.15; b += (255 - b) * 0.15;
      }
      out = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
    readableCache.set(c, out);
    return out;
  }
  const statusColor = s => readableColor(get(K.statusColors, {})[clean(s).toLowerCase()]);
  function statusWord(s) {
    const w = el('span', 'atqm-st', s);
    const c = statusColor(s);
    if (c) w.style.color = c;
    return w;
  }
  // A priority in its Autotask colour. Before that's been read off the grid, high ones are picked out in red.
  const isHighPriority = p => /high|critical|urgent/i.test(p || '');
  function priorityWord(p) {
    const color = readableColor(get(K.priorityColors, {})[clean(p).toLowerCase()]);
    const w = el('span', !color && isHighPriority(p) ? 'atqm-pri hi' : 'atqm-pri', p);
    if (color) w.style.color = color;
    return w;
  }
  // Status and priority, each in its Autotask colour, for any ticket row
  function ticketMeta(t, { status = true } = {}) {
    const meta = el('span', 'atqm-meta');
    if (status && t.status) meta.append(statusWord(t.status));
    if (t.priority) meta.append(priorityWord(t.priority));
    return meta;
  }

  function statusChip(s, n) {
    const c = chip(s, n, statusClass(s));
    const color = statusColor(s);
    if (color) c.style.borderLeftColor = color;
    return c;
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

  // A queue's tickets as a list. Built once per saved snapshot (get() hands back the same object until
  // the snapshot changes), so callers must not change the list or its items.
  const snapLists = new WeakMap();
  function snapTickets(q) {
    const snap = readSnap(q);
    if (!snap) return null;
    let list = snapLists.get(snap);
    if (!list) {
      list = Object.entries(snap).map(([id, t]) => ({ id, ...t }));
      const ids = list.map(t => t.tid).filter(Boolean);
      for (const t of list) t.ids = ids;
      snapLists.set(snap, list);
    }
    return list;
  }

  // Every tracked ticket by number, rebuilt only when a queue's list changes
  let indexCache = { lists: [], map: {} };
  function ticketIndex() {
    const lists = trackedQueues().map(snapTickets);
    if (lists.length === indexCache.lists.length && lists.every((l, i) => l === indexCache.lists[i])) return indexCache.map;
    const map = {};
    for (const l of lists) for (const t of l || []) map[t.id] = t;
    indexCache = { lists, map };
    return map;
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
      li.append(document.createElement('br'), ticketMeta(t), el('span', 'atqm-sub', subFn(t)));
      list.append(li);
    }
    return list;
  }

  function renderFull(panel, q, opts = {}) {
    if (!opts.compact) sectionHead(panel, qName(q), q.key === 'my' ? q.nav : qWhere(q));
    const tickets = snapTickets(q);
    if (!tickets) {
      panel.append(el('div', 'atqm-empty', `No data yet. Fills in after the first scan of ${qWhere(q)}.`));
      return;
    }

    if (CONFIG.showStatusCounts && !opts.compact) {
      const counts = new Map();
      for (const t of tickets) counts.set(t.status || 'Unknown', (counts.get(t.status || 'Unknown') || 0) + 1);
      const chips = el('div', 'atqm-chips');
      for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) chips.append(statusChip(s, n));
      const high = tickets.filter(t => /high|critical|urgent/i.test(t.priority || '')).length;
      if (high) chips.append(chip('High priority', high, 'high'));
      panel.append(chips);
    }

    panel.append(el('div', 'atqm-h', 'Next SLA events'));
    const upcoming = tickets.filter(t => t.due && !resting(t)).sort((a, b) => a.due - b.due).slice(0, CONFIG.upcomingCount);
    panel.append(dueList(upcoming, 'due', CONFIG.dueSoonMinutes,
      t => [t.slaEvent, t.title].filter(Boolean).join(': '), 'No SLA deadlines in this queue.'));
    restingNote(panel, tickets);

    const recent = get(K.alerts, []).filter(a => a.q === q.key).slice(-3).reverse();
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

    const live = tickets.filter(t => !resting(t));
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
      li.append(document.createElement('br'), ticketMeta(t), el('span', 'atqm-sub', [t.account, t.title].filter(Boolean).join(': ')));
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

  // Tickets resting in a status that doesn't need action: listed, not chased
  function restingNote(panel, tickets) {
    const rest = tickets.filter(resting);
    if (!rest.length) return;
    panel.append(el('div', 'atqm-h', `No action needed (${rest.length})`));
    const list = el('ul', 'atqm-list');
    for (const t of rest.slice(0, CONFIG.upcomingCount)) {
      const li = el('li', 'paused');
      li.append(ticketLink(t.id, t), ' ', ticketMeta(t));
      li.append(document.createElement('br'), el('span', 'atqm-sub', [t.account, t.title].filter(Boolean).join(': ')));
      list.append(li);
    }
    if (rest.length > CONFIG.upcomingCount) list.append(el('li', 'atqm-empty', `…and ${rest.length - CONFIG.upcomingCount} more`));
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
    const endOfDay = new Date(Date.now()).setHours(23, 59, 59, 999);
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
    const startOfDay = new Date(Date.now()).setHours(0, 0, 0, 0);
    const endOfDay = new Date(Date.now()).setHours(23, 59, 59, 999);
    const today = get(K.alerts, []).filter(a => a.q === q.key && a.ts >= startOfDay);
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

    const live = items.filter(t => !resting(t));
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
    const restCount = items.filter(resting).length;
    return [
      stat('Tickets', items.length),
      stat('SLA breached', breached, breached ? 'overdue' : ''),
      stat(`SLA due < ${dur(CONFIG.dueSoonMinutes * 60000)}`, soon, soon ? 'soon' : ''),
      stat('No action needed', restCount, '', restCount ? 'in a status that needs nothing yet' : ''),
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
    for (const [st, n] of [...counts].sort((a, b) => b[1] - a[1])) chips.append(statusChip(st, n));
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
    const line = healthLine(h);
    line.className = 'lv-health ' + h.cls;
    box.append(title, line);
    lockNotes(box);
    box.append(why);

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
    const changes = get(K.alerts, []).filter(a => a.q === q.key).slice(-15).reverse();
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

  // Warnings for the locked views: problems with the monitor as a whole, and sound needing a click
  function lockNotes(box) {
    for (const w of globalWarnings()) box.append(el('div', 'lv-health warn', w));
    if (CONFIG.sound && !canPlay()) {
      box.append(el('div', 'lv-health warn', 'Click anywhere in this window once to allow sound alerts. ' +
        'Browsers only play sound in a page that has been clicked.'));
    }
  }

  // The locked one-tab monitor: each queue it checks, then Next up across all of them
  function renderRoundsView(box) {
    const scroll = box.scrollTop;
    box.replaceChildren();
    const r = get(K.rotator, null);
    const n = r && Date.now() - r.ts < staleMs() ? (r.queues || []).length : 0;
    const title = el('div', 'lv-title');
    title.append(el('b', null, 'Queue monitor'),
      el('span', null, n ? `Checking ${n} queue${n === 1 ? '' : 's'} in turn` : 'Starting…'),
      el('span', 'lv-mode', 'One tab for all queues'));
    box.append(title);
    for (const q of activeQueues()) {
      const h = health(q);
      const line = healthLine(h, qName(q) + ': ');
      line.className = 'lv-health ' + h.cls;
      box.append(line);
    }
    lockNotes(box);
    const why = el('div', 'lv-why');
    why.append(el('b', null, 'Page locked to keep monitoring running.'),
      " This tab switches between your queues by itself to check each one, so it's greyed out. Use ",
      el('b', null, 'Unlock for 5 min'), ' if you need it.');
    box.append(why);
    const next = el('div');
    renderNextUp(next, nextUpItems());
    box.append(next);
    const foot = el('div', 'lv-foot');
    const scan = el('button', null, 'Scan now');
    scan.onclick = requestScan;
    foot.append(el('span', null, 'Keep this tab open: it checks every tracked queue in turn and feeds the Queue monitor in your other tabs.'), scan);
    box.append(foot);
    box.scrollTop = scroll;
  }

  const BLOCKED = 'Your browser blocked the monitoring tab. Allow pop-ups for autotask.net and try again, or monitor in this tab.';

  // Page-specific banner: what this tab is doing with the queue it shows
  function renderPageBanner(box, pg) {
    box.replaceChildren();
    box.className = '';
    if (!pg.cur) { box.hidden = true; return; }
    box.hidden = false;
    const where = pg.cur.section ? `${pg.cur.section} > ${pg.cur.nav}` : pg.cur.nav;
    if (rotationTab()) {
      box.className = 'here';
      box.append(el('b', null, 'This tab monitors all your queues.'), ' It switches between them by itself, so keep it open.');
      return;
    }

    if (pg.q) {
      const enabled = get(K.enabled, false);
      const takeHere = note => {
        if (pg.remote) postToFrame(pg.remote, { atqm: 'takeover', qKey: pg.q.key });
        else takeOver(pg.q);
        pageCache.t = 0;
        flashNote(note, 2500);
      };
      const going = launchKey();
      if (going && going !== pg.q.key && !pg.owns) {
        const target = trackedQueues().find(x => x.key === going);
        box.className = 'here';
        box.append(el('b', null, `Opening ${target ? qName(target) : 'its queue'} in this tab…`));
      } else if (pg.owns) {
        box.className = 'here';
        box.append(el('b', null, `This tab is monitoring ${qName(pg.q)}.`), ' Keep it open.');
      } else if (pg.foreign) {
        box.className = 'elsewhere';
        box.append(el('b', null, `${qName(pg.q)} is already tracked in another tab.`), ' This tab only shows the overview.');
        const btns = el('div', 'atqm-start');
        const b = el('button', null, 'Swap monitoring to this tab');
        b.title = 'Monitor from here instead; the other tab stops';
        b.onclick = () => takeHere('Swapping monitoring to this tab…');
        btns.append(b);
        box.append(btns);
      } else if (enabled && !pg.choose) {
        box.className = 'here';
        box.append(el('b', null, `${qName(pg.q)} is tracked.`), ' Starting monitoring in this tab…');
      } else if (enabled && CONFIG.oneTab && rotatorAlive()) {
        box.className = 'here';
        box.append(el('b', null, `Your monitoring tab will check ${qName(pg.q)} on its next round.`), ' This tab stays free to use.');
        const btns = el('div', 'atqm-start');
        const here = el('button', null, 'Monitor in this tab instead');
        here.onclick = () => takeHere('Starting monitoring in this tab…');
        btns.append(here);
        box.append(btns);
      } else if (enabled && monitorPending(pg.q)) {
        box.className = 'here';
        box.append(el('b', null, CONFIG.oneTab ? 'Opening the tab that monitors all your queues…' : `Opening a tab to monitor ${qName(pg.q)}…`),
          ' This tab stays free to use.');
        const btns = el('div', 'atqm-start');
        const here = el('button', null, 'Monitor in this tab instead');
        here.onclick = () => takeHere('Starting monitoring in this tab…');
        btns.append(here);
        box.append(btns);
      } else {
        // Nobody monitors it and this is an ordinary tab: ask rather than take it over
        box.className = 'untracked';
        box.append(el('b', null, `Nobody is monitoring ${qName(pg.q)}.`), enabled ? '' : ' Monitoring is paused.');
        const btns = el('div', 'atqm-start');
        const sep = el('button', null, CONFIG.oneTab ? 'Open the monitoring tab' : 'Open a separate monitoring tab');
        sep.title = CONFIG.oneTab
          ? 'Recommended: one tab checks all your queues in turn while you keep working here'
          : 'Recommended: a tab of its own stays on this queue while you keep working here';
        sep.onclick = () => {
          if (!get(K.enabled, false)) set(K.enabled, true);
          if (monitorElsewhere(pg.q, pg.url) === 'blocked') flashNote(BLOCKED, 10000);
          else render();
        };
        const here = el('button', null, CONFIG.lockMonitorTabs ? 'Monitor in this tab (it will be locked)' : 'Monitor in this tab');
        here.title = 'This tab keeps the queue up to date, so it has to stay on this queue';
        here.onclick = () => takeHere('Starting monitoring in this tab…');
        btns.append(sep, here);
        box.append(btns);
      }
      return;
    }

    if (pg.isCalls && !CONFIG.serviceCalls) {
      box.className = 'elsewhere';
      box.append(el('b', null, 'Service calls page.'), ' Turn on Service calls in Settings to track it.');
      const btns = el('div', 'atqm-start');
      const open = el('button', null, 'Open Settings');
      open.onclick = () => openSettings('serviceCalls');
      btns.append(open);
      box.append(btns);
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
        // The new tab opens from here, the page the button is on, even when the queue is in a frame
        const result = startTracking(pg.cur, mode, pg.url);
        pageCache.t = 0;
        flashNote(`Tracking ${pg.cur.nav}. ` + ({
          opened: 'Opening a tab to monitor it…',
          running: 'Your monitoring tab picks it up on its next round.',
          blocked: BLOCKED,
        })[result], result === 'blocked' ? 10000 : 5000);
      };
      btns.append(b);
    }
    box.append(btns);
  }

  // ---------------------------------------------------------------------------
  // Next up: your next move, worked out from every queue you track and your settings (how each queue
  // is tracked, the "due soon" thresholds, statuses that pause the SLA, service calls). Most urgent
  // first; each ticket appears once, in its most urgent group. The change history sits underneath.
  // ---------------------------------------------------------------------------
  const NEXT_GROUPS = [
    ['now', 'Service call now'],
    ['doing', 'In progress'],
    ['breached', 'Overdue'],
    ['soon', 'Due soon'],
    ['waiting', 'Waiting for you'],
    ['later', 'Coming up'],
    ['calls', 'Service calls later today'],
  ];
  const URGENT_GROUPS = new Set(['now', 'doing', 'breached', 'soon', 'waiting']);
  const isInProgress = t => /^in progress$/i.test(clean(t.status));
  const ageOf = t => t.created || t.firstSeen;
  const urgentCount = items => items.filter(it => URGENT_GROUPS.has(it.g)).length;

  // Unread changes per ticket, oldest first
  function unreadByTicket() {
    const map = new Map();
    for (const a of get(K.alerts, [])) {
      if (a.read || !a.ticket) continue;
      if (!map.has(a.ticket)) map.set(a.ticket, []);
      map.get(a.ticket).push(a);
    }
    return map;
  }
  // "Waiting Customer → Customer Note Added" (changes saved before 0.9 only have the full text)
  const changeText = a => (a.to != null ? `${a.from || '?'} → ${a.to || '?'}` : a.text.split(': ').pop());
  const statusPair = a => (a.to != null ? [a.from, a.to] : a.text.split(': ').pop().split(' → '));

  function seenButton(t) {
    const seen = el('button', 'atqm-seen', 'Seen');
    seen.title = 'Mark the changes to this ticket as read';
    seen.setAttribute('aria-label', `Mark the changes to ${t.id} as read`);
    seen.onclick = () => { markTicketRead(t.id); render(); };
    return seen;
  }

  function markTicketRead(id) {
    set(K.alerts, get(K.alerts, []).map(a => (a.ticket === id && !a.read ? { ...a, read: true } : a)));
  }

  // Opening a ticket counts as seeing its changes, without pressing Seen. While a ticket's page is open
  // and in view its changes are marked read, and a status change the monitor notices meanwhile arrives
  // already read (see statusAlert).
  const VIEW_BEAT = 10000;
  function openTicketId() {
    for (const bar of document.querySelectorAll(AT.sel.ticketTitle)) {
      if (bar.closest('#atqm') || !AT.text.ticketTitle.test(clean(bar.querySelector(AT.sel.ticketTitleKind)?.textContent || ''))) continue;
      const m = bar.textContent.match(TICKET_RE);
      if (m) return m[0];
    }
    return null;
  }
  function noteOpenTicket() {
    if (document.visibilityState === 'hidden' || macroPage()) return; // a macro opening it isn't you looking
    const id = openTicketId();
    if (!id) return;
    const now = Date.now(), viewed = {};
    for (const [k, ts] of Object.entries(get(K.viewed, {}))) if (now - ts < 86400000) viewed[k] = ts;
    viewed[id] = now;
    set(K.viewed, viewed);
    if (get(K.alerts, []).some(a => a.ticket === id && !a.read)) markTicketRead(id);
  }
  const viewingNow = id => Date.now() - (get(K.viewed, {})[id] || 0) < 3 * VIEW_BEAT;

  // A ticket's earliest deadline: first response SLA, another SLA (queues tracked for all changes), or the
  // response target for a ticket in New without a first response SLA. Resting tickets have none, unless
  // `all` (the dashboard's ticket table shows them, without asking for action).
  function ticketDeadline(t, q, { all = false } = {}) {
    if (!all && resting(t)) return null;
    const options = [];
    if (t.frDue) options.push({ due: t.frDue, soon: CONFIG.frSoonMinutes, what: 'First response' });
    if (q.mode === 'full' && t.due && t.due !== t.frDue) options.push({ due: t.due, soon: CONFIG.dueSoonMinutes, what: t.slaEvent || 'SLA' });
    if (targetDue(t)) options.push({ due: targetDue(t), soon: CONFIG.frSoonMinutes, what: 'Response target' });
    return options.length ? options.sort((a, b) => a.due - b.due)[0] : null;
  }
  const isChange = a => a.type === 'status' || a.type === 'action';

  function nextUpItems() {
    const now = Date.now(), endOfDay = new Date(Date.now()).setHours(23, 59, 59, 999);
    const qs = activeQueues();
    const ticketQs = qs.filter(q => q.mode !== 'calls');
    const unread = unreadByTicket();
    const groups = Object.fromEntries(NEXT_GROUPS.map(([g]) => [g, []]));
    const taken = new Set();
    const deadlineOf = new Map(); // ticket id -> its deadline, shown on tickets listed for another reason
    const add = (g, item) => {
      if (taken.has(item.t.id)) return;
      taken.add(item.t.id);
      groups[g].push({ g, ...item, dl: deadlineOf.get(item.t.id) || null, changes: unread.get(item.t.id) || [] });
    };

    // Service calls are appointments: one that has started is what you should be doing now; the rest
    // of today's sit at the end with their start times (reminders handle the lead-up)
    for (const q of qs.filter(x => x.mode === 'calls')) {
      for (const c of snapTickets(q) || []) {
        if (!c.start || !(c.end > now)) continue;
        if (c.start <= now) groups.now.push({ g: 'now', kind: 'call', c, q });
        else if (c.start <= endOfDay) groups.calls.push({ g: 'calls', kind: 'call', c, q });
      }
    }
    groups.now.sort((a, b) => a.c.start - b.c.start);
    groups.calls.sort((a, b) => a.c.start - b.c.start);

    // Deadlines: first responses in every ticket queue, other SLAs in queues tracked for all changes.
    // Tickets in a status that pauses the SLA have none.
    const deadlines = [];
    for (const q of ticketQs) {
      for (const t of snapTickets(q) || []) {
        if (deadlineOf.has(t.id)) continue;
        const next = ticketDeadline(t, q);
        if (!next) continue;
        const d = { t, q, ...next };
        deadlines.push(d);
        deadlineOf.set(t.id, d);
      }
    }
    deadlines.sort((a, b) => a.due - b.due);

    // In progress in your own queues (tracked for all changes): what you're doing, so it comes first.
    // Soonest deadline first, then oldest. (In a shared queue, In Progress is someone else's work.)
    const doing = [];
    for (const q of ticketQs.filter(x => x.mode === 'full')) {
      for (const t of snapTickets(q) || []) if (isInProgress(t) && !resting(t)) doing.push({ t, q, age: ageOf(t) });
    }
    const dueBy = x => deadlineOf.get(x.t.id)?.due ?? Infinity;
    doing.sort((a, b) => dueBy(a) - dueBy(b) || a.age - b.age).forEach(x => {
      const d = deadlineOf.get(x.t.id);
      add('doing', d ? { ...x, due: d.due, soon: d.soon, what: d.what } : x);
    });

    // Then by deadline: anything overdue or due soon
    for (const d of deadlines) {
      const state = dueState(d.due, d.soon);
      if (state === 'overdue') add('breached', d);
      else if (state === 'soon') add('soon', d);
    }

    // Then everything else that needs you: every ticket in your own queues that needs action, new tickets
    // in shared queues, and shared-queue tickets that changed back into needing action since you last
    // looked. Deadlines (SLAs and response targets) first, soonest first; then the rest, oldest first.
    const waiting = [];
    for (const q of ticketQs) {
      for (const t of snapTickets(q) || []) {
        if (resting(t)) continue;
        const mine = q.mode === 'full' || /^new$/i.test(t.status || '') || (unread.get(t.id) || []).some(isChange);
        if (mine) waiting.push({ t, q, age: ageOf(t) });
      }
    }
    waiting.sort((a, b) => dueBy(a) - dueBy(b) || a.age - b.age).forEach(x => add('waiting', x));

    // Everything else with a deadline, soonest first
    for (const d of deadlines) add('later', d);

    return NEXT_GROUPS.flatMap(([g]) => groups[g]);
  }

  // One line for the minimised window: the move at the top of Next up
  function nextSummary(it) {
    if (it.kind === 'call') return `Service call now: ${callLabel(it.c)}`;
    const now = Date.now();
    if (it.due) return `${it.what} ${it.due < now ? `${dur(now - it.due)} overdue` : `in ${dur(it.due - now)}`}: ${it.t.id}`;
    if (it.g === 'doing') return `In progress: ${it.t.id}`;
    return `Waiting ${dur(now - it.age)}: ${it.t.id}`;
  }

  function nextUpRow(it, showQueue) {
    const t = it.t, now = Date.now();
    const li = el('li', it.due ? dueState(it.due, it.soon) : it.g === 'doing' ? 'doing' : 'new');
    li.title = [qWhere(it.q), t.account, t.priority, t.status].filter(Boolean).join(' | ');
    if (it.due) {
      li.append(el('span', 'atqm-when', it.due < now ? `${dur(now - it.due)} overdue` : `in ${dur(it.due - now)}`),
                el('span', 'atqm-at', `(${dueAt(it.due)})`));
    } else {
      li.append(el('span', 'atqm-when', it.g === 'doing' ? 'in progress' : `waiting ${dur(now - it.age)}`));
    }
    li.append(ticketLink(t.id, t));
    if (it.changes.length) li.append(seenButton(t));
    li.append(document.createElement('br'));
    if (showQueue) li.append(el('span', 'atqm-tag', qName(it.q)));
    const status = it.changes.filter(isChange).pop();
    if (status) {
      const [from, to] = statusPair(status);
      const tag = el('span', 'atqm-tag atqm-chg');
      tag.append(statusWord(from || '?'), ' → ', statusWord(to || '?'));
      li.append(tag);
    }
    li.append(ticketMeta(t, { status: !status }));
    // The deadline this row is about, or for a ticket listed for another reason, when its deadline falls
    const deadline = it.due ? it.what
      : it.dl ? `${it.dl.what} ${it.dl.due < now ? `${dur(now - it.dl.due)} overdue` : `in ${dur(it.dl.due - now)}`}` : '';
    li.append(el('span', 'atqm-sub', [deadline, t.account, t.title].filter(Boolean).join(': ')));
    return li;
  }

  // Which queues and settings the list comes from, so it's clear why something is (or isn't) there
  function renderBasedOn(panel, qs) {
    const line = el('div', 'atqm-chips atqm-basis');
    line.append(el('span', 'atqm-sub', 'Watching'));
    for (const q of qs) {
      const h = health(q);
      const scanned = !!snapTickets(q);
      const c = el('span', 'atqm-chip ' + (scanned && h.cls === 'ok' ? 'ok' : 'warn'), qName(q) + (scanned ? '' : ' (no scan yet)'));
      c.title = `${MODES[q.mode].label}: ${MODES[q.mode].hint}. ${h.text}`;
      line.append(c);
    }
    panel.append(line);
    const hint = basisHint(qs);
    if (hint) panel.append(el('div', 'atqm-hint atqm-basis-hint', hint));
  }
  // The settings that decide what's due soon
  function basisHint(qs) {
    const ticketQs = qs.filter(q => q.mode !== 'calls');
    if (!ticketQs.length) return '';
    const soon = [`first responses within ${dur(CONFIG.frSoonMinutes * 60000)}`];
    if (ticketQs.some(q => q.mode === 'full')) soon.push(`SLAs within ${dur(CONFIG.dueSoonMinutes * 60000)}`);
    const parts = [`Due soon: ${soon.join(', ')}.`];
    if (CONFIG.responseTarget > 0) parts.push(`No SLA: respond within ${dur(CONFIG.responseTarget * 60000)}.`);
    return parts.join(' ');
  }

  function renderNextUp(panel, items = nextUpItems(), { history = true, cap = 0 } = {}) {
    const qs = activeQueues();
    if (!qs.length) {
      panel.append(el('div', 'atqm-empty', 'No queues tracked. Open a queue in My Workspace & Queues and press Start tracking.'));
      if (history) renderRecentChanges(panel);
      return;
    }
    renderBasedOn(panel, qs);
    if (!urgentCount(items)) panel.append(el('div', 'atqm-empty', 'All clear. Nothing needs action right now.'));
    if (items.length) {
      const list = el('ol', 'atqm-list atqm-next');
      for (const [g, title] of NEXT_GROUPS) {
        const group = items.filter(it => it.g === g);
        if (!group.length) continue;
        list.append(el('li', 'atqm-next-h', title));
        const n = cap || (g === 'later' ? CONFIG.upcomingCount : Math.max(CONFIG.upcomingCount, 8));
        for (const it of group.slice(0, n)) list.append(it.kind === 'call' ? callRow(it.c) : nextUpRow(it, qs.length > 1));
        if (group.length > n) list.append(el('li', 'atqm-next-h atqm-next-more', `…and ${group.length - n} more`));
      }
      panel.append(list);
    }
    if (history) renderRecentChanges(panel);
  }

  // The change history, under the moves: newest first, unread highlighted
  let showAllChanges = false;
  function renderRecentChanges(panel) {
    const all = get(K.alerts, []);
    const unread = all.filter(a => !a.read).length;
    sectionHead(panel, 'Recent changes', unread ? `${unread} unread` : '');
    if (!all.length) {
      panel.append(el('div', 'atqm-empty', 'No changes since monitoring started.'));
      return;
    }
    const n = showAllChanges ? CONFIG.displayAlerts : 8;
    panel.append(alertList(all.slice(-n).reverse()));
    if (!showAllChanges && all.length > n) {
      const more = el('button', 'atqm-more', `Show more (up to ${Math.min(all.length, CONFIG.displayAlerts)})`);
      more.onclick = () => { showAllChanges = true; render(); };
      panel.append(more);
    }
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

  // A change's text, with ticket numbers as links and statuses in their Autotask colours
  function alertText(a, urlFor) {
    const frag = document.createDocumentFragment();
    const cut = a.text.lastIndexOf(': ');
    const pair = (a.type === 'status' || a.type === 'action') && a.ticket && cut > 0 ? statusPair(a) : null;
    if (pair && pair.length === 2) {
      if (a.type === 'action') frag.append(el('span', 'atqm-tag atqm-acttag', 'Needs action'));
      frag.append(linkify(a.text.slice(0, cut + 2), urlFor), statusWord(pair[0] || '?'), ' → ', statusWord(pair[1] || '?'));
    } else if (a.type === 'new' && a.status && a.text.endsWith(`[${a.status}]`)) {
      frag.append(linkify(a.text.slice(0, -(a.status.length + 2)), urlFor), '[', statusWord(a.status), ']');
    } else {
      frag.append(linkify(a.text, urlFor));
    }
    return frag;
  }

  function alertList(alerts, showTags = true) {
    const list = el('ul', 'atqm-list');
    const snaps = ticketIndex();
    for (const a of alerts) {
      const li = el('li', a.type + (a.read ? '' : ' unread'));
      const urlFor = id => snaps[id] || (id === a.ticket ? a : null);
      li.append(el('time', null, fmtTime(a.ts)));
      if (showTags && a.q !== 'my') li.append(el('span', 'atqm-tag', a.qn || a.q));
      li.append(alertText(a, urlFor));
      if (a.callUrl) {
        const link = callLink({ url: a.callUrl, id: a.call }, 'Open call');
        li.append(' ', link);
      }
      list.append(li);
    }
    return list;
  }

  const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return null; } })();
  const PC_ZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
  const ZONE_HINT = 'The time zone set in your Autotask profile. Only change this if it differs from this PC, ' +
    'otherwise due times are off by the difference.';

  // Settings, in the order and sections the Settings window shows them (group: a section heading)
  const FIELDS = [
    { group: 'Deadlines and statuses', id: 'deadlines', icon: 'clock',
      desc: 'When a ticket counts as due soon, and which statuses need you.' },
    { key: 'dueSoonMinutes', label: 'Warn when an SLA is due within', unit: 'min', type: 'number', min: 5, max: 1440, step: 5,
      hint: 'Queues tracked for all changes.' },
    { key: 'frSoonMinutes', label: 'Warn when a first response is due within', unit: 'min', type: 'number', min: 5, max: 240, step: 5,
      hint: 'Queues tracked for new tickets & first response.' },
    { key: 'responseTarget', label: 'Respond to tickets without an SLA within', unit: 'min', type: 'number', min: 0, max: 480, step: 5,
      hint: 'Tickets in New status with no first response SLA get this as a target, so they sit next to your SLAs in Next up ' +
        'and the dashboard, with an alert when it passes. 0 turns it off.' },
    { key: 'actionStatuses', label: 'Statuses that need action', type: 'text', chips: true,
      sanitize: v => String(v).split(',').map(clean).filter(Boolean).join(', '),
      hint: "Comma-separated. Tickets in any other status stay visible but don't ask for action: no deadlines in Next up and " +
        'no SLA warnings. You get an alert when one moves into one of these. Leave empty to treat every status as needing action.' },
    { group: 'Alerts', id: 'alerts', icon: 'bell', desc: 'How the monitor gets your attention, and how much it remembers.' },
    { key: 'notify', label: 'Desktop notifications', type: 'checkbox' },
    { key: 'sound', label: 'Sound on new alerts', type: 'checkbox' },
    { key: 'maxAlerts', label: 'Changes kept in history', type: 'number', min: 20, max: 1000, step: 10 },
    { group: 'Service calls', id: 'calls', icon: 'phone', desc: 'Your scheduled calls in My Workspace, with reminders before each one.' },
    { key: 'serviceCalls', label: 'Service calls', type: 'checkbox',
      hint: 'Lets you track My Workspace > Service Calls. Your calls then appear in Overview and Next up.' },
    { key: 'callRefreshMs', label: 'Refresh service calls every', unit: 'min', type: 'number', min: 1, max: 120, step: 1,
      toUi: v => v / 60000, fromUi: v => Math.round(v * 60000),
      hint: 'Calls change less often than queues, so they can be checked less often. Reminders still go off on time: ' +
        'they work from the calls already found.' },
    { key: 'callReminders', label: 'Call reminders', type: 'checkbox',
      hint: 'Pings before a call starts, with a Dismiss button in the Queue monitor window.' },
    { key: 'callLeadTimes', label: 'Remind before start', unit: 'min', type: 'text',
      sanitize: v => {
        const n = [...new Set(String(v).split(/[^\d]+/).filter(Boolean).map(Number).filter(x => x >= 0 && x <= 240))].sort((a, b) => b - a);
        return n.length ? n.join(', ') : DEFAULTS.callLeadTimes;
      },
      hint: 'Comma-separated minutes, e.g. 15, 10, 5, 0.' },
    { key: 'callPingAfterStart', label: 'Keep pinging after the call starts', type: 'checkbox',
      hint: 'Every minute until you press Dismiss or the call ends.' },
    { group: 'Monitoring', id: 'monitoring', icon: 'refresh', desc: 'How the monitoring tabs keep your queues up to date.' },
    { key: 'refreshMs', label: 'Refresh queues every', unit: 'min', type: 'number', min: 0.5, max: 60, step: 0.5,
      toUi: v => v / 60000, fromUi: v => Math.round(v * 60000),
      hint: 'Browsers may slow background tabs to about one refresh a minute. Service calls have their own setting, under Service calls.' },
    { key: 'oneTab', label: 'Monitor all queues from one tab', type: 'checkbox',
      hint: 'Quick start and Start tracking open a single monitoring tab that switches between all your tracked queues, ' +
        "instead of a tab per queue. Use it if your browser blocks Quick start's extra tabs. Each queue is still checked about once per refresh." },
    { key: 'lockMonitorTabs', label: 'Lock monitoring tabs', type: 'checkbox',
      hint: "A tab that's monitoring a queue shows the Queue monitor window large in the middle and greys out the page, so it can't be changed by accident. Automatic refreshes still work. You can unlock it for 5 minutes from that window." },
    { key: 'autoColumns', label: 'Add missing columns automatically', type: 'checkbox',
      hint: "Uses the grid's Column Chooser to add columns the monitor needs, like Ticket Number or Next SLA Event Due. " +
        'This changes your saved view for that grid. When off, the monitor shows an "Add missing columns" button instead.' },
    { key: 'autoPageSize', label: 'Show the most rows per page automatically', type: 'checkbox',
      hint: 'Switches the grid to its largest page size so tickets past the first page are monitored too. ' +
        'This changes your saved view for that grid. When off, the monitor offers a button when rows are missing.' },
    { group: 'Window and display', id: 'window', icon: 'layout', desc: 'How the Queue monitor window and the dashboard look.' },
    { key: 'dashboard', label: 'Dashboard button', type: 'checkbox',
      hint: "Adds a ⛶ button at the top of the Queue monitor window that opens a dashboard over the page, below Autotask's top bar: the numbers that matter, " +
        'what to do next, deadlines over the next 8 hours, every queue and recent changes. Esc closes it.' },
    { key: 'showWindow', label: 'Queue monitor window', type: 'checkbox',
      hint: "Turn off to hide the window on pages with Autotask's top bar. The Queue monitor menu there opens the dashboard and " +
        'Settings, and brings the window back. Locked monitoring tabs always show it.' },
    { key: 'ticketMacroButton', label: 'Macros button on ticket pop-ups', type: 'checkbox',
      hint: 'The small button in the corner of ticket pop-up windows, for running a macro on that ticket.' },
    { key: 'upcomingCount', label: 'Rows shown in each list', type: 'number', min: 1, max: 20, step: 1 },
    { key: 'showStatusCounts', label: 'Show status counts', type: 'checkbox',
      hint: 'Ticket counts per status at the top of queues tracked for all changes.' },
    { key: 'linkStyle', label: 'Open tickets using', type: 'select',
      options: [['detail', 'Ticket page'], ['command', 'Autotask command link'], ['grid', 'Grid link']],
      hint: 'Ticket page opens the normal ticket tab. The other two tend to pop out into a separate window.' },
    { key: 'opacity', label: 'Opacity when expanded', unit: '%', type: 'number', min: 20, max: 100, step: 5 },
    { key: 'opacityMin', label: 'Opacity when minimised', unit: '%', type: 'number', min: 20, max: 100, step: 5,
      hint: 'The window turns fully opaque while the mouse is over it.' },
    { key: 'hideInPopups', label: 'Hide in ticket pop-up windows', type: 'checkbox', hint: 'Takes effect on the next page load.' },
    { group: 'Dates and times', id: 'dates', icon: 'calendar', desc: 'How to read the dates and times Autotask shows.' },
    { key: 'dateOrder', label: 'Date format in Autotask', type: 'select',
      options: [['auto', 'Detect automatically'], ['DMY', 'Day/month (UK)'], ['MDY', 'Month/day (US)'], ['YMD', 'Year first (2026-10-02)']],
      hint: () => {
        const using = ORDER_NAMES[dateOrder()];
        if (CONFIG.dateOrder !== 'auto') return `Reading dates as ${using}.`;
        return get(K.dateOrder, null)?.order
          ? `Detected from your queues: ${using}.`
          : `Not detected yet, so assuming ${using} from your browser language. A date like 25/10 settles it.`;
      } },
    ZONES
      ? { key: 'timeZone', label: 'Autotask time zone', type: 'select', hint: ZONE_HINT,
        options: [['', `Same as this PC${PC_ZONE ? ` (${PC_ZONE})` : ''}`], ...ZONES.map(z => [z, z])] }
      : { key: 'timeZone', label: 'Autotask time zone', type: 'text', hint: ZONE_HINT + ' Leave empty for the same as this PC.',
        sanitize: v => (clean(v) && validZone(clean(v)) ? clean(v) : '') },
  ];

  // A setting value made safe to use: the right type, within range, and one of the options
  function cleanSetting(f, v) {
    const d = DEFAULTS[f.key];
    if (f.type === 'checkbox') return typeof v === 'boolean' ? v : d;
    if (f.type === 'number') {
      let u = f.toUi ? f.toUi(Number(v)) : Number(v);
      if (!Number.isFinite(u)) return d;
      u = Math.min(f.max, Math.max(f.min, u));
      return f.fromUi ? f.fromUi(u) : u;
    }
    if (f.type === 'select') return f.options.some(([o]) => o === v) ? v : d;
    if (typeof v !== 'string') return d;
    return f.sanitize ? f.sanitize(v) : clean(v) || d;
  }

  // Line icons (24 × 24, drawn with the text colour)
  const ICONS = {
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
  };
  const svgIcon = (name, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  function icon(name, size) {
    const s = el('span', 'atqm-ico');
    s.innerHTML = svgIcon(name, size);
    return s;
  }

  // ---------------------------------------------------------------------------
  // Settings: a window over the whole page, opened from the cog in the Queue monitor window (or the
  // dashboard). Changes wait for Save, so a half-typed number never reaches the monitoring tabs.
  // ---------------------------------------------------------------------------
  const SET_ID = 'atqm-settings';
  let setForm = null;        // the open form: { dirty, save, refresh, refreshQueues }
  let setReturnFocus = null; // where focus goes back to when it closes
  const settingsOpen = () => !!document.getElementById(SET_ID);

  // Opens the window, or brings it forward; with a setting's key, scrolls to it and points it out. It sits
  // below Autotask's top bar like the dashboard (see placeBelowBar), and over the dashboard when that's open.
  // The Queue monitor window is put away meanwhile: it would float over Settings' own controls.
  function openSettings(focusKey) {
    let d = document.getElementById(SET_ID);
    if (!d) {
      closeMacroWindow(); // it would be left behind Settings
      // A dashboard in full screen would hide it (only the full-screen page shows)
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
      setReturnFocus = document.activeElement;
      d = el('div');
      d.id = SET_ID;
      d.tabIndex = -1;
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-labelledby', 'atqm-set-title');
      d.addEventListener('keydown', e => {
        e.stopPropagation(); // typing here isn't for Autotask's own shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); setForm?.save(); return; }
        if (e.key !== 'Tab') return;
        // Keep Tab inside the window
        const list = [...d.querySelectorAll('button, input, select, textarea, [href]')]
          .filter(x => !x.disabled && x.tabIndex >= 0 && x.getClientRects().length);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === d)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      document.body.append(d);
      document.documentElement.classList.add('atqm-set-open');
      placeSettings(d);
      renderSettings(d);
    }
    const row = focusKey && d.querySelector(`.set-row[data-key="${focusKey}"]`);
    if (!row) { d.focus(); return; }
    d.querySelector('.set-main').scrollTop = Math.max(0, row.offsetTop - 80);
    row.classList.remove('flash');
    void row.offsetWidth; // restart the highlight
    row.classList.add('flash');
    row.querySelector('input, select')?.focus({ preventScroll: true });
  }
  // false if you chose to keep your unsaved changes
  function closeSettings() {
    const d = document.getElementById(SET_ID);
    if (!d) return true;
    if (setForm?.dirty() && !confirm('Close settings without saving your changes?')) return false;
    d.remove();
    document.documentElement.classList.remove('atqm-set-open');
    setForm = null;
    try { if (setReturnFocus?.isConnected) setReturnFocus.focus(); } catch { /* ignore */ }
    setReturnFocus = null;
    return true;
  }

  // Statuses seen in the ticket queues, offered as suggestions for "Statuses that need action"
  function knownStatuses() {
    const seen = new Map();
    for (const q of trackedQueues().filter(x => x.mode !== 'calls')) {
      for (const t of snapTickets(q) || []) {
        const s = clean(t.status);
        if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  // A comma-separated list as removable chips, each in its Autotask colour, with suggestions to add
  function chipEditor(id, onChange, suggest) {
    let list = [];
    const box = el('div', 'set-chips');
    const input = el('input', 'set-chip-in');
    Object.assign(input, { type: 'text', id, placeholder: 'Add a status…', autocomplete: 'off' });
    box.append(input);
    box.onclick = e => { if (e.target === box) input.focus(); };
    const sugg = el('div', 'set-sugg');
    const has = s => list.some(x => same(x, s));
    const add = text => { for (const s of String(text).split(',').map(clean)) if (s && !has(s)) list.push(s); };
    const draw = () => {
      box.querySelectorAll('.set-chip').forEach(c => c.remove());
      for (const s of list) {
        const chip = el('span', 'set-chip');
        const dot = el('i');
        const c = statusColor(s);
        if (c) dot.style.background = c;
        const rm = el('button', null, '×');
        rm.type = 'button';
        rm.title = 'Remove';
        rm.setAttribute('aria-label', `Remove ${s}`);
        rm.onclick = () => { list = list.filter(x => x !== s); draw(); onChange(); input.focus(); };
        chip.append(dot, el('span', null, s), rm);
        box.insertBefore(chip, input);
      }
      const extra = suggest().filter(s => !has(s));
      sugg.replaceChildren();
      sugg.hidden = !extra.length;
      if (extra.length) sugg.append(el('span', null, 'Also in your queues:'));
      for (const s of extra) {
        const b = el('button', null, '+ ' + s);
        b.type = 'button';
        b.title = `Add ${s}`;
        b.onclick = () => { add(s); draw(); onChange(); input.focus(); };
        sugg.append(b);
      }
    };
    const commit = () => {
      if (!clean(input.value)) return;
      add(input.value);
      input.value = '';
      draw();
      onChange();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
      else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); onChange(); }
    });
    input.addEventListener('blur', commit);
    return {
      box, sugg, input,
      read: () => [...list, input.value].join(', '),
      write: v => { list = []; add(v || ''); input.value = ''; draw(); },
    };
  }

  function renderSettings(root, message = '') {
    const keepScroll = root.querySelector('.set-main')?.scrollTop || 0;
    root.replaceChildren();
    const controls = {}; // setting key -> { f, row, read, write, refreshHint }
    let note = '', noteTimer = null;

    const btn = (label, cls, onclick, title) => {
      const b = el('button', 'set-btn' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      if (title) b.title = title;
      b.onclick = onclick;
      return b;
    };

    // Header: title, search and close
    const head = el('header', 'set-head');
    const brand = el('div', 'set-brand');
    const titles = el('div');
    const h1 = el('h1', null, 'Settings');
    h1.id = 'atqm-set-title';
    titles.append(h1, el('div', 'set-sub', `Queue monitor ${VERSION} (beta)`));
    brand.append(icon('cog', 18), titles);
    const find = el('label', 'set-find');
    const search = el('input');
    Object.assign(search, { type: 'search', placeholder: 'Find a setting', autocomplete: 'off' });
    search.setAttribute('aria-label', 'Find a setting');
    find.append(icon('search', 14), search);
    const x = el('button', 'set-x');
    x.type = 'button';
    x.title = 'Close (Esc)';
    x.setAttribute('aria-label', 'Close settings');
    x.append(icon('x', 18));
    x.onclick = () => closeSettings();
    // Back to the dashboard: the one Settings was opened over, or opened now (with the Dashboard button setting on)
    const overDash = !!document.getElementById('atqm-dash');
    const toDash = btn(overDash ? 'Back to dashboard' : 'Dashboard', '', () => {
      if (!closeSettings()) return; // kept open, with your unsaved changes
      if (!document.getElementById('atqm-dash')) openDashboard();
      else document.getElementById('atqm-dash').focus();
    }, overDash ? 'Close Settings and go back to the dashboard' : 'Close Settings and open the dashboard');
    toDash.prepend(icon('grid', 14));
    toDash.hidden = !isTop || !(overDash || CONFIG.dashboard);
    head.append(brand, find, toDash, x);

    // Sections down the left, settings on the right
    const body = el('div', 'set-body');
    const nav = el('nav', 'set-nav');
    nav.setAttribute('aria-label', 'Settings sections');
    const main = el('div', 'set-main');
    const inner = el('div', 'set-inner');
    main.append(inner);
    body.append(nav, main);

    // Footer: what's unsaved, Discard and Save
    const foot = el('footer', 'set-foot');
    const msg = el('div', 'set-msg');
    msg.setAttribute('role', 'status');
    const discard = btn('Discard', '', () => {
      for (const c of Object.values(controls)) c.write(CONFIG[c.f.key]);
      note = '';
      update();
    }, 'Put back the saved settings');
    const save = btn('Save changes', 'primary', () => doSave(), 'Save (Ctrl+S)');
    foot.append(msg, discard, save);
    root.append(head, body, foot);

    const flash = t => {
      note = t;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { note = ''; update(); }, 5000);
      update();
    };

    const sections = [];
    const cards = {};
    let pinned = 0; // when a section link was pressed (its scroll shouldn't move the highlight)
    const markNav = cur => { for (const s of sections) s.link.setAttribute('aria-current', String(s === cur)); };
    function section(id, title, ico, desc) {
      const sec = el('section', 'set-sec');
      sec.id = 'atqm-set-' + id;
      sec.dataset.find = title.toLowerCase();
      const h = el('div', 'set-sec-h');
      const ht = el('div');
      const h2 = el('h2', null, title);
      h2.id = sec.id + '-h';
      sec.setAttribute('aria-labelledby', h2.id);
      ht.append(h2);
      if (desc) ht.append(el('p', null, desc));
      h.append(icon(ico, 16), ht);
      const card = el('div', 'set-card');
      sec.append(h, card);
      inner.append(sec);
      const link = el('button');
      link.type = 'button';
      link.append(icon(ico, 15), el('span', null, title));
      const s = { id, sec, link };
      link.onclick = () => { pinned = Date.now(); markNav(s); main.scrollTop = Math.max(0, sec.offsetTop - 12); };
      nav.append(link);
      sections.push(s);
      return (cards[id] = card);
    }
    main.addEventListener('scroll', () => {
      if (Date.now() - pinned < 800) return;
      const shown = sections.filter(s => !s.sec.hidden);
      let cur = shown[0];
      for (const s of shown) if (s.sec.offsetTop - main.scrollTop <= 60) cur = s;
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) cur = shown[shown.length - 1];
      markNav(cur);
    }, { passive: true });

    // A row with a label, a hint and buttons
    const actionRow = (label, hint, ...buttons) => {
      const row = el('div', 'set-row');
      row.dataset.find = `${label} ${hint}`.toLowerCase();
      const text = el('div', 'set-text');
      text.append(el('div', 'set-label', label), el('div', 'set-hint', hint));
      const ctl = el('div', 'set-ctl');
      ctl.append(...buttons);
      row.append(text, ctl);
      return row;
    };

    // Quick start, first thing
    const hero = el('div', 'set-hero');
    const drawHero = () => {
      hero.replaceChildren();
      const moving = busyElsewhere().length > 0;
      const text = el('div', 'set-text');
      text.append(el('div', 'set-hero-t', moving ? 'Move queue tabs to this window' : 'Quick start'), el('div', 'set-hint', moving
        ? 'Closes the tabs monitoring your queues and reopens them in this window, so you can minimise it out of the way.'
        : CONFIG.oneTab
          ? 'Opens one tab in this window that monitors all your tracked queues in turn. Press it again later from another window to move it there.'
          : 'Opens a tab for each tracked queue in this window. Press it again later from another window to move them there.'));
      const go = btn(moving ? 'Move tabs here' : 'Open tracked queues', 'primary', () => {
        set(K.qsSnooze, 0);
        quickStart();
        setTimeout(() => { if (go.isConnected) { drawHero(); drawQueues(); } }, 1500);
      });
      go.prepend(icon('zap', 14));
      hero.append(icon('zap', 20), text, go);
    };
    drawHero();
    inner.append(hero);

    // Tracked queues
    const qCard = section('queues', 'Tracked queues', 'list', 'The queues this browser watches, and what it watches them for.');
    function drawQueues() {
      qCard.replaceChildren();
      const qs = trackedQueues();
      for (const q of qs) {
        const h = health(q);
        const row = el('div', 'set-row set-q');
        row.dataset.find = `${qName(q)} ${qWhere(q)} ${MODES[q.mode].label} queue`.toLowerCase();
        const light = el('span', 'atqm-ml ' + h.cls);
        light.title = h.text;
        const text = el('div', 'set-text');
        const name = el('div', 'set-label');
        name.append(el('span', 'atqm-sr', (STATUS_WORDS[h.cls] || '') + ': '), qName(q));
        if (q.key !== 'my' || q.section) name.append(el('span', 'set-where', qWhere(q)));
        text.append(name, el('div', 'set-hint', h.text));
        if (q.mode === 'calls' && !CONFIG.serviceCalls) text.append(el('div', 'set-hint atqm-warn', 'Paused while the Service calls setting is off.'));
        const ctl = el('div', 'set-ctl');
        if (q.mode === 'calls') ctl.append(el('span', 'set-pill', MODES.calls.label));
        else {
          const seg = el('div', 'set-seg');
          seg.setAttribute('role', 'group');
          seg.setAttribute('aria-label', `Tracking for ${qName(q)}`);
          for (const v of ['full', 'intake']) {
            const b = btn(MODES[v].label, '', () => {
              if (q.mode === v) return;
              saveQueues(trackedQueues().map(t => (t.key === q.key ? { ...t, mode: v } : t)));
              [q.snap, q.seen].forEach(del); // fresh baseline for the new style
              drawQueues();
              flash(`${qName(q)}: tracking ${MODES[v].label.toLowerCase()}. It takes a fresh baseline on the next scan.`);
              render();
            }, MODES[v].hint);
            b.className = '';
            b.setAttribute('aria-pressed', String(q.mode === v));
            seg.append(b);
          }
          ctl.append(seg);
        }
        ctl.append(btn('Stop', 'danger', () => {
          if (!confirm(`Stop tracking ${qWhere(q)}? Its tickets are cleared from the overview; past changes stay in history.`)) return;
          stopTracking(q);
          drawQueues();
          flash(`Stopped tracking ${qName(q)}.`);
          render();
        }, 'Stop tracking this queue'));
        row.append(light, text, ctl);
        qCard.append(row);
      }
      if (!qs.length) qCard.append(el('div', 'set-row set-empty', 'No queues tracked yet.'));
      const tip = el('div', 'set-row set-tip');
      tip.dataset.find = 'track another queue start tracking add';
      tip.append(icon('plus', 14), el('span', null, 'To track another queue, open it in My Workspace & Queues and press Start tracking.'));
      qCard.append(tip);
      applyFind();
    }

    // One row per setting
    function fieldRow(f) {
      const id = 'atqm-f-' + f.key;
      const row = el('div', 'set-row' + (f.chips ? ' wide' : ''));
      row.dataset.key = f.key;
      const hintText = () => (typeof f.hint === 'function' ? f.hint() : f.hint) || '';
      row.dataset.find = `${f.label} ${hintText()}`.toLowerCase();
      const text = el('div', 'set-text');
      const lab = el('label', 'set-label', f.label);
      lab.htmlFor = id;
      const hint = el('div', 'set-hint', hintText());
      hint.id = id + '-hint';
      hint.hidden = !hint.textContent;
      text.append(lab, hint);
      const ctl = el('div', 'set-ctl');
      let input, read, write;
      if (f.chips) {
        const c = chipEditor(id, update, knownStatuses);
        ({ input, read, write } = c);
        ctl.append(c.box, c.sugg);
      } else if (f.type === 'select') {
        input = el('select');
        for (const [v, t] of f.options) { const o = el('option', null, t); o.value = v; input.append(o); }
        read = () => input.value;
        write = v => { input.value = v; };
        ctl.append(input);
      } else if (f.type === 'checkbox') {
        input = el('input', 'set-switch');
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        read = () => input.checked;
        write = v => { input.checked = !!v; };
        ctl.append(input);
      } else {
        input = el('input');
        input.type = f.type;
        if (f.type === 'number') Object.assign(input, { min: f.min, max: f.max, step: f.step });
        read = () => {
          if (f.type !== 'number') return input.value;
          const u = parseFloat(input.value);
          return f.fromUi ? f.fromUi(u) : u;
        };
        write = v => { input.value = f.toUi ? f.toUi(v) : v; };
        if (f.unit) { const g = el('span', 'set-num'); g.append(input, el('span', null, f.unit)); ctl.append(g); }
        else ctl.append(input);
      }
      input.id = id;
      if (hint.textContent) input.setAttribute('aria-describedby', hint.id);
      write(CONFIG[f.key]);
      row.append(text, ctl);
      controls[f.key] = { f, row, read, write, refreshHint: () => { hint.textContent = hintText(); hint.hidden = !hint.textContent; } };
      return row;
    }

    let card = null;
    for (const f of FIELDS) {
      if (f.group) card = section(f.id, f.group, f.icon, f.desc);
      else card.append(fieldRow(f));
    }

    if ('Notification' in window && Notification.permission === 'denied') {
      const r = el('div', 'set-row set-alert');
      r.dataset.find = 'desktop notifications blocked';
      r.append(icon('alert', 15), el('span', null, 'Notifications are blocked for this site in your browser settings. ' +
        'Allow them from the icon at the left of the address bar.'));
      cards.alerts.prepend(r);
    }
    cards.alerts.append(actionRow('Test alert', 'Plays the sound and shows a notification, as your saved settings would.',
      btn('Send a test', '', () => {
        notify('Queue monitor', [{ type: 'new', text: 'Test alert from Queue monitor' }]);
        flash(CONFIG.notify || CONFIG.sound ? 'Test alert sent.' : 'Sound and notifications are both off.');
      })));

    // Backup and help
    const bCard = section('backup', 'Backup and help', 'archive', 'Take your setup to another browser, or gather details for a bug report.');
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const text = await f.text();
      file.value = '';
      const result = importSettings(text);
      if (result) { renderSettings(root, result); render(); }
    };
    bCard.append(actionRow('Export and import', 'Your saved settings and tracked queues as a file (no tickets or history), to move them to another browser or PC.',
      btn('Export', '', () => { exportSettings(); flash('Settings exported.'); }, 'Save your settings and tracked queues to a file'),
      btn('Import…', '', () => file.click(), 'Load settings and tracked queues from an exported file')), file);
    const diagOut = el('div', 'set-diag');
    diagOut.hidden = true;
    const diag = btn('Collect', '', async () => {
      diag.disabled = true;
      diagOut.hidden = false;
      diagOut.replaceChildren(el('div', 'set-hint', 'Collecting…'));
      const text = await collectDiagnostics();
      const ta = el('textarea');
      ta.value = text;
      ta.readOnly = true;
      ta.setAttribute('aria-label', 'Diagnostics');
      const copy = btn('Copy diagnostics', 'primary', () => copyText(text).then(ok => flash(ok ? 'Diagnostics copied.' : "Couldn't copy. Select the text and copy it instead.")));
      diagOut.replaceChildren(ta, copy);
      diag.disabled = false;
    }, 'What the monitor can see on this page. No ticket titles or account names.');
    bCard.append(actionRow('Diagnostics', 'What the monitor can see on this page, to paste into a bug report. Never ticket titles or account names.', diag), diagOut);
    bCard.append(actionRow('Reset to defaults', 'Puts every setting back as it was when you installed. Tracked queues and history are kept.',
      btn('Reset', 'danger', () => {
        if (!confirm('Reset monitor settings to their defaults? Your tracked queues are kept.')) return;
        del(K.settings);
        loadSettings();
        reschedule();
        renderSettings(root, 'Settings reset to defaults.');
        render();
      })));
    const fine = el('div', 'set-row set-fine', 'Settings and history are stored in this browser only. Clearing site data for autotask.net, ' +
      'resetting the browser profile, or using another browser or PC starts fresh (use Export to take your settings along).');
    fine.dataset.find = 'storage browser stored';
    bCard.append(fine);

    const none = el('div', 'set-none');
    none.hidden = true;
    inner.append(none);

    // Search: rows whose label or hint match, or every row of a section whose name matches
    function applyFind() {
      const term = clean(search.value).toLowerCase();
      hero.hidden = !!term;
      let any = false;
      for (const s of sections) {
        const whole = !term || s.sec.dataset.find.includes(term);
        let hits = 0;
        for (const r of s.sec.querySelectorAll('[data-find]')) {
          r.hidden = !(whole || r.dataset.find.includes(term));
          if (!r.hidden) hits++;
        }
        s.sec.hidden = s.link.hidden = !(whole || hits);
        any = any || !s.sec.hidden;
      }
      none.hidden = any;
      none.textContent = any ? '' : `No settings match “${search.value.trim()}”.`;
    }
    search.addEventListener('input', applyFind);
    search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { search.value = ''; applyFind(); } });

    // What's changed since the last save
    const baseline = k => cleanSetting(controls[k].f, CONFIG[k]);
    const pending = () => Object.fromEntries(Object.entries(controls).map(([k, c]) => [k, cleanSetting(c.f, c.read())]));
    const changed = () => { const p = pending(); return Object.keys(p).filter(k => p[k] !== baseline(k)); };
    function update() {
      const keys = new Set(changed());
      for (const [k, c] of Object.entries(controls)) c.row.classList.toggle('changed', keys.has(k));
      const n = keys.size;
      foot.classList.toggle('dirty', n > 0);
      save.disabled = !n;
      discard.hidden = !n;
      msg.classList.toggle('ok', !!note);
      msg.textContent = note || (n ? `${n} unsaved change${n === 1 ? '' : 's'}` : 'No unsaved changes');
    }
    for (const type of ['input', 'change']) main.addEventListener(type, update);

    function doSave() {
      const out = pending();
      const zoneChanged = out.timeZone !== CONFIG.timeZone;
      if (!set(K.settings, out)) { flash("Couldn't save: the browser's storage for autotask.net is full or blocked."); return; }
      loadSettings();
      if (zoneChanged) del(K.tzHint);
      if (CONFIG.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      reschedule();
      for (const c of Object.values(controls)) { c.write(CONFIG[c.f.key]); c.refreshHint(); }
      drawQueues();
      flash('Saved. Every Autotask tab now uses these settings.');
      render();
    }

    setForm = {
      dirty: () => changed().length > 0,
      save: () => { if (changed().length) doSave(); },
      // Settings saved in another tab: show them, unless you're part-way through changing something here
      refresh: () => {
        if (changed().length) return;
        for (const c of Object.values(controls)) { c.write(CONFIG[c.f.key]); c.refreshHint(); }
        drawHero();
        drawQueues();
        update();
      },
      refreshQueues: () => { drawHero(); drawQueues(); },
    };

    drawQueues();
    markNav(sections[0]);
    main.scrollTop = keepScroll;
    if (message) flash(message);
    else update();
  }

  // ---------------------------------------------------------------------------
  // Backup (export / import) and diagnostics
  // ---------------------------------------------------------------------------
  const isAutotaskUrl = u => typeof u === 'string' && /^https:\/\/([\w-]+\.)*autotask\.net\//i.test(u);

  function exportSettings() {
    const urls = {};
    for (const q of trackedQueues()) { const u = get(q.state, {}).url; if (u) urls[q.key] = u; }
    const data = {
      app: 'atqm', version: VERSION, exported: new Date().toISOString(),
      settings: get(K.settings, {}), queues: get(K.queues, []), urls, wsUrl: get(K.wsUrl, null), pos: get(K.pos, null),
    };
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'queue-monitor-settings.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // Returns a message for the Settings window ('' if cancelled). Everything in the file is checked first:
  // settings must be valid values, and addresses must be Autotask pages.
  function importSettings(text) {
    let d;
    try { d = JSON.parse(text); } catch { d = null; }
    if (!d || d.app !== 'atqm' || !Array.isArray(d.queues)) return "That file isn't a Queue monitor settings file.";
    const queues = [], keys = new Set();
    for (const q of d.queues) {
      if (!q || typeof q.key !== 'string' || typeof q.nav !== 'string' || !MODES[q.mode] || keys.has(q.key)) continue;
      keys.add(q.key);
      queues.push({ key: q.key, nav: q.nav, section: typeof q.section === 'string' ? q.section : '', mode: q.mode });
    }
    const n = queues.length;
    if (!confirm(`Replace your settings and tracked queues with the ${n} queue${n === 1 ? '' : 's'} in this file? Change history is kept.`)) return '';
    const settings = {};
    for (const f of FIELDS) if (!f.group && d.settings && f.key in d.settings) settings[f.key] = cleanSetting(f, d.settings[f.key]);
    set(K.settings, settings);
    saveQueues(queues);
    for (const q of trackedQueues()) {
      const u = d.urls && d.urls[q.key];
      if (isAutotaskUrl(u)) set(q.state, { ...get(q.state, {}), url: u });
    }
    if (isAutotaskUrl(d.wsUrl)) set(K.wsUrl, d.wsUrl);
    if (d.pos && Number.isFinite(d.pos.right) && Number.isFinite(d.pos.top)) set(K.pos, { right: d.pos.right, top: d.pos.top });
    loadSettings();
    reschedule();
    return `Imported settings and ${n} tracked queue${n === 1 ? '' : 's'}.`;
  }

  const DATE_ONLY = new RegExp('^\\s*' + DATE_RE.source + '\\s*$', 'i');
  // What the monitor can see in this page or frame: page structure, column names, counts and sample
  // dates only (no ticket titles or account names), so it can be pasted into a bug report.
  function diagnose() {
    const scope = gridScope();
    const grid = activeGrid();
    const rows = [...scope.querySelectorAll(AT.sel.row)];
    const cur = gridPresent() ? currentQueue() : null;
    const q = cur ? findTracked(cur) : null;
    const headerRow = [...scope.querySelectorAll(AT.sel.nonRow)]
      .find(r => [...r.cells].some(c => HEADERS.ticket.test(cellText(c)) || CALL_HEADERS.start.test(cellText(c))));
    const sampleDates = [...new Set(rows.slice(0, 5).flatMap(r => [...r.cells].map(cellText).filter(t => DATE_ONLY.test(t))))].slice(0, 3);
    const pi = pagerInfo();
    let ticketsRead = null;
    try { ticketsRead = findColumns(scope) ? readGrid()?.tickets.length ?? null : readCallGrid()?.calls.length ?? null; } catch { /* reported as null */ }
    return {
      frame: isTop ? 'top' : 'frame',
      path: location.pathname,
      workspacePage: isWorkspacePage(),
      menuItems: navItems().length,
      queue: cur ? (cur.section ? `${cur.section} > ${cur.nav}` : cur.nav) : null,
      tracked: q ? q.key : null,
      grid: grid ? grid.id || '(no id)' : rows.length ? 'rows outside a grid' : 'none',
      callGrid: isCallGrid(),
      columns: headerRow ? [...headerRow.cells].map(cellText).filter(Boolean) : [],
      missingColumns: q ? missingColumns(q).map(k => COLUMN_NAMES[k]) : null,
      pager: pi ? { from: pi.from, to: pi.to, total: pi.total, size: pi.size, max: pi.max } : null,
      refreshButton: !!findRefreshButton(),
      columnChooserButton: !!findColumnChooserButton(),
      rows: rows.length,
      ticketsRead,
      sampleDates,
    };
  }

  // Every frame in this tab, at any depth
  function frameWindows(win = window, out = []) {
    let n = 0;
    try { n = win.frames.length; } catch { return out; }
    for (let i = 0; i < n; i++) {
      try { const f = win.frames[i]; out.push(f); frameWindows(f, out); } catch { /* gone */ }
    }
    return out;
  }

  const diagWaiters = new Map(); // request id -> results from frames
  async function collectDiagnostics() {
    const id = Math.random().toString(36).slice(2);
    const results = [];
    diagWaiters.set(id, results);
    // The request itself carries no data; each frame answers only to the origin that asked
    for (const f of frameWindows()) { try { f.postMessage({ atqm: 'diag', id }, '*'); } catch { /* gone */ } }
    await sleep(1500);
    diagWaiters.delete(id);
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(P)) bytes += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch { /* not readable */ }
    const settings = {};
    for (const f of FIELDS) if (!f.group) settings[f.key] = CONFIG[f.key];
    const report = {
      version: VERSION,
      when: new Date().toISOString(),
      browser: navigator.userAgent,
      monitoring: get(K.enabled, false),
      webLocks: !!webLocks,
      storageKB: Math.round(bytes / 1024),
      storageWriteFailed: storageFail ? new Date(storageFail.ts).toISOString() : null,
      dateOrder: { setting: CONFIG.dateOrder, using: dateOrder(), detected: get(K.dateOrder, null)?.order || null },
      clockWarning: clockWarning(),
      settings,
      queues: trackedQueues().map(q => ({
        key: q.key, where: qWhere(q), mode: q.mode, health: health(q).text,
        monitoredHere: ownsLock(q), monitoredElsewhere: foreignActive(q),
      })),
      pages: [diagnose(), ...results.filter(r => r && (r.menuItems || r.rows || r.grid !== 'none'))],
    };
    return JSON.stringify(report, null, 2);
  }

  // ---------------------------------------------------------------------------
  // Macros (the Macros tab, and the Macros button on a ticket pop-up). Change account, two ways:
  // - the ticket you're looking at: done right there, in that page ("here")
  // - the tickets ticked in a queue: one at a time, in a tab of their own. The page you start it from
  //   drives it: it shows each ticket in the macro tab in turn, and the copy of this script running
  //   there does the clicking and reports back through localStorage.
  // Either way: on the ticket press Edit, pick the new account, fill in Sub-Issue Type and Work Type
  // where they're empty (if you gave them), Save, then check the ticket shows the new account.
  // ---------------------------------------------------------------------------
  const MACRO_WIN = 'atqm_macro'; // the macro tab's window name (names starting 'atqm-' are Quick start's)
  const MACRO_SS = P + 'macro';   // the job id, in the macro tab's sessionStorage and so in any window Autotask opens from it
  // ms: let a page settle; wait for a drop-down list to offer what was typed (each try; tries in all, the box
  // cleared and retype later typed again between them); wait for Save to finish; give up on a stuck step;
  // reload the ticket if it doesn't show the new account by then
  const MACRO = { settle: 1500, pick: 3000, tries: 3, retype: 500, saved: 12000, stage: 120000, verify: 30000 };
  const MACRO_ACTIVE = new Set(['open', 'edit', 'verify']);
  const MACRO_WORDS = {
    waiting: 'Waiting', open: 'Opening', edit: 'Editing', verify: 'Saving', done: 'Done',
    skipped: 'Already on it', failed: 'Failed', check: 'Check it',
  };
  // The edit page's fields Change account fills in as well as the account, only where they're empty
  // (a speed code would set them every time, over what's there)
  const FILL_FIELDS = {
    subIssue: { label: 'Sub-Issue Type', re: AT.text.subIssueLabel, a: 'a Sub-Issue Type', many: 'Sub-Issue Types' },
    workType: { label: 'Work Type', re: AT.text.workTypeLabel, a: 'a Work Type', many: 'Work Types' },
  };
  const ACCOUNT_FIELD = { label: 'Account', re: AT.text.accountLabel, a: 'an account', many: 'accounts' };
  let macroWin = null; // the tab this page opened for its job
  let macroBusy = false;

  const macroJob = () => get(K.macro, null);
  // jobId: only while that job is still the one in hand (a page left over from a stopped one mustn't
  // carry on with a new job on the same ticket)
  const macroItemState = (id, jobId) => {
    const job = macroJob();
    return !job || (jobId && job.id !== jobId) ? undefined : job.items.find(i => i.id === id)?.state;
  };
  function macroTabName() {
    try { return W.top.name || ''; } catch { return W.name || ''; }
  }
  // This page does the job's steps: it's in the macro tab, or in a tab running a job "here" (or a window
  // Autotask opened from one of those)
  function macroPage() {
    if (macroTabName() === MACRO_WIN) return true;
    const job = macroJob();
    try { return !!job && !job.finished && sessionStorage.getItem(MACRO_SS) === job.id; } catch { return false; }
  }
  // `from`: only if the ticket is still at that step. A step finishing late (a slow page, or a background
  // tab's timers held back) mustn't undo the driving page having given up on it. The job is finished
  // once no ticket is left to do (a job "here" has no driving page left to say so). jobId: as macroItemState.
  function patchMacroItem(id, patch, from, jobId) {
    const job = macroJob();
    if (!job || (jobId && job.id !== jobId) || (from && job.items.find(i => i.id === id)?.state !== from)) return;
    const items = job.items.map(i => (i.id === id ? { ...i, ...patch } : i));
    const over = !job.finished && !items.some(i => MACRO_ACTIVE.has(i.state) || i.state === 'waiting');
    set(K.macro, { ...job, items, ...(over ? { finished: Date.now() } : {}) });
  }

  const lastAccount = () => get(K.macroAccounts, [])[0] || '';
  // Every ticket in your tracked ticket queues, once each (their accounts are offered to change to)
  function macroPool() {
    const seen = new Set(), out = [];
    for (const q of activeQueues().filter(x => x.mode !== 'calls')) {
      for (const t of snapTickets(q) || []) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
    return out;
  }
  const macroUrl = it => (it.tid
    ? `${location.origin}${AT.path.ticketDetail}?workspace=False&ticketId=${it.tid}`
    : commandUrl('TicketNumber', it.id));

  // Show a page in the macro tab. Opening it the first time needs the click that started the job;
  // after that it's steered by its handle.
  function showInMacroTab(url) {
    try { if (macroWin && !macroWin.closed) { macroWin.location.href = url; return true; } } catch { /* fall through */ }
    macroWin = W.open(url, MACRO_WIN);
    if (!macroWin) { notePopups('blocked'); return false; }
    return true;
  }
  function closeMacroTab() {
    try { macroWin?.close(); } catch { /* ignore */ }
    macroWin = null;
  }

  // tickets: [{ id, tid }]. here: the one ticket this page shows, changed in this page.
  // fill: { subIssue, workType }, each filled in only where the ticket's is empty (blank: left alone)
  function startMacro(tickets, account, { here = false, fill = {} } = {}) {
    const idx = ticketIndex(), name = clean(account);
    set(K.macroAccounts, [name, ...get(K.macroAccounts, []).filter(a => !same(a, name))].slice(0, 10));
    const fills = {}, recent = get(K.macroFills, {});
    for (const key of Object.keys(FILL_FIELDS)) {
      const v = clean(fill[key]);
      if (!v) continue;
      fills[key] = v;
      recent[key] = [v, ...(recent[key] || []).filter(x => !same(x, v))].slice(0, 10);
    }
    if (Object.keys(fills).length) set(K.macroFills, recent);
    const job = {
      id: Date.now().toString(36) + ID.slice(0, 4), kind: 'account', account: name, fill: fills, by: ID, ts: Date.now(), here,
      items: tickets.map(t => ({ id: t.id, tid: t.tid || idx[t.id]?.tid || null, state: 'waiting', note: '' })),
    };
    set(K.macro, job);
    if (here) { try { sessionStorage.setItem(MACRO_SS, job.id); } catch { /* ignore */ } }
    macroWin = null;
    macroStep();
    if (here) macroWork();
  }
  function stopMacro() {
    const job = macroJob();
    if (!job) return;
    const items = job.items.map(i => (MACRO_ACTIVE.has(i.state) ? { ...i, state: 'check', note: 'Stopped part-way' } : i));
    set(K.macro, { ...job, items, finished: Date.now(), note: 'Stopped.' });
    closeMacroTab();
  }
  // The page that was driving it was closed or reloaded: carry on from this one
  function takeOverMacro() {
    const job = macroJob();
    if (!job) return;
    set(K.macro, { ...job, by: ID, ts: Date.now() });
    macroWin = null;
    macroStep();
  }

  // The driving page: move on once a ticket is finished with, and give up on one that's stuck
  function macroStep() {
    const job = macroJob();
    if (!job || job.finished) { if (macroWin) closeMacroTab(); return; }
    if (job.by !== ID) return;
    const now = Date.now();
    const items = job.items.map(i => ({ ...i }));
    let cur = items.find(i => MACRO_ACTIVE.has(i.state));
    let changed = false, note = '', reload = false;
    if (cur?.state === 'verify' && now - cur.at > MACRO.verify) {
      // The ticket page may still show the account from before Save (Autotask edited it in a window
      // of its own): load it again, once. A job "here" is driven from that page itself.
      if (!cur.reloaded) {
        cur.reloaded = true;
        cur.at = now;
        if (job.here) reload = true;
        else showInMacroTab(macroUrl(cur));
      } else {
        cur.state = 'check';
        cur.note = `Saved, but the ticket didn't show ${job.account} afterwards`;
        cur = null;
      }
      changed = true;
    } else if (cur && now - cur.at > MACRO.stage) {
      cur.note = stuckNote(cur);
      cur.state = 'failed';
      cur = null;
      changed = true;
    }
    if (!cur) {
      const next = items.find(i => i.state === 'waiting');
      if (next && (job.here || showInMacroTab(macroUrl(next)))) Object.assign(next, { state: 'open', at: now });
      else if (next) note = 'Your browser blocked the macro tab. Allow pop-ups for autotask.net and run it again.';
      changed = changed || !!next;
    }
    const finished = !!note || !items.some(i => MACRO_ACTIVE.has(i.state) || i.state === 'waiting');
    if (!changed && !finished && now - job.ts < 15000) return; // otherwise a heartbeat, so other tabs know it's alive
    set(K.macro, { ...job, items, ts: now, ...(note ? { note } : {}), ...(finished ? { finished: now } : {}) });
    if (finished) closeMacroTab();
    if (reload) location.reload();
  }

  const stuckNote = it => (it.state === 'open' ? "The ticket page didn't open, or had no Edit button"
    : "Stuck on the edit page (if Edit opens a window of its own, allow pop-ups for autotask.net)");

  // The macro tab: do the current ticket's next step on whichever page Autotask is showing
  async function macroWork() {
    if (macroBusy) return;
    // Not (or no longer) doing a macro's steps: a ticket's page running one "here" stops being one the moment
    // it finishes (or is stopped, or cleared), and its strip along the bottom goes with it
    if (!macroPage()) { macroBanner(null, null); return; }
    const job = macroJob();
    const item = job && !job.finished ? job.items.find(i => MACRO_ACTIVE.has(i.state)) : null;
    macroBanner(job, item);
    if (!item) return;
    const jid = job.id;
    // A job "here" whose page has moved on (Edit, a reload) has no driving page left to give up on a stuck step
    if (job.here && job.by !== ID && item.state !== 'verify' && Date.now() - item.at > MACRO.stage) {
      patchMacroItem(item.id, { state: 'failed', note: stuckNote(item) }, item.state, jid);
      return;
    }
    macroBusy = true;
    try {
      if (item.state === 'edit') {
        if (macroEditPage()) await macroEdit(job, item);
      } else if (openTicketId() === item.id && findButton(AT.text.editButton)) {
        if (item.state === 'verify') {
          if (accountShown(job.account, item.chosen)) {
            const off = fillProblem(job, item); // the page is up to date now: the types it filled in should show too
            patchMacroItem(item.id, off ? { state: 'check', note: off } : { state: 'done', note: '' }, 'verify', jid);
          }
          // Long after the driving page would have reloaded it (and a job "here" has no driving page left)
          else if (Date.now() - item.at > 2 * MACRO.verify) {
            patchMacroItem(item.id, { state: 'check', note: `Saved, but the ticket didn't show ${job.account} afterwards` }, 'verify', jid);
          }
        } else {
          await sleep(MACRO.settle); // let the account show before judging it
          if (macroItemState(item.id, jid) !== 'open') return; // stopped, or given up on, meanwhile
          if (accountShown(job.account)) {
            patchMacroItem(item.id, { state: 'skipped', note: `Already on ${job.account}` }, 'open', jid);
          } else {
            // The types the ticket has now, read off its page before editing: one it has is left alone,
            // whatever the edit page shows (null: this page doesn't show that field)
            const had = {};
            for (const key of Object.keys(job.fill || {})) if (FILL_FIELDS[key]) had[key] = ticketField(FILL_FIELDS[key].re);
            patchMacroItem(item.id, { state: 'edit', at: Date.now(), had }, 'open', jid);
            press(findButton(AT.text.editButton));
          }
        }
      }
    } catch (e) {
      console.error('[ATQM]', e);
      patchMacroItem(item.id, { state: 'failed', note: 'Macro error: ' + e.message }, macroItemState(item.id, jid), jid);
    } finally {
      macroBusy = false;
    }
    // Finished by this page just now (its own change brings it no storage event): the strip goes, the result shows
    if (!macroPage()) { macroBanner(null, null); renderTicketPill(); }
  }

  async function macroEdit(job, item) {
    let step = 'edit';
    const fail = (note, state = 'failed') => patchMacroItem(item.id, { state, note }, step, job.id);
    const before = new Set(dialogs()); // message boxes already on the page aren't questions for us
    await sleep(MACRO.settle);
    const input = accountField();
    if (!input) return fail("Couldn't find the Account field on the edit page");
    const pick = await chooseOption(input, job.account, ACCOUNT_FIELD);
    if (pick.note) return fail(pick.note);
    await sleep(MACRO.settle);
    const asked = answerDialog(before);
    if (asked) return fail(asked);
    // Filled in only where the ticket has none: its page showed nothing there before editing, and the edit
    // page shows nothing there now the account is picked. Anything showing counts, so a type is never written over.
    const filled = [], kept = [], picks = {};
    for (const [key, value] of Object.entries(job.fill || {})) {
      const f = FILL_FIELDS[key];
      if (!f || !value) continue;
      if (item.had?.[key]) { kept.push(f.label); continue; }
      const fld = findField(f.re);
      if (!fld) return fail(`Couldn't find the ${f.label} field on the edit page`);
      if (fieldShows(fld)) { kept.push(f.label); continue; }
      if (fld.input.disabled) return fail(`${f.label} is greyed out on the edit page, so it couldn't be filled in`);
      const got = await chooseOption(fld.input, value, f);
      if (got.note) return fail(got.note);
      filled.push(f.label);
      picks[key] = got.text;
      await sleep(MACRO.settle);
      const q = answerDialog(before);
      if (q) return fail(q);
    }
    const save = AT.text.saveButtons.map(findButton).find(Boolean);
    if (!save) return fail("Couldn't find Save on the edit page");
    if (macroItemState(item.id, job.id) !== 'edit') return; // stopped, or given up on, meanwhile
    patchMacroItem(item.id, { state: 'verify', at: Date.now(), chosen: pick.text, filled, kept, picks }, 'edit', job.id);
    step = 'verify';
    press(save);
    // Still on the edit page a while later: Autotask didn't take it (often another field it needs)
    if (await waitSteps(() => !save.isConnected || !visible(save), MACRO.saved)) return;
    const problem = answerDialog(before) || formProblem();
    if (problem) fail(`Not saved: ${problem}`);
    else fail('Pressed Save, but the edit page stayed open', 'check');
  }

  // Like waitFor, but counts its steps instead of reading the clock
  async function waitSteps(fn, ms) {
    for (let i = 0; i <= ms / 250; i++) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  }
  function visible(e) {
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false;
      const cs = n.ownerDocument.defaultView.getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  }
  const notOurs = e => !e.closest(OUR_BOXES);
  function findButton(text) {
    const t = [...document.querySelectorAll(AT.sel.buttonText)].find(e => clean(e.textContent) === text && notOurs(e) && visible(e));
    return t ? t.closest(AT.sel.button) || t : null;
  }
  // A field on the ticket's own page: what it shows ('' when empty), or null when the page has no such field
  function ticketField(re) {
    for (const box of document.querySelectorAll(AT.sel.detailField)) {
      const label = box.querySelector(AT.sel.detailLabel);
      if (!label || !notOurs(box) || !re.test(clean(label.textContent))) continue;
      const value = box.querySelector(AT.sel.detailValue);
      return value ? clean(value.innerText ?? value.textContent) : '';
    }
    return null;
  }
  // The ticket page shows one of these as its account: in its Account field (not a contact or resource
  // who happens to have the same name), or on a page built another way, as one of its links
  function accountShown(...names) {
    const want = names.filter(Boolean).map(n => clean(n).toLowerCase());
    const shown = ticketField(AT.text.accountLabel);
    if (shown != null) return want.includes(shown.toLowerCase());
    return [...document.querySelectorAll(AT.sel.accountLink)].some(e => notOurs(e) && want.includes(clean(e.textContent).toLowerCase()));
  }
  // A type it filled in that the ticket's page doesn't show afterwards (one the page doesn't have can't be checked)
  function fillProblem(job, item) {
    for (const [key, text] of Object.entries(item.picks || {})) {
      const f = FILL_FIELDS[key], shown = f ? ticketField(f.re) : null;
      if (shown == null || same(shown, text) || same(shown, job.fill?.[key])) continue;
      return `Saved, but ${f.label} shows ${shown ? `"${shown}"` : 'nothing'} instead of ${text}`;
    }
    return '';
  }
  // An edit page field, by the label that names it ("Account"): the text box the label points at, or else
  // the nearest one after the label, but never one past the next field's label (when this field's own
  // isn't a text box, that one belongs to the next field). editor: the part of the page with the box in
  // it and not the label, where a selector may show its choice beside an empty search box.
  function findField(re) {
    const ok = x => !!x && x.matches(AT.sel.textInput) && !x.closest(AT.sel.formTemplate) && notOurs(x) && visible(x);
    const after = (a, b) => !!(a.compareDocumentPosition(b) & 4); // b comes after a in the page
    for (const label of document.querySelectorAll(AT.sel.fieldLabel)) {
      if (label.childElementCount > 1 || !re.test(clean(label.textContent)) || !notOurs(label) || !visible(label)) continue;
      if (label.closest(AT.sel.detailField)) continue; // the ticket page's read-only fields have no box to type in
      let input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      const linked = ok(input);
      if (!linked) {
        input = null;
        for (let n = label.parentElement, i = 0; n && i < 4 && !input; n = n.parentElement, i++) {
          input = [...n.querySelectorAll(AT.sel.textInput)].find(x => ok(x) && after(label, x)) || null;
        }
      }
      if (!input) continue;
      let editor = input;
      while (editor.parentElement && !editor.parentElement.contains(label)) editor = editor.parentElement;
      // Around the box: the box's own part of the page, or the box's parent when it sits right beside the label
      const area = editor === input ? input.parentElement : editor;
      if (!linked) {
        // Another field's name between the label and the box: that box is the other field's. (Text in the
        // box's own part of the page is its choice, not a name; beside a bare box, any text counts, to be safe.)
        const between = e => e !== label && !label.contains(e) && !e.contains(label) && after(label, e) && after(e, input) && notOurs(e);
        const name = e => /[a-z]/i.test(e.textContent) && clean(e.textContent).length <= 60;
        const other = [...document.querySelectorAll('label')].some(l => between(l) && name(l))
          || [...document.querySelectorAll(AT.sel.fieldLabel)].some(e => !e.childElementCount && between(e) && !editor.contains(e) && name(e) && visible(e));
        if (other) continue;
      }
      return { input, editor, area, label };
    }
    return null;
  }
  const fieldInput = re => findField(re)?.input || null;
  const accountField = () => fieldInput(AT.text.accountLabel);
  // A field shows something: typed in its box, or shown around it (a selector's choice beside an empty
  // search box). Only what's on screen counts, not a hidden list, nor the field's own name.
  function fieldShows(f) {
    if (clean(f.input.value)) return true;
    const shown = e => clean(e.innerText ?? e.textContent);
    let text = shown(f.area);
    if (f.area.contains(f.label)) text = text.replace(shown(f.label), '');
    return /[^\s*:]/.test(text);
  }
  const macroEditPage = () => !!AT.text.saveButtons.map(findButton).find(Boolean) && !!accountField();

  function typeInto(input, text) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    if (setter) setter.call(input, text); else input.value = text;
    for (const type of ['keydown', 'input', 'keyup']) {
      let ev;
      try { ev = type === 'input' ? new Event(type, { bubbles: true }) : new KeyboardEvent(type, { bubbles: true, key: text.slice(-1) }); } catch { continue; }
      input.dispatchEvent(ev);
    }
  }
  // Choices in the open drop-down list for this name: the one that is exactly it (exact), else the only one
  // with a part that is (another column beside it), else the only one containing it
  function pickOptions(name) {
    const want = clean(name).toLowerCase();
    const text = o => clean(o.textContent).toLowerCase();
    const opts = [...document.querySelectorAll(AT.sel.pickItem)].filter(o => notOurs(o) && !o.closest(AT.sel.formTemplate) && visible(o));
    const exact = opts.find(o => text(o) === want);
    if (exact) return { pick: exact, exact: true };
    const part = opts.filter(o => [...o.children].some(c => text(c) === want));
    if (part.length === 1) return { pick: part[0], exact: true };
    const partial = opts.filter(o => text(o).includes(want));
    return partial.length === 1 && !part.length ? { pick: partial[0] } : { many: Math.max(part.length, partial.length) };
  }
  // Type the name into a field's box and pick it from the list Autotask offers. Autotask sometimes doesn't load
  // the list for what's typed, so when it hasn't offered the name after MACRO.pick, the box is cleared and the
  // name typed again MACRO.retype later, MACRO.tries times in all. (Not when the list came with several that
  // match: typing again wouldn't change that.) A choice that only contains the name has to still be the only
  // one a moment later, so a list still filling in, or one left over from before, doesn't get it picked.
  // f: ACCOUNT_FIELD or a FILL_FIELDS entry
  async function chooseOption(input, name, f) {
    let found = { many: 0 };
    for (let n = 1; n <= MACRO.tries; n++) {
      if (n > 1) {
        typeInto(input, ''); // take out what it typed
        await sleep(MACRO.retype);
      }
      press(input, true);
      input.focus();
      typeInto(input, name);
      let last = null;
      const pick = await waitSteps(() => {
        found = pickOptions(name);
        const sure = found.exact || (found.pick && found.pick === last);
        last = found.pick || null;
        return sure ? found.pick : null;
      }, MACRO.pick);
      if (pick) {
        const text = clean(pick.textContent);
        press(pick, true);
        return { text };
      }
      if (found.many > 1) break;
    }
    return { note: found.many > 1 ? `${found.many} ${f.many} match "${name}": use the full name`
      : `Autotask didn't offer ${f.a} called "${name}" (tried ${MACRO.tries} times)` };
  }

  const dialogs = () => [...document.querySelectorAll(AT.sel.dialog)].filter(d => notOurs(d) && visible(d) && clean(d.textContent));
  // A message box that came up while editing. One with just OK is acknowledged; one that asks something
  // isn't answered, so the ticket is left unsaved. Returns what it asked.
  function answerDialog(before) {
    const box = dialogs().find(d => !before.has(d));
    if (!box) return '';
    const btns = [...box.querySelectorAll(AT.sel.dialogButton)].filter(visible);
    if (btns.length === 1 && AT.text.dialogOk.test(clean(btns[0].textContent))) { press(btns[0]); return ''; }
    return `Autotask asked "${clean(box.textContent).slice(0, 160)}" (not answered)`;
  }
  const formProblem = () => [...new Set([...document.querySelectorAll(AT.sel.formError)]
    .filter(e => notOurs(e) && visible(e)).map(e => clean(e.textContent)).filter(t => t && t.length < 200))].slice(0, 2).join(' ');

  // A strip across the macro tab, so it's clear why the page is moving by itself
  function macroBanner(job, item) {
    if (!isTop || !document.body) return;
    let bar = document.getElementById('atqm-macrobar');
    if (!item) { bar?.remove(); return; }
    if (!bar) {
      bar = el('div');
      bar.id = 'atqm-macrobar';
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483001;background:#22303f;color:#e6e6e6;' +
        'border-top:3px solid #4ea1ff;padding:6px 12px;font:13px/1.4 system-ui,Segoe UI,sans-serif';
      document.body.append(bar);
    }
    const n = job.items.indexOf(job.items.find(i => i.id === item.id)) + 1;
    bar.textContent = job.here
      ? `Queue monitor macro: changing the account on ${item.id} to ${job.account}. Leave this page until it's done.`
      : `Queue monitor macro: changing the account on ${item.id} to ${job.account} (${n} of ${job.items.length}). ` +
        'Leave this tab alone. It closes when the macro finishes.';
  }

  // Tickets ticked in the queue grid (Autotask's row checkboxes), with their internal IDs
  function tickedTickets() {
    const out = [];
    for (const r of gridScope().querySelectorAll(AT.sel.row)) {
      if (!r.querySelector(AT.sel.rowTicked)) continue;
      const cell = [...r.cells].find(c => TICKET_RE.test(cellText(c)));
      if (cell) out.push({ id: cellText(cell).match(TICKET_RE)[0], tid: findTicketRef(r, cell).tid });
    }
    return out;
  }

  // The account to change to. A list: the accounts you've changed tickets to (the last one picked to
  // start with) and the accounts in your queues, with "Another account…" to type any other name.
  const OTHER_ACCOUNT = '\u0000other';
  function accountPicker(id, onChange) {
    const root = el('div', 'mc-acc');
    const sel = el('select');
    sel.id = id;
    const other = el('input');
    other.placeholder = 'Account name, as Autotask shows it';
    other.autocomplete = 'off';
    other.setAttribute('aria-label', 'Account name');
    root.append(sel, other);
    let sig = null;
    function refresh() {
      const recent = get(K.macroAccounts, []);
      const queues = [...new Set(macroPool().map(t => clean(t.account)).filter(Boolean))]
        .filter(a => !recent.some(r => same(r, a))).sort((a, b) => a.localeCompare(b));
      const s = recent.join('\n') + '\u0001' + queues.join('\n');
      if (s !== sig) {
        const keep = sig === null ? lastAccount() : sel.value;
        sig = s;
        const group = (label, names) => {
          if (!names.length) return;
          const g = el('optgroup');
          g.label = label;
          for (const n of names) { const o = el('option', null, n); o.value = n; g.append(o); }
          sel.append(g);
        };
        sel.replaceChildren();
        // The one picked stays picked even when it drops out of both lists (its last ticket left your queues)
        if (keep && keep !== OTHER_ACCOUNT && ![...recent, ...queues].includes(keep)) { const o = el('option', null, keep); o.value = keep; sel.append(o); }
        group('Used recently', recent);
        group('In your queues', queues);
        const o = el('option', null, 'Another account…');
        o.value = OTHER_ACCOUNT;
        sel.append(o);
        sel.value = [...sel.options].some(x => x.value === keep) ? keep : recent[0] || OTHER_ACCOUNT;
      }
      other.hidden = sel.value !== OTHER_ACCOUNT;
    }
    sel.addEventListener('change', () => { refresh(); if (sel.value === OTHER_ACCOUNT) other.focus(); onChange(); });
    other.addEventListener('input', onChange);
    refresh();
    return { root, refresh, value: () => clean(sel.value === OTHER_ACCOUNT ? other.value : sel.value) };
  }

  // ---------------------------------------------------------------------------
  // The macros: a square each in the Macros grid (the Macros tab, and the Macros button on a ticket
  // pop-up). A click opens its window, which asks for what it needs and has Run. One that asks for
  // nothing also runs straight from its square on a double-click; a single click never runs anything.
  //   params: what its window asks for: { id, label, type: 'account' | 'text', required, hint, recent, value }
  //     (required: what to say while it's empty; without it, it can be left blank. value: what it starts with)
  //   start(values, way): run it on way.tickets (way.here: the one ticket this page shows, in this page)
  // ---------------------------------------------------------------------------
  const MACROS = [
    {
      id: 'account', name: 'Change account',
      about: 'Moves tickets to another account: presses Edit, picks the account, fills in the types below where ' +
        "the ticket doesn't have one, saves, and checks the ticket shows the new account.",
      params: [
        { id: 'account', label: 'Change to', type: 'account', required: 'Pick the account to change to.' },
        { id: 'subIssue', label: 'Sub-Issue Type, if empty', type: 'text', value: 'Other', recent: () => get(K.macroFills, {}).subIssue || [] },
        { id: 'workType', label: 'Work Type, if empty', type: 'text', value: 'Remote Support', recent: () => get(K.macroFills, {}).workType || [],
          hint: "Each is only filled in where the ticket doesn't have one. Clear one to leave that field alone." },
      ],
      start: (v, way) => startMacro(way.tickets, v.account, { here: way.here, fill: { subIssue: v.subIssue, workType: v.workType } }),
    },
  ];
  const macroRunning = () => { const job = macroJob(); return !!job && !job.finished; };

  // The tickets a macro can run on from this page: the one it shows (done right there), or the ones ticked
  // in the queue or other list of tickets it shows (one at a time, in a tab of their own; a dashboard
  // widget's drill-down is a list too). A ticket pop-up only has its ticket.
  function macroWays(ctx) {
    const ways = [{
      key: 'ticket', title: 'This ticket', here: true, tickets: ctx.ticket ? [{ id: ctx.ticket }] : [],
      sub: ctx.ticket ? `${ctx.ticket}, in this page` : 'Open a ticket to run it on just that one.',
      how: "It happens in this page: leave it until it says it's done.",
    }];
    if (ctx.popup) return ways;
    const inList = (!!ctx.cur || !!ctx.grid) && !ctx.isCalls, ticked = inList ? ctx.ticked || [] : [];
    const where = ctx.cur ? ctx.cur.nav : 'this list';
    ways.push({
      key: 'ticked', title: 'Ticked in this queue', here: false, tickets: ticked,
      sub: !inList ? 'Open a queue and tick the tickets to run it on them together.'
        : ticked.length ? `${ticked.length} ticked in ${where}` : `Tick tickets in ${where} to run it on them together.`,
      how: 'Each ticket opens in a separate tab, one at a time. Keep this tab open until it finishes.',
    });
    return ways;
  }

  // One thing a macro's window asks for: { root, p, value(), refresh() }
  function macroField(p, onChange) {
    const root = el('div', 'mc-field');
    const label = el('label', null, p.label);
    label.htmlFor = 'atqm-mc-' + p.id;
    root.append(label);
    let field;
    if (p.type === 'account') {
      const picker = accountPicker(label.htmlFor, onChange);
      root.append(picker.root);
      field = { value: picker.value, refresh: picker.refresh };
    } else {
      const input = el('input', 'mc-text');
      input.id = label.htmlFor;
      input.autocomplete = 'off';
      if (p.value) input.value = p.value;
      root.append(input);
      const recent = p.recent ? p.recent() : [];
      if (recent.length) { // what you've used before, offered as you type
        const list = el('datalist');
        list.id = input.id + '-used';
        for (const v of recent) { const o = el('option'); o.value = v; list.append(o); }
        input.setAttribute('list', list.id);
        root.append(list);
      }
      input.addEventListener('input', onChange);
      field = { value: () => clean(input.value), refresh() {} };
    }
    if (p.hint) root.append(el('div', 'atqm-sub', p.hint));
    return { root, p, ...field };
  }

  // A macro's window: what it asks for, which tickets, and Run. One at a time, beside where it was opened
  // from (the Queue monitor window, or a ticket pop-up's Macros box). panel: opened from the Queue monitor
  // window, which keeps it up to date with the page (tickets ticked meanwhile) and closes it when you
  // leave the Macros tab.
  let mcWin = null; // { root, macro, panel, sq, back, refresh(ctx) }
  function openMacroWindow(macro, { ctx, anchor, after, panel = false, sq = null }) {
    if (mcWin?.macro === macro) { (mcWin.root.querySelector('select, input:not([type=radio])') || mcWin.root).focus(); return; }
    closeMacroWindow();
    ensureCss();
    const back = sq || document.activeElement; // where focus goes back to when it's closed
    const root = el('div', 'atqm-mc');
    root.id = 'atqm-mcwin';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'atqm-mcwin-t');
    const head = el('div', 'mcw-head'), title = el('b', null, macro.name), x = el('button', 'mcw-x', '×');
    title.id = 'atqm-mcwin-t';
    x.title = 'Close';
    x.setAttribute('aria-label', 'Close');
    head.append(title, x);
    root.append(head, el('div', 'atqm-sub', macro.about));
    const fields = macro.params.map(p => macroField(p, () => refresh()));
    for (const f of fields) root.append(f.root);

    // Which tickets: a choice when this page offers more than one way
    let cur = ctx, way = '';
    const rows = {}, waysBox = el('div', 'mcw-ways');
    const ways0 = macroWays(ctx);
    if (ways0.length > 1) {
      waysBox.append(el('div', 'mcw-lbl', 'Run on'));
      for (const w of ways0) {
        const row = el('label', 'mcw-way'), radio = el('input'), text = el('div'), sub = el('div', 'atqm-sub');
        radio.type = 'radio';
        radio.name = 'atqm-mcwin-way';
        radio.value = w.key;
        radio.onchange = () => { way = w.key; refresh(); };
        text.append(el('b', null, w.title), sub);
        row.append(radio, text);
        waysBox.append(row);
        rows[w.key] = { row, radio, sub };
      }
    } else {
      waysBox.classList.add('mcw-on');
    }
    const how = el('div', 'mcw-how');
    const btns = el('div', 'atqm-qsbtns'), run = el('button', 'atqm-qsgo', 'Run'), cancel = el('button', null, 'Cancel');
    btns.append(run, cancel);
    root.append(waysBox, how, btns);

    let started = false;
    function refresh(c = cur) {
      if (started) return null;
      cur = c;
      for (const f of fields) f.refresh();
      const ways = macroWays(c);
      if (!ways.find(w => w.key === way)?.tickets.length) way = ways.find(w => w.tickets.length)?.key || '';
      for (const w of ways) {
        const r = rows[w.key];
        if (!r) continue;
        r.sub.textContent = w.sub;
        r.radio.disabled = !w.tickets.length;
        r.radio.checked = w.key === way;
        r.row.classList.toggle('off', !w.tickets.length);
      }
      if (ways.length === 1) waysBox.replaceChildren(el('b', null, `${ways[0].title}: `), ways[0].sub);
      const chosen = ways.find(w => w.key === way), busy = macroRunning();
      const need = fields.find(f => f.p.required && !f.value());
      run.disabled = busy || !chosen || !!need;
      how.className = 'mcw-how ' + (busy ? 'atqm-warn' : 'atqm-sub');
      how.textContent = busy ? 'Another macro is running. Wait for it to finish.'
        : !chosen ? 'Open a ticket, or tick tickets in a queue, to run it.'
        : need ? need.p.required : chosen.how;
      return chosen;
    }
    // Only Run starts it (not Enter, which also picks from a field's suggestions). The tickets are read
    // again first: if they've changed since they were shown (one unticked a moment ago), it shows them
    // instead. Afterwards the window stays a moment, so a double-click's second click lands here and not
    // on the page underneath.
    run.onclick = () => {
      if (started) return;
      const shown = JSON.stringify(macroWays(cur).find(w => w.key === way)?.tickets || []);
      const chosen = refresh(panel ? pageInfo(true) : cur);
      if (run.disabled || !chosen || JSON.stringify(chosen.tickets) !== shown) return;
      const values = Object.fromEntries(fields.map(f => [f.p.id, f.value()]));
      started = true;
      run.disabled = cancel.disabled = x.disabled = true;
      how.className = 'mcw-how atqm-sub';
      how.textContent = 'Started.';
      macro.start(values, chosen);
      after();
      setTimeout(() => { if (mcWin?.root === root) closeMacroWindow(); }, 400);
    };
    cancel.onclick = x.onclick = () => closeMacroWindow(true);
    root.addEventListener('keydown', e => e.stopPropagation()); // typing here isn't for Autotask's own shortcuts

    document.body.append(root);
    sq?.classList.add('on');
    mcWin = { root, macro, panel, sq, back, refresh, started: () => started };
    refresh();
    placeMacroWindow(root, anchor);
    (root.querySelector('select, input:not([type=radio])') || run).focus();
  }
  function closeMacroWindow(restore = false) {
    if (!mcWin) return;
    const { root, sq, back } = mcWin;
    mcWin = null;
    root.remove();
    sq?.classList.remove('on');
    if (restore && back?.isConnected) back.focus();
  }
  // Beside the box it was opened from: on its left, else on its right, else in the middle of the page
  function placeMacroWindow(win, anchor) {
    const r = win.getBoundingClientRect(), gap = 8;
    const a = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    let left = Math.max(gap, (innerWidth - r.width) / 2), top = Math.max(gap, (innerHeight - r.height) / 3);
    if (a && a.width) {
      const side = a.left - gap - r.width >= gap ? a.left - gap - r.width
        : a.right + gap + r.width <= innerWidth - gap ? a.right + gap : null;
      if (side != null) { left = side; top = Math.max(gap, Math.min(a.top, innerHeight - r.height - gap)); }
    }
    Object.assign(win.style, { left: left + 'px', top: top + 'px' });
  }

  // Run one that asks for nothing on what this page offers first. False: it can't run now (another macro
  // is running, or there's no ticket here), so its window opens instead to say why.
  function quickRunMacro(macro, ctx, after) {
    const way = macroWays(ctx).find(w => w.tickets.length);
    if (macroRunning() || !way) return false;
    closeMacroWindow();
    macro.start({}, way);
    after();
    return true;
  }

  // The squares. getCtx: what the page shows now (pageInfo, or the pop-up's ticket); getAnchor: the box to
  // open windows beside; after: once a macro has started
  function macroGrid(getCtx, getAnchor, after, panel = false) {
    const grid = el('div', 'mc-grid');
    for (const m of MACROS) {
      const sq = el('button', 'mc-sq');
      sq.type = 'button';
      sq.dataset.macro = m.id;
      sq.title = m.about;
      sq.append(el('b', null, m.name));
      if (!m.params.length) sq.append(el('span', 'atqm-sub', 'Double-click to run'));
      let wait = null;
      const open = () => openMacroWindow(m, { ctx: getCtx(), anchor: getAnchor(), after, panel, sq });
      sq.addEventListener('click', e => {
        clearTimeout(wait);
        if (m.params.length || !e.detail) open(); // Enter or Space: straight to its window
        else if (e.detail === 1) wait = setTimeout(open, 350); // unless a second click makes it a double-click
      });
      sq.addEventListener('dblclick', () => {
        if (m.params.length) return;
        clearTimeout(wait);
        if (!quickRunMacro(m, getCtx(), after)) open();
      });
      grid.append(sq);
    }
    return grid;
  }

  // The Macros tab: the squares, or the macro that's running (or ran last) until you clear it. Built once
  // and kept, so the squares keep focus through the window's regular redraws.
  let macroBox = null;
  function renderMacros(panel, pg) {
    if (!macroBox) {
      macroBox = el('div', 'atqm-mc');
      const pick = el('div', 'mc-pick');
      pick.append(el('div', 'atqm-sub mc-hint', 'Click a macro to set it up and run it.'),
        macroGrid(() => pageInfo(), () => document.getElementById('atqm'), () => render(), true));
      macroBox.append(pick, el('div', 'mc-run'));
    }
    if (panel.firstChild !== macroBox || panel.childNodes.length > 1) panel.replaceChildren(macroBox);
    const job = macroJob(), run = macroBox.querySelector('.mc-run');
    macroBox.querySelector('.mc-pick').hidden = !!job;
    run.hidden = !job;
    if (job) renderMacroRun(run, job);
    if (!mcWin?.panel) return;
    if (job && !mcWin.started()) closeMacroWindow(); // one started elsewhere: its squares are put away until it's cleared
    else mcWin.refresh(pg);
  }
  // Run the tickets that didn't get done again: in this page if it's the one ticket this page shows
  function retryMacro(job) {
    const rest = job.items.filter(i => ['failed', 'check', 'waiting'].includes(i.state));
    startMacro(rest, job.account, { here: job.here && rest.length === 1 && pageInfo(true).ticket === rest[0].id, fill: job.fill });
  }
  // What it did with the types on a ticket: "Filled in Sub-Issue Type; kept its Work Type"
  const filledText = it => [it.filled?.length ? `Filled in ${it.filled.join(' and ')}` : '',
    it.kept?.length ? `kept its ${it.kept.join(' and ')}` : ''].filter(Boolean).join('; ').replace(/^k/, 'K');
  function renderMacroRun(box, job) {
    box.replaceChildren();
    const count = s => job.items.filter(i => i.state === s).length;
    const total = job.items.length, over = job.items.filter(i => !MACRO_ACTIVE.has(i.state) && i.state !== 'waiting').length;
    const head = el('div', 'mc-head');
    head.append(job.finished ? 'Changed account to ' : 'Changing account to ', el('b', null, job.account));
    box.append(head);
    const fills = Object.entries(job.fill || {}).filter(([k]) => FILL_FIELDS[k]).map(([k, v]) => `${FILL_FIELDS[k].label} ${v}`);
    if (fills.length) box.append(el('div', 'atqm-sub', `Where the ticket has none: ${fills.join(', ')}`));
    const parts = [`${over} of ${total} finished`];
    for (const s of ['done', 'skipped', 'check', 'failed']) if (count(s)) parts.push(`${count(s)} ${MACRO_WORDS[s].toLowerCase()}`);
    box.append(el('div', 'atqm-sub', parts.join(' · ')));
    // The driving page writes a heartbeat; a background tab's timers can run a minute late.
    // A job "here" moves through the ticket's own pages, so it has no driving page to watch.
    const alive = job.here || Date.now() - job.ts < 150000;
    if (job.note) box.append(el('div', 'atqm-warn', job.note));
    else if (!job.finished && job.by !== ID) {
      box.append(el('div', alive ? 'atqm-sub' : 'atqm-warn', job.here ? "Running in the ticket's page."
        : alive ? 'Running from another tab.' : 'The tab running it was closed or reloaded.'));
    }

    const list = el('ul', 'atqm-list');
    for (const it of job.items) {
      const li = el('li', 'mc-' + it.state);
      li.append(el('span', 'atqm-when', it.state === 'waiting' && job.finished ? 'Not started' : MACRO_WORDS[it.state] || it.state), ticketLink(it.id, { tid: it.tid }));
      const sub = it.note || filledText(it);
      if (sub) li.append(el('div', 'atqm-sub', sub));
      list.append(li);
    }
    box.append(list);

    // These buttons change places as they're pressed (Stop becomes Done and Try again), so the second
    // click of a double-click is ignored rather than pressing whatever has just appeared under it
    const btns = el('div', 'atqm-qsbtns');
    const act = (b, fn) => { b.onclick = e => { if (e.detail > 1) return; fn(); render(); }; return b; };
    if (!job.finished) {
      btns.append(act(el('button', null, 'Stop'), stopMacro));
      if (!alive && job.by !== ID) btns.prepend(act(el('button', 'atqm-qsgo', 'Continue here'), takeOverMacro));
    } else {
      const rest = count('failed') + count('check') + count('waiting');
      const done = act(el('button', 'atqm-qsgo', 'Done'), () => del(K.macro));
      done.title = 'Clear this list';
      btns.append(done);
      if (rest) {
        const again = act(el('button', null, rest === 1 ? 'Try again' : `Try the ${rest} again`), () => retryMacro(job));
        again.title = "Run the tickets that didn't get done again";
        btns.append(again);
      }
    }
    box.append(btns);
  }

  // A ticket pop-up hides the Queue monitor window (setting "Hide in ticket pop-up windows"), so its
  // macros are behind a small Macros button in the corner instead, for that ticket
  let tkPill = null;
  function renderTicketPill() {
    const id = isTop && document.body && !document.getElementById('atqm') && macroTabName() !== MACRO_WIN ? openTicketId() : null;
    const job = macroJob();
    const mine = job?.here && job.items.length === 1 && job.items[0].id === id ? job : null;
    // Turned off (setting "Macros button on ticket pop-ups"): none, though a macro run here still says how it went.
    // While one runs, the strip along the bottom says so.
    if (!id || (mine && !mine.finished) || (!CONFIG.ticketMacroButton && !mine)) {
      tkPill?.remove();
      tkPill = null;
      if (mcWin && !mcWin.panel && !mcWin.started()) closeMacroWindow();
      return;
    }
    ensureCss();
    if (!tkPill || !tkPill.isConnected || tkPill.dataset.id !== id) {
      tkPill?.remove();
      if (mcWin && !mcWin.panel) closeMacroWindow();
      tkPill = buildTicketPill(id);
      document.body.append(tkPill);
    }
    const result = tkPill.querySelector('.tk-result');
    result.hidden = !mine;
    if (mine) {
      const it = mine.items[0];
      result.replaceChildren();
      const ok = it.state === 'done' || it.state === 'skipped';
      const filled = filledText(it);
      result.append(el('b', ok ? null : 'atqm-warn', ok ? `Account: ${mine.account}${filled ? ` · ${filled}` : ''}`
        : `${MACRO_WORDS[it.state]}: ${it.note || 'the account may not have changed'}`));
      const close = el('button', null, 'OK');
      close.onclick = () => { del(K.macro); renderTicketPill(); };
      result.append(close);
      tkPill.querySelector('.tk-open').hidden = true;
      tkPill.querySelector('.tk-box').hidden = true;
    } else if (tkPill.querySelector('.tk-box').hidden) {
      tkPill.querySelector('.tk-open').hidden = false;
    }
    if (mcWin && !mcWin.panel) mcWin.refresh();
  }
  function buildTicketPill(id) {
    const pill = el('div');
    pill.id = 'atqm-tkpill';
    pill.dataset.id = id;
    const open = el('button', 'tk-open', 'Macros');
    open.title = `Queue monitor macros for ${id}`;
    open.setAttribute('aria-expanded', 'false');
    const box = el('div', 'tk-box');
    box.hidden = true;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `Macros for ${id}`);
    const head = el('div', 'mcw-head'), x = el('button', 'mcw-x', '×');
    x.title = 'Close';
    x.setAttribute('aria-label', 'Close macros');
    head.append(el('b', null, 'Macros'), x);
    const show = on => {
      box.hidden = !on;
      open.hidden = on;
      open.setAttribute('aria-expanded', String(on));
      if (!on && mcWin && !mcWin.panel && !mcWin.started()) closeMacroWindow();
    };
    box.append(head, macroGrid(() => ({ ticket: id, popup: true }), () => box, () => { show(false); renderTicketPill(); }));
    const result = el('div', 'tk-result');
    result.hidden = true;
    pill.append(open, box, result);
    open.onclick = () => { show(true); box.querySelector('.mc-sq')?.focus(); };
    x.onclick = () => { show(false); open.focus(); };
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { show(false); open.focus(); } });
    return pill;
  }

  function ensureCss() {
    if (document.getElementById('atqm-css')) return;
    const style = el('style', null, CSS);
    style.id = 'atqm-css';
    document.head.append(style);
  }

  function createWidget() {
    if (document.getElementById('atqm') || !document.body || document.body.tagName === 'FRAMESET') return;

    ensureCss();
    const w = el('div');
    w.id = 'atqm';
    w.innerHTML = `
      <div id="atqm-head"><span id="atqm-dot"></span><b>Queue monitor <span class="atqm-beta" title="Queue monitor ${VERSION} (beta)">Beta</span></b>
        <span id="atqm-badge" class="atqm-count"></span>
        <button id="atqm-dashbtn" title="Dashboard (full window)" aria-label="Open the dashboard" hidden>⛶</button>
        <button id="atqm-setbtn" title="Settings" aria-label="Open settings" aria-haspopup="dialog">${svgIcon('cog', 15)}</button>
        <button id="atqm-min" title="Minimise" aria-label="Minimise Queue monitor" aria-expanded="true">–</button></div>
      <div id="atqm-rem"></div>
      <div id="atqm-qs"></div>
      <div id="atqm-lockview"></div>
      <div id="atqm-mini"></div>
      <div id="atqm-health"></div>
      <div id="atqm-body">
        <div id="atqm-page" hidden></div>
        <div id="atqm-tabs" role="tablist" aria-label="Queue monitor views">
          <button role="tab" id="atqm-tab-next" data-tab="next" aria-controls="atqm-panel">Next up</button>
          <button role="tab" id="atqm-tab-overview" data-tab="overview" aria-controls="atqm-panel">Overview</button>
          <button role="tab" id="atqm-tab-macros" data-tab="macros" aria-controls="atqm-panel">Macros</button>
        </div>
        <div id="atqm-panel" role="tabpanel"></div>
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

    const tabs = w.querySelector('#atqm-tabs');
    tabs.querySelectorAll('button').forEach(b => {
      b.onclick = () => { set(K.tab, b.dataset.tab); render(); };
    });
    // Arrow keys move between tabs (only the selected tab is in the Tab order)
    tabs.addEventListener('keydown', e => {
      const list = [...tabs.querySelectorAll('button:not([hidden])')];
      const i = list.indexOf(e.target);
      if (i < 0) return;
      const j = { ArrowRight: (i + 1) % list.length, ArrowLeft: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
      if (j == null) return;
      e.preventDefault();
      set(K.tab, list[j].dataset.tab);
      render();
      list[j].focus();
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
    w.querySelector('#atqm-dashbtn').onclick = openDashboard;
    w.querySelector('#atqm-setbtn').onclick = () => openSettings();

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

  // ---------------------------------------------------------------------------
  // Dashboard (setting "Dashboard button"): the whole window, for keeping SLAs and the tickets without
  // one in view at the same time. Close or Esc returns to the page. Read-only: monitoring carries on
  // in the monitoring tabs.
  // ---------------------------------------------------------------------------
  // Open in this tab: the page it was opened on. A reload of that page keeps it open (so it can stay up
  // on a wall screen); going to another page from Autotask's top bar leaves it closed.
  const DASH_SS = P + 'dash';
  const dashPage = () => location.pathname + location.search;
  const dashOpen = () => { try { return !!CONFIG.dashboard && sessionStorage.getItem(DASH_SS) === dashPage(); } catch { return false; } };
  function openDashboard() { closeMacroWindow(); try { sessionStorage.setItem(DASH_SS, dashPage()); } catch { /* ignore */ } render(); }
  function closeDashboard() {
    try { sessionStorage.removeItem(DASH_SS); } catch { /* ignore */ }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
    render();
  }
  // Registered before the lock's key handling, so Esc works on a locked monitoring tab too. Esc closes the
  // Queue monitor menu first, then a macro's window, then Settings (it sits over the dashboard), unless
  // it's clearing the settings search.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (navMenu) {
      e.preventDefault();
      closeNavMenu(true);
    } else if (mcWin) {
      e.preventDefault();
      e.stopPropagation(); // and not the box it was opened from as well
      closeMacroWindow(true);
    } else if (settingsOpen()) {
      if (e.target?.closest?.('.set-find') && e.target.value) return;
      e.preventDefault();
      closeSettings();
    } else if (document.getElementById('atqm-dash')) closeDashboard();
  }, true);
  addEventListener('resize', () => {
    const d = document.getElementById('atqm-dash'), s = document.getElementById(SET_ID);
    if (d) placeDashboard(d);
    if (s) placeSettings(s);
  });

  let dashTable = false;      // deadlines shown as a table instead of the chart
  let dashAllChanges = false; // the longer change history
  const dueOf = it => it.due || it.dl?.due || null;
  // Tickets in Next up that need you within the hour: overdue, or a deadline in the next 60 minutes
  const needYouWithinHour = items => items.filter(it => it.kind !== 'call' && dueOf(it) && dueOf(it) - Date.now() <= 3600000);

  // The numbers across the top
  function dashboardStats(items) {
    const now = Date.now(), HOUR = 3600000;
    const byId = new Map();
    for (const q of activeQueues().filter(x => x.mode !== 'calls')) {
      for (const t of snapTickets(q) || []) if (!byId.has(t.id)) byId.set(t.id, t);
    }
    const all = [...byId.values()];
    const age = t => t.created || t.firstSeen;
    const overdue = items.filter(it => { const d = dueOf(it); return d && d < now; });
    const nextHour = items.filter(it => { const d = dueOf(it); return d && d >= now && d - now <= HOUR; }).sort((a, b) => dueOf(a) - dueOf(b));
    const waiting = all.filter(t => /^new$/i.test(t.status || '') && !resting(t));
    const pastTarget = CONFIG.responseTarget > 0 ? waiting.filter(t => targetDue(t) && targetDue(t) < now).length : 0;
    const unread = unreadByTicket();
    const changed = all.filter(t => !resting(t) && (unread.get(t.id) || []).some(isChange)).length;
    const high = all.filter(t => isHighPriority(t.priority)).length;
    const acting = all.filter(t => !resting(t)).length;
    const stats = [
      { label: 'Overdue', value: overdue.length, status: overdue.length ? 'critical' : '', icon: 'alert',
        sub: overdue.length ? `longest ${dur(now - Math.min(...overdue.map(dueOf)))}` : 'nothing past due' },
      { label: 'Due in the next hour', value: nextHour.length, status: nextHour.length ? 'warning' : '', icon: 'clock',
        sub: nextHour.length ? `next in ${dur(dueOf(nextHour[0]) - now)}` : 'nothing due' },
      { label: 'Waiting for a first response', value: waiting.length, icon: 'inbox',
        sub: !waiting.length ? 'none in New status'
          : pastTarget ? `${pastTarget} past your ${dur(CONFIG.responseTarget * 60000)} target`
          : `longest ${dur(now - Math.min(...waiting.map(age)))}` },
      { label: 'Changed since you looked', value: changed, icon: 'eye', sub: changed ? 'in Next up' : 'all seen' },
      { label: 'Need action', value: acting, icon: 'list', sub: [`of ${all.length} ticket${all.length === 1 ? '' : 's'}`, high ? `${high} high priority` : ''].filter(Boolean).join(' · ') },
    ];
    if (activeQueues().some(q => q.mode === 'calls')) {
      const calls = activeQueues().filter(q => q.mode === 'calls').flatMap(q => snapTickets(q) || [])
        .filter(c => c.start && c.end > now).sort((a, b) => a.start - b.start);
      const inProgress = calls.find(c => c.start <= now), next = calls.find(c => c.start > now);
      stats.push({ label: 'Service calls', icon: 'phone', value: inProgress ? 'Now' : next ? timeOf(next.start) : '–',
        sub: inProgress ? callLabel(inProgress) : next ? callLabel(next) : 'none coming up' });
    }
    return stats;
  }

  // Deadlines in each of the next 8 hours by the clock (the first runs from now to the hour)
  function deadlineBuckets(items, hours = 8) {
    const now = Date.now();
    const hour = new Date(now);
    hour.setMinutes(0, 0, 0);
    const buckets = [];
    for (let i = 0; i < hours; i++) {
      const from = i ? hour.getTime() + i * 3600000 : now;
      buckets.push({ from, to: hour.getTime() + (i + 1) * 3600000, label: i ? timeOf(from) : 'Now', items: [] });
    }
    for (const it of items) {
      const d = dueOf(it);
      const b = d && d >= now ? buckets.find(x => d >= x.from && d < x.to) : null;
      if (b) b.items.push(it);
    }
    return buckets;
  }
  const niceMax = n => (n <= 4 ? Math.max(1, n) : n <= 10 ? Math.ceil(n / 2) * 2 : Math.ceil(n / 5) * 5);

  // A dashboard card, built like a Settings section: an icon, the title, a short note and any controls
  // across the top, the content below. Returns the card and the box its content goes in.
  function dashCard(ico, title, note, ...tools) {
    const card = el('section', 'dash-card');
    const head = el('div', 'dash-card-h');
    head.append(icon(ico, 15), el('h2', null, title));
    if (note) head.append(el('span', 'dash-count', note));
    if (tools.length) { const t = el('div', 'dash-tools'); t.append(...tools); head.append(t); }
    const body = el('div', 'dash-card-b');
    card.append(head, body);
    return { card, body };
  }
  // A button like the ones in Settings, with an icon
  function dashButton(label, ico, onclick, { cls = '', title = '' } = {}) {
    const b = el('button', 'set-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    if (ico) b.append(icon(ico, 14));
    b.append(label);
    if (title) b.title = title;
    b.onclick = onclick;
    return b;
  }

  // Columns, one per hour, single series. Hover or focus a column for its tickets; Table shows the same.
  function deadlineChart(items) {
    const buckets = deadlineBuckets(items);
    if (!buckets.some(b => b.items.length)) return null; // nothing due: no card
    const seg = el('div', 'set-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Show deadlines as');
    for (const [label, table] of [['Chart', false], ['Table', true]]) {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(dashTable === table));
      b.onclick = () => { dashTable = table; render(); };
      seg.append(b);
    }
    const { card, body } = dashCard('chart', 'Deadlines in the next 8 hours', '', seg);
    const range = b => `${b.label === 'Now' ? 'Now' : b.label}–${timeOf(b.to)}`;
    const describe = it => `${it.t.id} · ${it.due ? it.what : it.dl.what} ${timeOf(dueOf(it))}`;
    if (dashTable) {
      const table = el('table', 'dash-table');
      const hr = el('tr');
      for (const h of ['Time', 'Deadlines', 'Tickets']) hr.append(el('th', null, h));
      table.append(hr);
      for (const b of buckets) {
        const tr = el('tr');
        tr.append(el('td', null, range(b)), el('td', 'num', String(b.items.length)), el('td', null, b.items.map(describe).join(', ')));
        table.append(tr);
      }
      body.append(table);
      return card;
    }
    const max = Math.max(...buckets.map(b => b.items.length));
    const top = niceMax(max);
    const chart = el('div', 'dash-chart');
    for (const v of [0, top / 2, top]) {
      if (v !== Math.round(v)) continue;
      const y = 100 - (v / top) * 100 + '%';
      const line = el('div', v ? 'dash-gl' : 'dash-base');
      line.style.top = y;
      const tick = el('span', 'dash-tick', String(v));
      tick.style.top = y;
      chart.append(line, tick);
    }
    const tip = el('div', 'dash-tip');
    tip.hidden = true;
    const columns = el('div', 'dash-cols');
    const labelled = buckets.findIndex(b => b.items.length === max); // only the tallest column carries its number
    buckets.forEach((b, i) => {
      const n = b.items.length;
      const col = el('div', 'dash-col');
      col.tabIndex = 0;
      col.setAttribute('role', 'img');
      col.setAttribute('aria-label', `${n} deadline${n === 1 ? '' : 's'}, ${range(b)}`);
      if (i === labelled) col.append(el('span', 'dash-cap', String(n)));
      const bar = el('div', 'dash-bar');
      bar.style.height = (n / top) * 100 + '%';
      col.append(bar, el('span', 'dash-xl', b.label));
      const show = () => {
        tip.replaceChildren(el('b', null, `${n} deadline${n === 1 ? '' : 's'}`), el('div', 'atqm-sub', range(b)));
        for (const it of b.items.slice(0, 8)) tip.append(el('div', null, describe(it)));
        if (n > 8) tip.append(el('div', 'atqm-sub', `…and ${n - 8} more`));
        tip.hidden = false;
        const cr = chart.getBoundingClientRect(), r = col.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(r.left - cr.left + r.width / 2 - 100, cr.width - 200)) + 'px';
      };
      const hide = () => { tip.hidden = true; };
      col.addEventListener('pointerenter', show);
      col.addEventListener('focus', show);
      col.addEventListener('pointerleave', hide);
      col.addEventListener('blur', hide);
      columns.append(col);
    });
    chart.append(columns, tip);
    body.append(chart);
    return card;
  }

  // ---- Dashboard tables: Next up and every ticket in My queue, one line per ticket ----
  const cell = (cls, ...kids) => { const c = el('td', cls); c.append(...kids); return c; };
  const relDue = (due, now = Date.now()) => (due < now ? `${dur(now - due)} overdue` : `in ${dur(due - now)}`);
  function tableHead(names) {
    const tr = el('tr');
    for (const h of names) tr.append(el('th', null, h));
    return tr;
  }
  function groupRow(label, n, span) {
    const tr = el('tr', 'dash-grp');
    const c = el('td', null, `${label} · ${n}`);
    c.colSpan = span;
    tr.append(c);
    return tr;
  }
  function ticketCell(t, changes) {
    const c = cell('tk', ticketLink(t.id, t));
    if (changes.length) c.append(seenButton(t));
    return c;
  }
  function statusCell(t, changes) {
    const c = cell('', statusWord(t.status || '–'));
    const change = changes.filter(isChange).pop();
    if (change) c.append(el('span', 'was', ` was ${statusPair(change)[0] || '?'}`));
    return c;
  }
  const priorityCell = p => cell('', p ? priorityWord(p) : '–');
  // Title and account on one line; the cell takes the spare width and cuts off long titles (full text on hover)
  function titleCell(title, account) {
    const c = cell('fill', el('span', 'tt', title || '–'));
    if (account) c.append(el('span', 'acct', ` · ${account}`));
    c.title = [title, account].filter(Boolean).join(' · ');
    return c;
  }
  function tableCard(table) {
    const wrap = el('div', 'dash-tablewrap');
    wrap.append(table);
    return wrap;
  }

  // Next up as a table, grouped as in the window
  function nextUpTable(items) {
    const qs = activeQueues();
    const urgent = urgentCount(items);
    const { card, body } = dashCard('zap', 'Next up', urgent ? `${urgent} need${urgent === 1 ? 's' : ''} you now` : 'all clear');
    if (!qs.length) {
      body.append(el('div', 'atqm-empty', 'No queues tracked. Open a queue in My Workspace & Queues and press Start tracking.'));
      return card;
    }
    const hint = basisHint(qs);
    if (hint) body.append(el('div', 'atqm-hint', hint));
    if (!items.length) {
      body.append(el('div', 'atqm-empty', 'Nothing needs action right now.'));
      return card;
    }
    const showQueue = qs.length > 1;
    const names = ['When', 'Ticket', 'Status', 'Priority', ...(showQueue ? ['Queue'] : []), 'Title', 'Deadline'];
    const table = el('table', 'dash-table dash-tt dash-nt');
    table.append(tableHead(names));
    for (const [g, title] of NEXT_GROUPS) {
      const group = items.filter(it => it.g === g);
      if (!group.length) continue;
      table.append(groupRow(title, group.length, names.length));
      for (const it of group.slice(0, 25)) table.append(it.kind === 'call' ? callTableRow(it, showQueue) : nextTableRow(it, showQueue));
      if (group.length > 25) {
        const tr = el('tr');
        const c = el('td', 'atqm-empty', `…and ${group.length - 25} more`);
        c.colSpan = names.length;
        tr.append(c);
        table.append(tr);
      }
    }
    body.append(tableCard(table));
    return card;
  }
  function nextTableRow(it, showQueue) {
    const t = it.t, now = Date.now();
    // The left edge: overdue and due soon as everywhere, otherwise what you're doing or what's waiting
    const state = it.due ? dueState(it.due, it.soon) : '';
    const tr = el('tr', state === 'overdue' || state === 'soon' ? state : it.g === 'doing' ? 'doing' : it.g === 'waiting' ? 'fresh' : '');
    const when = it.due ? relDue(it.due, now) : it.g === 'doing' ? 'in progress' : `waiting ${dur(now - it.age)}`;
    const due = it.due || it.dl?.due, what = it.due ? it.what : it.dl?.what;
    tr.append(cell('when', when), ticketCell(t, it.changes), statusCell(t, it.changes), priorityCell(t.priority));
    if (showQueue) tr.append(cell('', el('span', 'atqm-tag', qName(it.q))));
    tr.append(titleCell(t.title, t.account), cell('dl', due ? `${what} · ${dueAt(due)}` : '–'));
    return tr;
  }
  function callTableRow(it, showQueue) {
    const c = it.c, now = Date.now();
    const tr = el('tr', c.start <= now ? 'callnow' : 'call');
    tr.append(cell('when', c.start <= now ? `started ${dur(now - c.start)} ago` : `in ${dur(c.start - now)}`),
      cell('tk', callLink(c, 'Service call')), cell('', c.status || '–'), priorityCell(c.priority));
    if (showQueue) tr.append(cell('', el('span', 'atqm-tag', qName(it.q))));
    tr.append(titleCell(c.description || '(no description)', c.account), cell('dl', c.start ? `${timeOf(c.start)}–${timeOf(c.end)}` : '–'));
    return tr;
  }

  // Every ticket in a queue tracked for all changes (My queue), so you can work from the dashboard: those
  // that need action first, most urgent at the top, then those resting in a status that needs nothing yet
  function ticketTable(q) {
    const tickets = snapTickets(q);
    const { card, body } = dashCard('list', qName(q), tickets ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}` : '');
    if (!tickets) {
      body.append(el('div', 'atqm-empty', `No data yet. Fills in after the first scan of ${qWhere(q)}.`));
      return card;
    }
    if (!tickets.length) {
      body.append(el('div', 'atqm-empty', 'No tickets in this queue.'));
      return card;
    }
    const unread = unreadByTicket();
    const rows = tickets.map(t => ({ t, d: ticketDeadline(t, q, { all: true }), age: t.created || t.firstSeen, changes: unread.get(t.id) || [] }));
    const byUrgency = (a, b) => (a.d ? a.d.due : Infinity) - (b.d ? b.d.due : Infinity) || a.age - b.age;
    const act = rows.filter(r => !resting(r.t)).sort(byUrgency);
    const rest = rows.filter(r => resting(r.t)).sort((a, b) => clean(a.t.status).localeCompare(clean(b.t.status)) || a.age - b.age);
    // A deadline column only when some ticket has one
    const withDeadline = rows.some(r => r.d);
    const names = ['Ticket', 'Status', 'Priority', 'Title', ...(withDeadline ? ['Next deadline'] : []), 'Age'];
    const table = el('table', 'dash-table dash-tt dash-mq');
    table.append(tableHead(names));
    for (const [name, list] of [['Needs action', act], ['No action needed', rest]]) {
      if (!list.length) continue;
      table.append(groupRow(name, list.length, names.length));
      for (const r of list) table.append(ticketRow(r, withDeadline));
    }
    body.append(tableCard(table));
    return card;
  }
  function ticketRow({ t, d, age, changes }, withDeadline) {
    const now = Date.now();
    const tr = el('tr', resting(t) ? 'resting' : d ? dueState(d.due, d.soon) : '');
    tr.append(ticketCell(t, changes), statusCell(t, changes), priorityCell(t.priority), titleCell(t.title, t.account));
    if (withDeadline) {
      const due = cell('dl');
      if (d) {
        due.append(el('span', 'when', relDue(d.due, now)), ` · ${d.what}`);
        due.title = dueAt(d.due);
      } else {
        due.append('–');
      }
      tr.append(due);
    }
    tr.append(cell('num', age ? dur(now - age) : '–'));
    return tr;
  }

  function dashQueueCard(q) {
    const h = health(q), st = get(q.state, {});
    const card = el('div', 'dash-q');
    const head = el('div', 'dash-qh');
    head.append(el('span', 'atqm-ml ' + h.cls), el('span', 'atqm-sr', (STATUS_WORDS[h.cls] || '') + ': '),
      el('b', null, qName(q)), el('span', 'atqm-sub', MODES[q.mode].label));
    if (st.count != null) head.append(el('span', 'dash-qn', st.count + (st.partial ? '+' : '')));
    card.append(head, el('div', h.cls === 'warn' ? 'dash-qs atqm-warn' : 'dash-qs atqm-sub', h.text));
    if (q.mode !== 'calls' && snapTickets(q)) card.append(statusBreakdown(q));
    return card;
  }

  const OUR_BOXES = '#atqm-dash, #atqm, #atqm-settings, #atqm-lock, #atqm-tkpill, #atqm-macrobar, #atqm-mcwin, #atqm-navbtn, #atqm-navmenu';
  function pageAt(x, y) {
    if (typeof document.elementsFromPoint !== 'function') return [];
    return document.elementsFromPoint(x, y).filter(e => e !== document.documentElement && e !== document.body && !e.closest(OUR_BOXES));
  }
  // The z-index something paints at against the rest of the page: the outermost one set around it
  function zOf(e) {
    let z = 0;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.position !== 'static' && s.zIndex !== 'auto') z = parseInt(s.zIndex, 10) || 0;
    }
    return z;
  }
  // Autotask's own bar across the top of the page (New, search, its menus). Returns its bottom edge, or null if
  // there's none. Its header (AT.sel.topBar) where the page has one, wherever it starts: a notice above it
  // pushes it down. Otherwise by where it is: the full-width strips stacked at the very top of the window.
  function topBarBottom() {
    const w = innerWidth;
    let bottom = 0;
    for (const h of document.querySelectorAll(AT.sel.topBar)) {
      const r = h.getBoundingClientRect();
      if (notOurs(h) && r.width >= w * 0.6 && r.height > 0 && r.bottom > 0 && r.top < 200) bottom = Math.max(bottom, r.bottom);
    }
    if (bottom) return Math.round(bottom);
    // Every element at the point counts, not just the one in front: something transparent laid over the page
    // mustn't hide the bar. A strip found, look again just below it, for a bar under a notice.
    for (let y = 3, i = 0; i < 3 && y < 200; i++) {
      let found = 0;
      for (const x of [w * 0.25, w * 0.5, w * 0.75]) {
        for (const e of pageAt(x, y)) {
          for (let n = e; n && n !== document.body; n = n.parentElement) {
            const r = n.getBoundingClientRect();
            if (r.top <= y && r.bottom > y && r.height >= 24 && r.height <= 160 && r.width >= w * 0.6) found = Math.max(found, r.bottom);
          }
        }
      }
      if (!found) break;
      bottom = found;
      y = found + 3;
    }
    return bottom ? Math.round(bottom) : null;
  }
  // The dashboard and Settings cover the page below Autotask's top bar, so New, search and the menus stay
  // usable. They sit just above the page they cover (Settings a step higher, over the dashboard), and so under
  // the bar's drop-down menus. Full screen, and a locked monitoring tab (greyed out, bar and all), get the
  // whole window, over everything.
  function placeBelowBar(box, step, whole = false) {
    const bar = whole || lockActive() ? null : topBarBottom();
    const below = bar ? Math.max(0, ...pageAt(innerWidth / 2, bar + (innerHeight - bar) / 2).slice(0, 5).map(zOf)) : 0;
    box.style.top = bar ? bar + 'px' : '';
    box.style.zIndex = bar ? String(below + step) : '';
  }
  const placeDashboard = d => placeBelowBar(d, 1, document.fullscreenElement === d);
  const placeSettings = d => placeBelowBar(d, 2);

  function renderDashboard(items) {
    let d = document.getElementById('atqm-dash');
    if (!isTop || !dashOpen()) { d?.remove(); return; }
    const opening = !d;
    if (opening) {
      d = el('div');
      d.id = 'atqm-dash';
      d.tabIndex = -1;
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', 'Queue monitor dashboard');
      document.body.append(d);
    }
    placeDashboard(d);
    const scroll = d.querySelector('.dash-main')?.scrollTop || 0;
    d.replaceChildren();

    // The same header bar as Settings: icon, title and what it is, then the buttons and close
    const head = el('header', 'set-head');
    const brand = el('div', 'set-brand');
    const titles = el('div');
    titles.append(el('h1', null, 'Dashboard'), el('div', 'set-sub', `Queue monitor · updated ${timeOf(Date.now())}`));
    brand.append(icon('grid', 18), titles);
    const actions = el('div', 'dash-actions');
    const fullNow = document.fullscreenElement === d;
    const full = dashButton(fullNow ? 'Exit full screen' : 'Full screen', fullNow ? 'minimize' : 'maximize', () => {
      try { if (document.fullscreenElement) document.exitFullscreen(); else d.requestFullscreen(); } catch { /* not allowed */ }
      setTimeout(render, 300);
    }, { title: 'Use the whole screen' });
    full.hidden = typeof d.requestFullscreen !== 'function';
    const close = el('button', 'set-x');
    close.type = 'button';
    close.title = 'Close (Esc)';
    close.setAttribute('aria-label', 'Close the dashboard');
    close.append(icon('x', 18));
    close.onclick = closeDashboard;
    actions.append(dashButton('Scan now', 'refresh', requestScan, { title: 'Refresh every tracked queue now' }), full,
      dashButton('Settings', 'cog', () => openSettings()), close);
    head.append(brand, actions);
    const main = el('div', 'dash-main');
    const inner = el('div', 'dash-inner');
    main.append(inner);
    d.append(head, main);
    for (const text of [...globalWarnings(), ...(localNote ? [localNote] : [])]) {
      const note = el('div', 'dash-note');
      note.append(icon('alert', 15), el('span', null, text));
      inner.append(note);
    }

    // The numbers, each with its icon (tinted red or amber when it needs you)
    const kpis = el('div', 'dash-kpis');
    for (const s of dashboardStats(items)) {
      const tile = el('div', 'dash-kpi' + (s.status ? ' ' + s.status : ''));
      const label = el('div', 'l');
      label.append(icon(s.icon || 'list', 15), el('span', null, s.label));
      tile.append(label, el('div', 'v', String(s.value)));
      if (s.sub) tile.append(el('div', 's', s.sub));
      kpis.append(tile);
    }
    inner.append(kpis);

    // Two columns that each fill downwards on their own (no row lines them up, so no gaps): what to do
    // and every ticket on the left, the wider picture on the right
    const columns = el('div', 'dash-layout');
    const left = el('div', 'dash-stack');
    left.append(nextUpTable(items));
    for (const q of activeQueues().filter(x => x.mode === 'full')) left.append(ticketTable(q));
    const right = el('div', 'dash-stack');
    const queues = dashCard('layout', 'Queues', '');
    queues.body.classList.add('rows');
    for (const q of activeQueues()) queues.body.append(dashQueueCard(q));
    if (!activeQueues().length) queues.body.append(el('div', 'dash-q atqm-empty', 'No queues tracked.'));
    const all = get(K.alerts, []);
    const unread = all.filter(a => !a.read).length;
    const markAll = unread ? [dashButton('Mark all read', '', () => {
      set(K.alerts, get(K.alerts, []).map(a => ({ ...a, read: true })));
      render();
    }, { cls: 'sm' })] : [];
    const changes = dashCard('bell', 'Recent changes', unread ? `${unread} unread` : '', ...markAll);
    const shown = dashAllChanges ? CONFIG.displayAlerts : 15;
    changes.body.append(all.length ? alertList(all.slice(-shown).reverse()) : el('div', 'atqm-empty', 'No changes since monitoring started.'));
    if (!dashAllChanges && all.length > shown) {
      const more = el('button', 'atqm-more', `Show more (up to ${Math.min(all.length, CONFIG.displayAlerts)})`);
      more.onclick = () => { dashAllChanges = true; render(); };
      changes.body.append(more);
    }
    const chart = deadlineChart(items);
    right.append(queues.card);
    if (chart) right.append(chart);
    right.append(changes.card);
    columns.append(left, right);
    inner.append(columns);
    main.scrollTop = scroll;
    if (opening) d.focus();
  }

  // ---------------------------------------------------------------------------
  // The Queue monitor menu in Autotask's top bar, after its own menus (Dashboards, My, Calendar): the
  // dashboard, Settings, and showing or hiding the Queue monitor window and the ticket pop-ups' Macros button.
  // Its button is a copy of Autotask's own (its classes copied), so it looks like the menus beside it; the
  // drop-down uses Autotask's colour classes, with ours underneath in case they're gone.
  // ---------------------------------------------------------------------------
  const NAV_BUTTON = 'h-full min-w-4.5rem flex-none flex items-center px-4 text-body color-text-primary truncate cursor-pointer outline-none ' +
    'hover:bg-white/18 focus-visible:bg-white/18'; // Autotask's, for a page whose menus can't be copied
  const NAV_ITEM = 'atqm-navitem min-h-8 w-full flex items-center gap-2 px-2 py-1 outline-none cursor-pointer text-body color-text-primary ' +
    'bg-background-primary hover:bg-background-hover focus-visible:bg-background-hover';
  let navMenu = null; // { menu, btn } while it's open

  // Put the button in the top bar, or back in it after Autotask redraws the bar. Pages without the bar
  // (older pages, ticket pop-ups) don't get one.
  function ensureNavMenu() {
    if (!isTop || !document.body) return;
    const header = document.querySelector(AT.sel.topBar);
    let btn = document.getElementById('atqm-navbtn');
    if (btn && header?.contains(btn)) return;
    btn?.remove();
    closeNavMenu();
    if (!header) return;
    ensureCss();
    const like = header.querySelector(AT.sel.topBarMenu);
    btn = el('button', `${like?.className || NAV_BUTTON} max-sm:hidden`);
    btn.type = 'button';
    btn.id = 'atqm-navbtn';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const label = el('div', 'flex-grow atqm-navlabel');
    label.append(el('div', 'atqm-navname', `Autotask Queue Monitor ${VERSION === 'dev' ? '(dev)' : 'v' + VERSION}`),
      el('div', 'atqm-navby', 'By Adam Connell'));
    btn.append(label, el('span', like?.querySelector('[class*="fa-chevron"]')?.className || 'fa-chevron-down fa-regular'));
    btn.onclick = () => (navMenu ? closeNavMenu() : openNavMenu(btn));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); openNavMenu(btn, true); } });
    const section = header.querySelector(AT.sel.topBarNav);
    if (section) section.after(btn);
    else (header.firstElementChild || header).append(btn);
  }
  const navMenuThere = () => !!document.getElementById('atqm-navbtn');

  function openNavMenu(btn, focusFirst = false) {
    closeNavMenu();
    const menu = el('div', 'atqm-navmenu bg-background-primary border border-solid border-border-primary rounded');
    menu.id = 'atqm-navmenu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Queue monitor');
    const item = (label, ico, run) => {
      const b = el('button', NAV_ITEM);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.append(icon(ico, 15), el('span', null, label));
      b.onclick = () => { closeNavMenu(); run(); };
      menu.append(b);
    };
    if (CONFIG.dashboard) item('Dashboard', 'grid', openDashboard);
    item('Settings', 'cog', () => openSettings());
    if (document.getElementById('atqm')) {
      item(CONFIG.showWindow ? 'Hide Queue monitor window' : 'Show Queue monitor window', 'layout', () => toggleSetting('showWindow'));
    }
    item(CONFIG.ticketMacroButton ? 'Hide Macros button on ticket pop-ups' : 'Show Macros button on ticket pop-ups', 'zap',
      () => toggleSetting('ticketMacroButton'));
    // Up and down move between the items
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
      const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
      if (e.key === 'Tab') closeNavMenu();
      if (j == null) return;
      e.preventDefault();
      items[(j + items.length) % items.length].focus();
    });
    document.body.append(menu);
    const r = btn.getBoundingClientRect();
    Object.assign(menu.style, { left: Math.max(4, Math.min(r.left, innerWidth - menu.offsetWidth - 4)) + 'px', top: r.bottom + 'px' });
    btn.setAttribute('aria-expanded', 'true');
    navMenu = { menu, btn };
    if (focusFirst) menu.querySelector('button')?.focus();
  }
  function closeNavMenu(restore = false) {
    if (!navMenu) return;
    const { menu, btn } = navMenu;
    navMenu = null;
    menu.remove();
    btn.setAttribute('aria-expanded', 'false');
    if (restore && btn.isConnected) btn.focus();
  }
  // A click anywhere else closes it, and so does going into Autotask's frame (which takes the focus from this page)
  addEventListener('pointerdown', e => { if (navMenu && !e.target.closest?.('#atqm-navmenu, #atqm-navbtn')) closeNavMenu(); }, true);
  addEventListener('blur', () => closeNavMenu());

  // Turn a yes/no setting over straight away (from the Queue monitor menu): saved, so every tab follows
  function toggleSetting(key) {
    if (!set(K.settings, { ...get(K.settings, {}), [key]: !CONFIG[key] })) return;
    loadSettings();
    setForm?.refresh();
    render();
    renderTicketPill();
  }

  // ---- Lock monitoring tabs ----
  const UNLOCK_KEY = P + 'unlockedUntil';
  const unlockedUntil = () => { try { return +sessionStorage.getItem(UNLOCK_KEY) || 0; } catch { return 0; } };
  // Is this tab a locked monitoring tab? (the frame doing the monitoring owns the lock; the top window learns it from the frame)
  function lockActive(pg = pageInfo()) {
    if (!CONFIG.lockMonitorTabs || !get(K.enabled, false) || Date.now() < unlockedUntil()) return false;
    return trackedQueues().some(ownsLock) || !!(pg.q && pg.owns) || !!pg.ownsAny;
  }
  // Keyboard input to the page is swallowed while locked (mouse input is stopped by the overlay).
  // Our automations never use the keyboard, so they're unaffected.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    addEventListener(type, e => {
      if (!lockActive()) return;
      if (e.target && e.target.closest && e.target.closest('#atqm, #atqm-dash, #atqm-settings')) return; // the monitor's own windows still work
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
    const showBtn = isTop && CONFIG.lockMonitorTabs && (pg.ownsAny || (pg.q && pg.owns));
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

  const STATUS_WORDS = { ok: 'OK', warn: 'Needs attention', off: 'Paused' };

  function render() {
    const w = document.getElementById('atqm');
    const pg = pageInfo();

    // Start/stop monitoring promptly when this tab moves onto or off a tracked queue
    // (at most every 5 s, in case another tab holds the queue without the record showing it yet)
    if (!pg.remote && !rotationTab() && get(K.enabled, false) && !busy && Date.now() - lastTick > 5000) {
      const wantsLock = pg.q && !pg.foreign && !pg.owns && !pg.choose;
      const movedOff = [...owned].some(k => k !== pg.q?.key);
      if (wantsLock || movedOff) setTimeout(() => tick(), 0);
    }
    reportPage(pg);
    ensureNavMenu();
    if (!w) return;

    const monitoring = !!(pg.q && pg.owns) || !!pg.ownsAny;
    if (monitoring && !wasMonitoring) w.classList.remove('min');
    renderLock(w, pg);
    // Hidden (setting "Queue monitor window") only where the Queue monitor menu can bring it back, and never
    // on a locked monitoring tab, where it's all there is
    w.classList.toggle('atqm-off', !CONFIG.showWindow && navMenuThere() && !w.classList.contains('locked'));
    const rounds = rotationTab();
    w.classList.toggle('lv-calls', rounds ? activeQueues().some(q => q.mode === 'calls') : !!(pg.q && pg.q.mode === 'calls'));
    if (w.classList.contains('locked')) {
      if (rounds) renderRoundsView(w.querySelector('#atqm-lockview'));
      else if (pg.q) renderLockView(w.querySelector('#atqm-lockview'), pg.q);
    }
    wasMonitoring = monitoring;

    renderReminders(w.querySelector('#atqm-rem'));
    renderQuickStart(w.querySelector('#atqm-qs'));

    const qs = activeQueues();
    const box = w.querySelector('#atqm-health');
    box.replaceChildren();
    const hs = qs.map(q => [q, health(q)]);
    const warnings = globalWarnings();
    const nextItems = nextUpItems();
    const urgent = urgentCount(nextItems);

    // Minimised: one line, a light + name + ticket count per queue
    const mini = w.querySelector('#atqm-mini');
    mini.replaceChildren();
    for (const [q, h] of hs) {
      const st = get(q.state, {});
      const item = el('span', 'atqm-mq');
      item.title = h.text;
      item.append(el('span', 'atqm-ml ' + h.cls), el('span', 'atqm-sr', (STATUS_WORDS[h.cls] || '') + ': '), el('span', null, qName(q)),
                  el('b', null, st.count == null ? '–' : st.count + (st.partial ? '+' : '')));
      mini.append(item);
    }
    if (!qs.length) mini.append(el('span', 'atqm-mq', 'No queues tracked'));
    // An untracked queue page: point at the Start tracking buttons hidden in the expanded view
    if (pg.cur && !pg.q && (!pg.isCalls || CONFIG.serviceCalls)) {
      const note = el('button', 'atqm-mnote', `${pg.cur.nav} isn't tracked. Expand to track it.`);
      note.onclick = () => { w.classList.remove('min'); render(); };
      mini.append(note);
    } else if (pg.q && pg.choose && !monitorPending(pg.q) && !launchKey() && !(CONFIG.oneTab && rotatorAlive())) {
      const note = el('button', 'atqm-mnote', `Nobody is monitoring ${qName(pg.q)}. Expand to choose where.`);
      note.onclick = () => { w.classList.remove('min'); render(); };
      mini.append(note);
    } else if (urgent) {
      const next = el('button', 'atqm-mnote atqm-mnext');
      next.append(el('b', null, 'Next: '), nextSummary(nextItems[0]));
      next.title = urgent > 1 ? `${urgent - 1} more in Next up` : 'Open Next up';
      next.onclick = () => { set(K.tab, 'next'); w.classList.remove('min'); render(); };
      mini.append(next);
    }
    const minimised = w.classList.contains('min');
    const minBtn = w.querySelector('#atqm-min');
    minBtn.textContent = minimised ? '+' : '–';
    minBtn.title = minimised ? 'Expand' : 'Minimise';
    minBtn.setAttribute('aria-label', minimised ? 'Expand Queue monitor' : 'Minimise Queue monitor');
    minBtn.setAttribute('aria-expanded', String(!minimised));
    w.style.opacity = w.classList.contains('locked') ? '1' : String((minimised ? CONFIG.opacityMin : CONFIG.opacity) / 100);
    if (w.style.top && !w.classList.contains('locked')) { const p = savedPos(); if (p) place(w, p.right, p.top); } // re-clamp after size change
    for (const [q, h] of hs) box.append(healthLine(h, qs.length > 1 ? qName(q) + ': ' : ''));
    for (const text of warnings) box.append(el('div', 'warn', text));
    if (!qs.length) box.append(el('div', 'warn', 'No queues tracked.'));
    if (localNote) box.append(el('div', null, localNote));
    w.dataset.health = !qs.length || warnings.length || hs.some(([, h]) => h.cls === 'warn') ? 'warn'
      : hs.every(([, h]) => h.cls === 'ok') ? 'ok' : 'off';
    w.querySelector('#atqm-toggle').textContent = get(K.enabled, false) ? 'Pause' : 'Start';

    renderPageBanner(w.querySelector('#atqm-page'), pg);
    w.querySelector('#atqm-dashbtn').hidden = !CONFIG.dashboard;
    renderDashboard(nextItems);

    // The red count: tickets that need you within the hour (the unread changes are counted under Recent changes)
    const hot = needYouWithinHour(nextItems);
    const overdue = hot.filter(it => dueOf(it) < Date.now()).length;
    const badge = w.querySelector('#atqm-badge');
    badge.textContent = hot.length;
    badge.style.display = hot.length ? '' : 'none';
    const hotText = `${hot.length} ticket${hot.length === 1 ? ' needs' : 's need'} you within the hour` +
      (overdue ? `: ${overdue} overdue${hot.length > overdue ? `, ${hot.length - overdue} due soon` : ''}` : '');
    badge.title = hotText;
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', hotText);

    // Next up is the first tab; a saved 'changes' tab (before 0.9) now lives in Next up, and a saved
    // 'settings' tab (before 0.14) is its own window behind the cog
    let tab = get(K.tab, 'next');
    if (!['next', 'overview', 'macros'].includes(tab)) tab = 'next';
    if (mcWin?.panel && (tab !== 'macros' || minimised || w.classList.contains('atqm-off'))) closeMacroWindow(); // its square is out of sight
    const job = macroJob();
    const macroLeft = job && !job.finished ? job.items.filter(i => MACRO_ACTIVE.has(i.state) || i.state === 'waiting').length : 0;
    const TAB_LABELS = { next: urgent ? `Next up (${urgent})` : 'Next up', overview: 'Overview', macros: macroLeft ? `Macros (${macroLeft} to go)` : 'Macros' };
    w.querySelectorAll('#atqm-tabs button').forEach(b => {
      const selected = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
      b.textContent = TAB_LABELS[b.dataset.tab] || b.dataset.tab;
    });

    const panel = w.querySelector('#atqm-panel');
    panel.setAttribute('aria-labelledby', 'atqm-tab-' + tab);
    panel.dataset.tab = tab;
    const scroll = panel.scrollTop;
    if (tab === 'macros') {
      renderMacros(panel, pg); // kept between redraws, not rebuilt
    } else {
      panel.replaceChildren();
      if (tab === 'next') renderNextUp(panel, nextItems);
      else renderOverview(panel, pg);
    }
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
      if (slot && await claim(K.pings, c.id, slot)) callNotify(c, slot);
    }
    // Tidy reminder bookkeeping for calls that ended over a day ago
    const known = new Map(trackedCalls().map(c => [c.id, c]));
    for (const key of [K.pings, K.dismissed]) {
      const m = { ...get(key, {}) };
      let changed = false;
      for (const id of Object.keys(m)) {
        const c = known.get(id);
        if (!c || (c.end && Date.now() - c.end > 86400000)) { delete m[id]; changed = true; }
      }
      if (changed) set(key, m);
    }
    if (rems.length || document.querySelector('#atqm-rem')?.childElementCount) renderSoon();
  }

  // A monitor that stops is easy to miss, so one tab sends a single "stopped updating" alert when a
  // queue goes quiet. Only outages noticed as they happen count: opening Autotask in the morning
  // doesn't alert about last night.
  async function healthTicker() {
    if (!isTop || !get(K.enabled, false) || (!CONFIG.notify && !CONFIG.sound)) return;
    const now = Date.now();
    for (const q of activeQueues()) {
      const st = get(q.state, null);
      const age = st?.lastScan ? now - st.lastScan : 0;
      if (!age || age <= scanStaleMs(q) || age > scanStaleMs(q) + 10 * 60000) continue;
      if (!(await claim(K.healthPinged, q.key, st.lastScan))) continue;
      if (CONFIG.sound) beep(true);
      if (CONFIG.notify && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(`Queue monitor: ${qName(q)} stopped updating`, { body: health(q).text });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* not allowed here */ }
      }
    }
  }

  // The browser blocked a tab the monitor opened (any kind): say so until it's fixed or dismissed
  function popupNotice() {
    const p = get(K.popups, null);
    if (!popupsBlocked() || p.dismissed) return null;
    const r = el('div', 'atqm-qsbox atqm-popwarn');
    r.append(el('b', null, 'Your browser is blocking pop-ups from Autotask'));
    r.append(el('div', 'atqm-sub', 'So Quick start and Start tracking only get one new tab per click. To fix it, click the pop-up ' +
      'icon at the right of the address bar and choose to always allow pop-ups from autotask.net.'));
    const btns = el('div', 'atqm-qsbtns');
    const ok = el('button', null, 'Got it');
    ok.onclick = () => { set(K.popups, { ...p, dismissed: true }); render(); };
    btns.append(ok);
    if (!CONFIG.oneTab) {
      const all = el('button', null, 'One tab for all queues');
      all.title = 'Turns on "Monitor all queues from one tab" in Settings: it needs only one new tab';
      all.onclick = () => {
        set(K.settings, { ...get(K.settings, {}), oneTab: true });
        loadSettings();
        if (idleQueues().length) quickStartOneTab(false);
        render();
      };
      btns.append(all);
    }
    r.append(btns);
    return r;
  }

  function renderQuickStart(box) {
    if (!box) return;
    box.replaceChildren();
    if (!isTop || launchKey() || rotationTab()) return;
    const idle = idleQueues();
    const r = el('div', 'atqm-qsbox');
    const btns = el('div', 'atqm-qsbtns');
    const next = idle.find(queueUrl);
    const blockedBox = !CONFIG.oneTab && next && Date.now() - qsBlockedAt < 10 * 60000;
    if (!blockedBox) { const notice = popupNotice(); if (notice) box.append(notice); }
    if (Date.now() < get(K.qsSnooze, 0) || !idle.length || (CONFIG.oneTab && rotatorAlive())) return;
    if (blockedBox) {
      // The browser let Quick start open only some tabs: open the rest one per click, or switch to one tab
      r.append(el('b', null, `Your browser blocked ${idle.length === 1 ? 'a queue tab' : `${idle.length} queue tabs`}: ${idle.map(qName).join(', ')}`));
      r.append(el('div', 'atqm-sub', 'Allow pop-ups for autotask.net (the icon at the right of the address bar) so Quick start can open ' +
        'them all at once. Or open them one at a time, or use one tab for all queues.'));
      const one = el('button', 'atqm-qsgo', `Open ${qName(next)}`);
      one.onclick = () => { if (!openMonitorTab(next, queueUrl(next))) flashNote(BLOCKED, 10000); render(); };
      const all = el('button', null, 'One tab for all queues');
      all.title = 'Turns on "Monitor all queues from one tab" in Settings and opens that tab';
      all.onclick = () => {
        set(K.settings, { ...get(K.settings, {}), oneTab: true });
        loadSettings();
        quickStartOneTab(false);
        render();
      };
      btns.append(one, all);
      const later = el('button', null, 'Not now');
      later.onclick = () => { qsBlockedAt = 0; set(K.qsSnooze, Date.now() + 8 * 3600000); render(); };
      btns.append(later);
      r.append(btns);
      box.append(r);
      return;
    }
    r.append(el('b', null, `${idle.length} tracked queue${idle.length > 1 ? 's aren\'t' : ' isn\'t'} being monitored`));
    r.append(el('div', 'atqm-sub', idle.map(qName).join(', ')));
    if (idle.some(queueUrl)) {
      const go = el('button', 'atqm-qsgo', 'Quick start');
      go.title = CONFIG.oneTab ? 'Open one tab that monitors all your queues' : 'Open a tab for each queue and start monitoring';
      go.onclick = quickStart;
      btns.append(go);
    } else {
      // Quick start has nowhere to open them yet, so don't offer a button that can't do what it says
      r.append(el('div', 'atqm-sub', 'Open My Workspace & Queues once and Quick start can open them for you.'));
      if (!get(K.enabled, false)) {
        const on = el('button', 'atqm-qsgo', 'Turn on monitoring');
        on.onclick = () => { set(K.enabled, true); render(); };
        btns.append(on);
      }
    }
    const later = el('button', null, 'Not now');
    later.onclick = () => { set(K.qsSnooze, Date.now() + 8 * 3600000); render(); };
    btns.append(later);
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
        set(K.dismissed, { ...get(K.dismissed, {}), [c.id]: Date.now() });
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
  let lastReportHad = false;

  // Messages always name the origin they're for. A frame learns the top window's origin directly
  // (same origin), from a message the top window sent, or from ancestorOrigins; until then it sends
  // only a 'hello?' that carries nothing, and the top window's reply tells it.
  const frameOrigins = new WeakMap(); // window -> the origin it last messaged us from
  let topOriginKnown = null;
  function topOrigin() {
    try { return W.top.location.origin; } catch { /* another origin */ }
    if (topOriginKnown) return topOriginKnown;
    const anc = location.ancestorOrigins;
    return anc && anc.length ? anc[anc.length - 1] : null;
  }
  function postToTop(msg) {
    const origin = topOrigin();
    try {
      if (origin) W.top.postMessage(msg, origin);
      else W.top.postMessage({ atqm: 'hello?' }, '*');
    } catch { /* ignore */ }
  }
  function postToFrame(win, msg) {
    const origin = win && frameOrigins.get(win);
    if (!origin) return;
    try { win.postMessage(msg, origin); } catch { /* frame gone */ }
  }

  // A frame showing a queue, any other list of tickets, or a ticket tells the outer page (whose Queue monitor
  // window has the Macros tab), and once more when it stops showing one
  function reportPage(pg) {
    if (isTop || pg.remote) return;
    const has = !!(pg.cur || pg.grid || pg.ticket);
    if (!has && !lastReportHad) return;
    lastReportHad = has;
    postToTop({
      atqm: 'page', ts: Date.now(), cur: pg.cur || null, qKey: pg.q?.key || null, owns: !!pg.owns, foreign: !!pg.foreign, ownsAny: !!pg.ownsAny,
      choose: !!pg.choose, isCalls: !!pg.isCalls, url: location.href, storageFail: storageFail?.ts || 0, ticked: pg.ticked || [],
      grid: !!pg.grid, ticket: pg.ticket || null,
    });
  }

  const fromAutotask = origin => { try { return /(^|\.)autotask\.net$/i.test(new URL(origin).hostname); } catch { return false; } };
  addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m !== 'object' || !m.atqm || !fromAutotask(e.origin)) return;
    if (e.source) frameOrigins.set(e.source, e.origin);
    if (e.source && e.source === W.top) topOriginKnown = e.origin;
    if (m.atqm === 'hello?' && isTop) {
      try { e.source.postMessage({ atqm: 'hello' }, e.origin); } catch { /* frame gone */ }
    } else if (m.atqm === 'page' && isTop) {
      remotePage = { ...m, ts: Date.now(), source: e.source, url: isAutotaskUrl(m.url) ? m.url : null };
      pageCache.t = 0;
      renderSoon();
    } else if (m.atqm === 'note' && isTop) {
      localNote = String(m.text || '');
      render();
    } else if (m.atqm === 'takeover' && !isTop) {
      const q = trackedQueues().find(x => x.key === m.qKey);
      if (q && pageInfo(true).q?.key === q.key) takeOver(q);
    } else if (m.atqm === 'diag' && !isTop) {
      let result;
      try { result = diagnose(); } catch (err) { result = { frame: 'frame', path: location.pathname, error: String(err) }; }
      try { e.source.postMessage({ atqm: 'diagResult', id: m.id, result }, e.origin); } catch { /* gone */ }
    } else if (m.atqm === 'diagResult' && isTop) {
      diagWaiters.get(m.id)?.push(m.result);
    }
  });

  // The scan loop: each page runs one, and it only does work while this page monitors a queue
  let loopTimer = null;
  function schedule(delay) {
    clearTimeout(loopTimer);
    loopTimer = setTimeout(async () => {
      await tick();
      const mine = trackedQueues().filter(q => owned.has(q.key));
      schedule(rotationTab() ? rotationStep(owned.size || activeQueues().length)
        : mine.length ? Math.min(...mine.map(refreshOf)) : CONFIG.refreshMs);
    }, delay);
  }
  // Next scan when this page's queue is next due (its own refresh after its last scan)
  function reschedule() {
    if (rotationTab()) return schedule(2000);
    const mine = trackedQueues().filter(q => owned.has(q.key));
    const due = mine.length ? Math.min(...mine.map(q => (get(q.state, {}).lastScan || 0) + refreshOf(q))) : 0;
    schedule(Math.max(2000, due - Date.now()));
  }

  // ---------------------------------------------------------------------------
  // Tests (tests/harness.js) load this script with __ATQM_TEST__ set and stop here, before anything
  // starts: no widget, no timers, no scans.
  // ---------------------------------------------------------------------------
  if (W.__ATQM_TEST__) {
    Object.assign(W.__ATQM_TEST__, {
      AT, CONFIG, DEFAULTS, K, P, FIELDS, MY_QUEUE, DATE_RE,
      get, set, del, readSnap, writeSnap, loadSettings, cleanSetting, importSettings,
      storageFail: () => storageFail,
      parseDate, detectDateOrder, learnDateOrder, dateOrder, wallClockToTs, zoneOffset, checkClock, clockWarning,
      dur, dueState, dueAt, reminderSlot, leadTimes,
      trackedQueues, qStore, snapTickets, ticketIndex,
      readGrid, readCallGrid, findColumns, pagerInfo, coverage, missingColumns,
      scanFull, scanIntake, scanCalls, health, globalWarnings, navItems, currentQueue, diagnose,
      claim, mayMonitorHere, consentHere,
      nextUpItems, urgentCount, markTicketRead, nextSummary, openTicketId, noteOpenTicket,
      rotate, rotationTab, rotationStep, switchToQueue, gridSignature, monitorElsewhere,
      openQueueTab, popupsBlocked,
      readableColor, statusColor, statusWord, alertText, targetDue, dashboardStats, deadlineBuckets,
      needsAction, resting, ticketDeadline, priorityWord,
      pageInfo, MACRO, MACROS, macroJob, startMacro, stopMacro, macroStep, macroWork, patchMacroItem, accountField, fieldInput, ticketField, tickedTickets, renderTicketPill,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  let topHasNoBody = false;
  try { topHasNoBody = !isTop && W.top.document.body?.tagName === 'FRAMESET'; } catch { /* ignore */ }
  // The macro tab got a copy of its opener's sessionStorage: drop any monitoring role in it (it's not a
  // queue tab), and note the job, which windows Autotask opens from here (Edit) inherit in turn
  if (macroTabName() === MACRO_WIN) {
    try {
      for (const k of [SS_KEY, P + 'launched', ROTATE_SS, CONSENT_KEY]) sessionStorage.removeItem(k);
      const job = macroJob();
      if (job && !job.finished) sessionStorage.setItem(MACRO_SS, job.id);
    } catch { /* ignore */ }
  }
  setInterval(macroWork, 1000); // does nothing unless this page is doing a macro's steps (see macroPage)
  if (isTop && launchKey()) {
    try { sessionStorage.setItem(SS_KEY, launchKey()); sessionStorage.setItem(P + 'launched', '1'); } catch { /* ignore */ }
    if (launchKey() === ROTATE_KEY) {
      try { sessionStorage.setItem(ROTATE_SS, '1'); } catch { /* ignore */ }
      clearLaunch(); // nothing to click on the way: it takes whatever queue is showing first
    }
  }
  const isPopup = () => isTop && !!W.opener && !launchedTab();

  const wantsWidget = () => !(CONFIG.hideInPopups && isPopup()) && (isTop || (topHasNoBody && gridPresent()));
  if (wantsWidget()) createWidget();
  const boot = setInterval(() => {
    if (!document.getElementById('atqm') && wantsWidget()) createWidget();
    renderTicketPill();
    ensureNavMenu(); // back in Autotask's top bar soon after it's redrawn
  }, 3000);
  setTimeout(renderTicketPill, 1500);
  // (No pagehide clean-up here: a tab opened by script can receive a stale pagehide from the blank
  //  page it started as, which would stop the widget ever appearing. Timers end with the page anyway.)

  // Notice queue switches inside the page quickly (clicking a different queue in the menu)
  document.addEventListener('click', () => setTimeout(() => { pageCache.t = 0; renderSoon(); }, 800), true);

  addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(P) || e.key === K.viewed) return; // viewed changes every few seconds and shows nowhere
    if (e.key === K.scanReq && trackedQueues().some(ownsLock)) tick({ manual: true });
    if (e.key === K.moveReq) handleMoveRequest();
    if (e.key === K.gridFixReq) handleGridFixRequest();
    if (e.key === K.beepReq) playRelayedBeep();
    if (e.key === K.macro) { macroStep(); macroWork(); renderTicketPill(); } // a step finished, or a new one is due here
    if (e.key === K.settings) { loadSettings(); reschedule(); setForm?.refresh(); }
    if (e.key === K.queues) { pageCache.t = 0; setForm?.refreshQueues(); }
    renderSoon();
  });
  setInterval(render, isTop ? 30000 : 10000); // countdowns up to date; frames keep reporting their page
  if (isTop) setInterval(() => { const u = unlockedUntil(); if (u && Date.now() > u - 15000 && Date.now() < u + 15000) render(); }, 5000);
  if (isTop) setInterval(() => { if (document.getElementById('atqm-dash')) render(); }, 15000); // dashboard countdowns

  schedule(3000);
  // A ticket's page (any frame): its changes count as seen while it's open in front of you
  setTimeout(noteOpenTicket, 1500);
  setInterval(noteOpenTicket, VIEW_BEAT);
  document.addEventListener('visibilitychange', noteOpenTicket);
  setInterval(macroStep, 2000); // only does anything in the page that started a macro
  if (isTop) {
    setTimeout(callTicker, 3000);
    setInterval(() => { callTicker(); healthTicker(); }, 15000);
  }
  let launchChecks = 0;
  const launchTimer = setInterval(() => {
    if (launchKey()) handleLaunch();
    else if (launchTries || ++launchChecks > 12) clearInterval(launchTimer); // nothing to do after ~30 s
  }, 2500);
})();
