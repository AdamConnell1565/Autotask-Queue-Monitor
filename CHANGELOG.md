# Changelog

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
