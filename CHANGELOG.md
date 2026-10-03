# Changelog

## 0.12.0 (2026-10-03)

### Added

- **Statuses that need action** (Settings), by default New, First Response, In Progress, Action Required, Waiting Internal, Escalated, Workshop and Dispatch. Tickets in any other status rest: visible, but not in Next up and with no SLA or response target warnings. Moving a ticket into a resting status is logged without a ping; a resting ticket moving back into a status that needs action raises a **Needs action** alert (in queues tracked for new tickets too) and goes to the top of Next up's changed tickets.
- The dashboard lists **every ticket in My queue** (and any other queue tracked for all changes): those that need action first, most urgent at the top, then the resting ones, each with status, priority, next deadline, age and a **Seen** button.
- Status and priority on every ticket row: Next up, the Overview lists and the dashboard.

### Changed

- **Statuses that pause the SLA** is replaced by **Statuses that need action**.
- The dashboard's "Tickets in your queues" number is now **Need action**, out of all your tickets.

## 0.11.0 (2026-10-03)

### Added

- **Dashboard** (setting **Dashboard button**): a ⛶ button at the top of the window opens a full-window dashboard with the numbers that matter (overdue, due in the next hour, waiting for a first response, changed since you looked, tickets, next service call), Next up, deadlines over the next 8 hours as an hourly chart (with a table view), every queue's status breakdown and recent changes. Full screen, Close and Esc; it stays open in its tab across reloads.
- **Response target for tickets without an SLA** (setting, 60 minutes by default). Tickets in New status with no first response SLA get it as their deadline in Next up and the dashboard, alongside real SLAs, with an alert when it's due soon and when it passes. Upgrading doesn't alert for tickets already past it.
- **Status colours:** the colour Autotask shows each status in is read from the grid and used in the change history, Next up and the status chips. Dark colours are lightened so they stay readable on the dark window.

### Changed

- The Quick start box no longer warns about pop-ups up front; the pop-up notice only appears once the browser has actually blocked a tab.
- Next up's settings line is shorter.

## 0.10.0 (2026-10-03)

### Added

- **Monitor all queues from one tab** (Settings, off by default). Quick start and Start tracking open a single monitoring tab that goes round every tracked queue: it clicks each one in the menu, refreshes it and scans it. Opening one tab works without pop-up permission. It won't scan a grid that hasn't switched to the new queue yet, so one queue's tickets are never credited to another. Its locked view shows each queue's status and Next up across all of them.
- The window notices when the browser blocks a tab it opens (including blockers that open a tab and close it straight away) and says so in a box that shows even when minimised, with how to allow pop-ups for autotask.net and a **One tab for all queues** button. The notice clears once one click opens several tabs, or when you press **Got it**.
- When Quick start's tabs are blocked, the box lists the queues that didn't get one, with **Open <queue>** to open them one per click.
- Before the first Quick start that opens several tabs, the box mentions that blocked pop-ups would stop all but the first.

### Fixed

- Start tracking opened its tab after asking for notification permission, which could use up the click and get the tab blocked. It now opens the tab first.
- "Today" checks (service calls later today, changes today) used the real clock instead of the one the rest of the script uses; this only affected tests.

## 0.9.2 (2026-10-02)

### Fixed

- Quick start skipped the queue the current tab was showing, so with two tracked queues it opened only one tab. It now opens a tab for every queue nobody is monitoring, and never takes over or locks the tab you pressed it in (moving queues to this window used to).
- A tab opened by Quick start could monitor whichever queue My Workspace opened on before it reached its own queue, getting in the way of the other new tabs. It now waits for its own queue.
- Pressing Quick start again while its tabs were still starting opened duplicates. When the browser lets only some tabs open, the message says how many, and the next press opens the rest.

## 0.9.1 (2026-10-02)

### Changed

- **Start tracking** now opens the queue in a new tab and monitors from there, so the tab you pressed it in isn't locked. While the new tab starts, the window says so and offers **Monitor in this tab instead**. If the browser blocks the new tab, it offers both choices again.

## 0.9.0 (2026-10-02)

### Changed

- **Next up** is now always on and the first tab, and the **Changes** tab is gone: its history is under Next up as **Recent changes**. The **First line overview** setting is removed.
- Next up now works for any mix of queues and settings, most urgent first: service call now, overdue, due soon, new tickets, changed since you last looked, coming up, service calls later today. Each ticket appears once.
- Next up now includes tickets that arrived in your queues and status changes you haven't seen yet (such as a customer replying), with a **Seen** button to take them off the list.
- The top of Next up shows the queues and settings it's working from; the tab's count is the number of things that need you now, and the minimised window shows the top one.
- Status changes now record the old and new status, so Next up can show "Waiting Customer → Customer Note Added".

## 0.8.0 (2026-10-02)

### Changed defaults

- Monitoring no longer starts by itself in a tab you're working in. Tabs opened by Quick start still start straight away; anywhere else the window asks whether to **open a separate monitoring tab** or **monitor in this tab**.
- **Add missing columns automatically** is now off: the window offers an **Add missing columns** button instead. If you had saved your settings before, your saved choice is kept.
- The grid is no longer switched to its largest page size without asking. New setting **Show the most rows per page automatically** (off); otherwise the window offers **Show up to N rows**.
- **Date format in Autotask** now defaults to **Detect automatically**.

### Added

- Install and update from a link. The script is now `autotaskQueueMonitor.user.js`, and its header has update URLs.
- Year-first dates (`2026-10-02`) and `a.m.`/`p.m.` times. The date order is worked out from the dates in your grids.
- **Autotask time zone** setting, and a warning when Autotask's times look hours off this PC's clock.
- A single "stopped updating" notification when a queue's monitoring stops.
- Sounds raised in a tab nobody has clicked are played by a tab you have used; locked monitoring tabs ask for one click.
- **Diagnostics** in Settings, for bug reports (no ticket titles or account names).
- **Export settings** and **Import settings**.
- Keyboard navigation and screen reader labels for the window's tabs and buttons.
- Tests (`npm test`).

### Fixed

- Dates like `2026-10-02` were read as 26 October 2002, so every ticket showed as overdue.
- Impossible dates, such as a US date read as a UK one (month 25), rolled over into a later year instead of being ignored.
- A second batch of notifications for the same queue silently replaced the first.
- Two tabs could briefly both monitor a queue and alert twice. Tabs now use the browser's Web Locks where available, so a takeover is immediate and a closed tab releases its queue at once.
- When a snapshot couldn't be saved (browser storage full), every scan reported the same changes again. Storage problems now show in the window, and the older half of the change history is dropped to make room.
- The copy button gave no feedback when copying wasn't allowed.
- Quick start's first prompt offered to open tabs it couldn't open. It now learns the My Workspace & Queues address, and says what to do when it doesn't know it yet.
- Messages between frames now name their target origin instead of `*`.
- A page showing a queue inside a frame could take that queue's lock itself, leaving the frame unable to monitor it.

### Faster

- Once the queue menu is found, only the menu is searched, not the whole page.
- Stored data is parsed once per change rather than on every read, and ticket lists are built once per scan.

### Removed

- Upgrade code for versions before 0.7.

## 0.7.1

First public version.
