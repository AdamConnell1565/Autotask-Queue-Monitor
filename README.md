# Autotask Queue Monitor

A Tampermonkey userscript that watches your Autotask queues and tells you when something changes: new tickets, status changes, tickets leaving a queue, SLAs and first responses coming due, and (if you want) your scheduled service calls. It adds a small window to every Autotask page with a live overview of the queues you track.

<!-- Screenshot: add one, e.g. docs/screenshot.png -->

## What it does

- Tracks any queue in **My Workspace & Queues**. My queue (Open Tickets) is tracked from the start.
- Two ways to track a ticket queue:
  - **All changes**: new tickets, status changes, tickets leaving, SLAs due soon or breached.
  - **New & first response**: new arrivals and first response SLAs only. Good for shared intake queues such as 1st line.
- **Service calls** (optional): your scheduled calls, with reminders before each one.
- **Next up**, the first tab: your next move, worked out from every queue you track and your settings (see [Next up](#next-up)).
- **Dashboard** (optional): a full-window view of everything at once (see [Dashboard](#dashboard)).
- Desktop notifications and a sound for each change, plus a history of changes under Next up. Statuses show in the colours Autotask gives them.

## Install

1. Install the Tampermonkey extension: [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) or [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/).
2. **Chrome and Edge only:** let Tampermonkey run scripts. Open the extensions page (`chrome://extensions` or `edge://extensions`), open Tampermonkey's **Details** and turn on **Allow User Scripts**. On older browser versions, turn on **Developer mode** on the extensions page instead.
3. Open the install link: **[autotaskQueueMonitor.user.js](https://raw.githubusercontent.com/AdamConnell1565/Autotask-Queue-Monitor/main/autotaskQueueMonitor.user.js)**. Tampermonkey shows an install page; press **Install**.
4. Reload any Autotask tabs you have open.

Tampermonkey checks the same link for new versions, so updates arrive by themselves.

**Already using a copy you pasted in by hand?** Open the install link once. Tampermonkey recognises the script and replaces your copy, and from then on it updates itself. Your settings, tracked queues and history are kept; they're stored in the browser, not in the script.

## First run

1. Open Autotask. The **Queue monitor** window appears at the top right, minimised.
2. Open **My Workspace & Queues** and select your queue (**Open Tickets**).
3. The window asks how to monitor it:
   - **Open a separate monitoring tab** (recommended): a new tab keeps the queue up to date while you carry on working in this one.
   - **Monitor in this tab**: this tab does the monitoring, and is locked (see below).
4. Allow notifications when the browser asks.
5. To track another queue, open it and press **Start tracking** in the window. It opens a copy of the page in a new tab to do the monitoring, so the tab you're in isn't locked. (If your browser blocks the new tab, allow pop-ups for autotask.net.)

After that, **Quick start** (in the window, or at the top of Settings) opens a monitoring tab for every tracked queue in one go, and leaves the tab you're in alone. Press it from another window later to move them all there, for example to a window you keep minimised.

Quick start opens several tabs from one click, which browsers block unless pop-ups are allowed. If that happens the window tells you, and you have two ways round it:

- **Allow pop-ups:** click the pop-up icon at the right of the address bar and choose to always allow pop-ups from autotask.net. Quick start then opens every tab at once. Until then, **Open <queue>** in the window opens the rest one per click.
- **Use one tab for all queues:** press **One tab for all queues** in the window, or turn on **Monitor all queues from one tab** in Settings. Quick start then opens a single tab that checks every queue in turn (see below), which browsers allow without pop-up permission.

## Next up

The first tab in the window lists what to do next, most urgent first, across every queue you track:

1. **Service call now**: a scheduled call that has started.
2. **Overdue**: first responses, SLAs and response targets that are past due.
3. **Due soon**: first responses, SLAs and response targets due within your "due soon" thresholds.
4. **New tickets**: tickets still in New status in a queue tracked for new tickets, and tickets that arrived in your other queues since you last looked.
5. **Changed since you last looked**: status changes you haven't seen yet, such as a customer replying.
6. **Coming up**: everything else with a deadline, soonest first.
7. **Service calls later today**.

Tickets without an SLA aren't forgotten: a ticket still in New status with no first response SLA gets a **response target** (1 hour by default, in Settings), so it lines up against your SLAs by time, and you get an alert when the target passes.

Each ticket appears once, in its most urgent group, under its earliest deadline. Press **Seen** on a ticket to take its changes off the list. The tab's count is the number of things in groups 1 to 5, and the minimised window shows the top one.

What goes in the list follows your setup: which queues you track and how (a queue tracked for new tickets & first response only contributes new tickets and first responses), the "due soon" thresholds, the statuses that pause the SLA, and whether service calls are on. The top of the tab shows the queues and settings it's working from.

Underneath is **Recent changes**, the full history: new tickets, status changes, tickets leaving a queue, SLA warnings and service call changes. **Mark read** marks them all as read.

## Dashboard

Turn on **Dashboard button** in Settings and a ⛶ button appears at the top of the window. It opens a dashboard over the whole browser window, for keeping SLAs and the tickets without one in view at the same time:

- **The numbers:** overdue, due in the next hour, waiting for a first response (and how many are past your response target), changed since you looked, tickets in your queues, and your next service call.
- **Next up**, as in the window, with longer lists.
- **Deadlines in the next 8 hours:** a column per hour. Hover or tab to a column for its tickets, or press **Table** for the same as a table.
- **Queues:** each queue's status and its tickets per status.
- **Recent changes**, with **Mark all read**.

**Full screen** fills the screen; **Close** or Esc goes back to the page. The dashboard stays open in that tab across reloads, so it can stay up on a second screen. It only shows what the monitoring tabs collect, so keep those open too.

## How monitoring works

Each tracked queue is monitored by one tab. That tab refreshes the queue (every 2 minutes by default), compares it with the last scan and sends alerts for what changed. Every other Autotask tab shows the overview.

If the monitoring tab closes, or moves off the queue, that queue stops updating. The light in the window turns amber, and one tab sends a single "stopped updating" notification.

### One tab for all queues

With **Monitor all queues from one tab** on, Quick start and Start tracking open a single monitoring tab instead of one per queue. That tab takes every tracked queue nobody else is monitoring and goes round them: it clicks a queue in the menu, refreshes it, scans it and moves on, so each queue is still checked about once per refresh interval (with lots of queues, a round takes about 30 seconds per queue). Its locked view shows each queue's status and Next up across all of them. Queues you start tracking later join its rounds by themselves.

### Locked monitoring tabs

A monitoring tab greys out its page so that a stray click doesn't move it off the queue. Automatic refreshes still work. Use **Unlock for 5 min** in the window if you need the page, or turn **Lock monitoring tabs** off in Settings.

### Keeping monitoring alive

Browsers put background tabs to sleep to save memory, and a sleeping tab stops monitoring. Tell your browser to leave Autotask alone:

- **Chrome:** Settings → Performance → **Always keep these sites active** → Add → `autotask.net`
- **Edge:** Settings → System and performance → **Never put these sites to sleep** → Add → `autotask.net`

Keep monitoring tabs in a window you minimise rather than close.

## Columns it needs

The monitor reads the queue's grid, so the grid needs these columns:

| Tracking | Columns |
| --- | --- |
| All changes | Ticket Number, Title, Status, Account, Priority, Next SLA Event, Next SLA Event Due |
| New & first response | The same, plus Created |
| Service calls | Account, Start Date, End Date, Status, Priority, Description |

If a column is missing, the window says which one and offers **Add missing columns**, which adds it through the grid's Column Chooser. That changes your saved view for that grid, which is why it asks first. Turn on **Add missing columns automatically** in Settings to skip the question.

If a queue has more tickets than one page of the grid shows, the window offers **Show up to N rows** for the same reason. Tickets that aren't on the page aren't monitored.

## Settings

All in the window's **Settings** tab. The ones most people change:

- **Refresh queues every**: how often monitoring tabs refresh.
- **Monitor all queues from one tab**: one monitoring tab for every queue instead of a tab each (see [One tab for all queues](#one-tab-for-all-queues)).
- **Date format in Autotask**: detected from your queues; set it if the window shows the wrong dates.
- **Autotask time zone**: set this if the time zone in your Autotask profile differs from your PC's. The window warns you when due times look hours out.
- **Warn when an SLA / first response is due within**: the "due soon" thresholds, for alerts and for Next up.
- **Respond to tickets without an SLA within**: the response target for tickets in New with no first response SLA (0 turns it off).
- **Dashboard button**: adds the ⛶ button that opens the dashboard.
- **Statuses that pause the SLA**: no SLA warnings or deadlines for tickets in these statuses (Scheduled by default).
- **Service calls** and **Call reminders**.
- **Desktop notifications** and **Sound on new alerts**. **Test alert** checks both.
- **Export settings** / **Import settings**: move your settings and tracked queues to another browser or PC.

## Limitations

- **English Autotask only.** The monitor finds pages, buttons and columns by their English names.
- **Autotask updates can break it.** It reads Autotask's pages rather than an API. Everything it depends on is listed in one place in the script (the `AT` section at the top), so fixes are usually small. See Troubleshooting.
- **One browser at a time.** Settings, tracked queues and history are stored in this browser for autotask.net. Another browser or PC starts fresh (use Export and Import), and clearing the browser's site data resets it.
- **One person at a time.** Each person's browser refreshes the queues it monitors. That's fine for individuals and small teams. For team-wide monitoring, a small service using the Autotask REST API would be sturdier (it needs an API user and somewhere to run); that isn't planned for now.
- **Sound needs a click.** Browsers only play sound in a tab that has been clicked since it loaded. The monitor passes sounds on to a tab you've used, and a locked monitoring tab asks you to click it once.

## Privacy

To compare scans, the monitor keeps the ticket numbers, titles, account names, statuses and due times of the queues you track in your browser's storage for autotask.net. It sends nothing outside Autotask. **Clear** in the window removes the change history. **Diagnostics** and **Export settings** never include ticket titles or account names.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Amber light, "Last scan … ago" | The monitoring tab was closed, moved off the queue or put to sleep. Open the queue again or press **Quick start**, and see [Keeping monitoring alive](#keeping-monitoring-alive). |
| "Rows found but no ticket numbers recognised" | Add the **Ticket Number** column to the grid. |
| Due times are hours out | Set **Autotask time zone** in Settings. |
| Wrong dates (day and month swapped) | Set **Date format in Autotask** in Settings. |
| No sound | Click once in the monitoring tab, check **Sound on new alerts** is on, and press **Test alert**. |
| No desktop notifications | Allow notifications for autotask.net in your browser's site settings, then press **Test alert**. |
| Anything else, especially after an Autotask update | Settings → **Diagnostics** → **Copy diagnostics**, and paste the result into a [new issue](https://github.com/AdamConnell1565/Autotask-Queue-Monitor/issues). It lists what the monitor can see on the page (column names, counts, sample dates), never ticket titles or account names. |

## Browsers

Written for Tampermonkey on current Chrome, Edge and Firefox. The script needs no special Tampermonkey permissions, so Violentmonkey should also work, but it hasn't been tried.

## Development

- `npm install`, then `npm test` (Node 20 or later) and `npm run check` (syntax check).
- Everything specific to Autotask's pages (CSS selectors, button names, column names, page addresses) is in the `AT` section at the top of the script.
- Tests load the script into [jsdom](https://github.com/jsdom/jsdom) through a test hook that stops before the script starts its widget and timers (`tests/harness.js`). `tests/boot.test.js` runs the whole script.
- The sample pages in `tests/fixtures` are written by hand to match the `AT` selectors. To add a real Autotask page, save it from the browser and replace every ticket title, account name, person's name and ticket number before committing it.
- For a release, raise `@version` in the script header (Tampermonkey only updates when it goes up) and `version` in `package.json`, and add a [CHANGELOG](CHANGELOG.md) entry.

## License

[MIT](LICENSE)
