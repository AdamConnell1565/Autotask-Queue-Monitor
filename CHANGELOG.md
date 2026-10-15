# Changelog

## 0.22.1 (2026-10-15)

### Fixed

- **Macro tabs took you away from the queue.** A macro run on ticked tickets opened each ticket's tab in front of the page you were on, so you were taken to every new tab as it opened. They now open in the background, next to the one you're in: you stay on the queue and can carry on while the macro runs. Tampermonkey opens them, so they don't need pop-ups allowed for autotask.net either. For this the script now asks Tampermonkey for `GM_openInTab`.

## 0.22.0 (2026-10-15)

### Added

- **Tickets you're a secondary resource on show differently.** My queue lists every ticket you're a resource on, including those where someone else is the primary resource, responsible for the ticket. With the Resources column in the grid ("Smith, John (primary) | Doe, Jane"), those tickets are marked **Secondary**, with a dashed outline, and the primary resource's name on hover. In Next up they're in a **Secondary resource** group of their own, after Waiting for you. They don't count as needing you: not in the tab's count, the red count, the dashboard's numbers or its deadlines chart. In the dashboard's table of your queue they're in a Secondary resource group at the end. Their changes are still alerted.
- **Your name in Autotask** (Settings → Deadlines and statuses), as the Resources column shows it. Leave it empty and it's worked out from My queue: you're on every ticket there, so it's the name on the most of them.

## 0.21.1 (2026-10-13)

### Fixed

- **New time entry failed on tickets that had the button.** The block looked for New Time Entry once, as soon as the ticket page showed, but the toolbar it's in seems to be built after the rest of the page. A built macro's buttons are now waited for, up to 10 seconds, and while they're greyed out. When one still can't be pressed, the note says whether it's greyed out, hidden, or not there at all.
- **The Queue monitor and the dashboard showed inside tickets.** A ticket opened on its own in a tab or window without a link back to the page that opened it, such as one opened from the dashboard's ticket links, didn't count as a ticket pop-up. So it got the Queue monitor window, and could open the dashboard over itself. Any ticket shown on its own (its page is the whole window) now counts as a pop-up, however it was opened: with **Hide in ticket pop-up windows** on, as it is to start with, it gets its **Macros** button instead. The dashboard never opens over one. A page that only turns out to be a ticket once its title bar shows puts the window away within a few seconds, and so does turning the setting on.
- **"Seen" showed on tickets you hadn't seen.** The button on a ticket with changes you haven't looked at said **Seen**, and went once you had looked. It now says **Unseen**, as a chip. Pressing it still marks the ticket as seen, and so does opening the ticket.
- **A time entry slow to show could fail the ticket.** If the wait after New Time Entry ran out first, the time entry's own dialog was taken for Autotask asking a question ("New time entry didn't go through: Autotask asked…"). Once it did show, the page that pressed the button took itself for a page left behind and wouldn't carry on in it. Now neither happens.

## 0.21.0 (2026-10-12)

### Added

- **Queue macros from the dashboard.** Next up and the queue tables have a tick box on each ticket, and one in the header to tick the whole table. Tick some and a bar along the bottom offers your queue selection macros (Change account and the ones you've built), with **Clear**. A macro's window and **Run** work as in the Macros tab, each ticket in a tab of its own. Its progress shows in a **Macro** card at the top of the dashboard, since the Queue monitor window is put away while the dashboard is open.

## 0.20.0 (2026-10-12)

### Added

- **Only if checks more than one thing.** Its first line reads *If [field] [is] [value]*. **+ Add a line** adds another, joined by **and** or **or**, up to 10. And is checked before or: *A and B, or C* carries on when A and B both match, or when C does. Each line can ask for its value each time the macro runs. When a ticket is skipped, the note says what each field it checked showed.
- **Only if's field is a list**: Account, Contact, Status, Priority, **Ticket Category**, **Ticket Type**, Queue, Issue Type, Sub-Issue Type and the rest, or **Another field…** to type one in. Ticket Category and Ticket Type are read from the ticket page's heading.
- **Waits go in by themselves**: adding a Ticket speed code or a Time entry speed code puts a 3 second Wait after it, for its template to fill in, unless there's a Wait there already. The Wait says why it's there; × takes it out.

### Changed

- An Only if from before keeps its one check as its first line.

## 0.19.0 (2026-10-09)

### Added

- **Two kinds of macro** in the Macro builder: **Queue selection** runs on the tickets ticked in a queue, **On page** runs on the ticket in the page, right there. A ticket pop-up's Macros button shows the on page ones.
- **Ticked tickets in tabs of their own, several at once**: each ticket opens in its own tab, up to **Tickets at once** (Settings → Macros, 5 to start with). When a ticket is done its tab closes and the next ticket starts. This is for Change account too. More than one at once needs pop-ups allowed for autotask.net; without that it does one at a time and says so.
- **Granular blocks**, with the pages they work on:
  - On the ticket's page: Only if, **Enter edit mode**, **New time entry**, **Quick note**.
  - In edit mode: **Ticket speed code**, **Set a ticket field**, **Save ticket**, **Save ticket & enter time** (the edit page's Save & Enter Time), **Cancel edit**.
  - In a time entry: **Time entry speed code**, **Hours worked**, **Summary notes**, **Internal notes**, **Set a time entry field**, **Save time entry**, **Cancel time entry**.
  - Anywhere: Wait.
- The builder follows the pages the blocks lead to and draws a line where the macro moves to another page. A block where it can't work, or a macro that would end unsaved, is marked, with a button that puts in what's missing.
- The progress list shows the step each ticket is on.

### Changed

- Edit and Save are no longer done for you: they're the Enter edit mode and Save ticket blocks. Macros built in 0.18 get them put in where they were done before, and become queue selection macros.

### Checked against Autotask

- From captures of the ticket page's activity toolbar and a time entry:
  - New Time Entry opens the time entry as a dialog over the ticket's page, titled "New Ticket Time Entry". The macro carries on in it.
  - It has no Cancel button, so Cancel time entry presses its ✕.
  - Its Date and Start Time are typed into.
  - A time entry showing another ticket's number isn't taken for this ticket's.
  - A speed code listed under two of the list's headings (Recently Used and Department, say) counts as one.
- Not yet: the time entry's Hours Worked, Summary Notes and Internal Notes. Those blocks find their boxes by label and fail the ticket with a note if they're built differently.

## 0.18.0 (2026-10-09)

### Added

- **Macro builder**: build macros of your own out of blocks, and run them like Change account, on this ticket or the tickets ticked in a queue. Drag blocks into a list of steps (or click them in), drag a step by its handle or use its arrows to move it, and drag it back out or press × to take it out. The blocks:
  - **Speed code**: types a speed code into the edit page's speed code box and picks it, so its template fills in the ticket.
  - **Set a field**: picks a value for any field on the edit page from its own list (a plain box is typed into), optionally only where the field is empty.
  - **Only if**: carries on only if a field on the ticket's page is, or isn't, one of some values, or is empty or filled in. Otherwise the ticket is skipped.
  - **Wait**: a pause of up to a minute.
- The macro presses Edit and plain Save for you, around the steps for the edit page, and the builder shows where. A step's value can be **asked each time**, in the macro's window when you run it.
- The builder opens from **+ New macro** in the Macros tab and behind a ticket pop-up's Macros button, from **Edit** in a macro's window, and from the new **Macros** section in Settings, which lists your macros with Edit and Delete.
- **Export** and **Import** include your macros. A file exported before this version leaves your macros as they are.

### Fixed

- On a locked monitoring tab, typing in a macro's window was swallowed along with keys meant for the page.

## 0.17.3 (2026-10-08)

### Fixed

- **Change account** pressed **Save & Close** outside the macro tab (for example, run from a ticket's Macros button). Save & Close goes on to Autotask's closing note to complete the ticket. The macro now only ever presses plain **Save**, which saves and returns to the ticket.

## 0.17.2 (2026-10-08)

### Fixed

- **Ticked in this queue** never saw a ticked ticket. Autotask's grids draw their own tick box rather than using a real checkbox, so ticks were missed. They're now read from Autotask's own tick box. The ticket's ID comes from the row too.
- The "Not saved" note reads like "Not saved: Required: Account": Autotask's own message, then the fields it marked.

## 0.17.1 (2026-10-08)

### Fixed

- When Autotask wouldn't save a ticket, the macro's "Not saved" note could include the marked field's own text ("Type to search..." and the like). It now gives Autotask's message and names the fields Autotask marked, for example "Not saved: … Check Account".

## 0.17.0 (2026-10-08)

### Added

- **Service call reminders on the dashboard**, at the top, with **Dismiss**. The Queue monitor window, where they also show, is put away while the dashboard is open.

### Changed

- **Change account**, checked against Autotask's real edit page:
  - **Picking:** it picks only from the field's own list, never from another field showing the same word. For example, Source showing "Other" no longer stands in for Sub-Issue Type's "Other".
  - **Checking a pick took:** it waits for the field to show what was picked (the account's chip, a type's selection). If the field doesn't take it, the ticket fails unsaved.
  - **Empty fields:** it tells an empty dropdown field by Autotask's own markers. An empty type shows a blank line, and an empty account has no chip, so "Type to search..." isn't taken for a value.
  - **Closed sections:** a field in a section you've closed, like Billing, gets its section opened.
  - **Saving:** it presses **Save & Close**, which closes an Edit window of its own (plain **Save** in the macro tab).
- A ticket already on the target account is now edited when one of the given types is empty on it, to fill that in with the account left alone. With nothing to fill, it's still skipped.

### Fixed

- When the browser blocked Autotask's Edit window, the macro waited 2 minutes and reported the ticket as stuck. It now fails it straight away and says to allow pop-ups for autotask.net.
- Turning a switch from the Queue monitor menu while Settings had unsaved changes was undone when you then pressed Save.

## 0.16.3 (2026-10-08)

### Added

- **Update** in the Queue monitor menu: a link to the latest release. Tampermonkey opens its install page in a new tab and asks before installing.

## 0.16.2 (2026-10-08)

### Changed

- Settings and the dashboard are open one at a time. Opening Settings from the dashboard takes its place, and closing Settings (✕, Esc or **Back to dashboard**) goes back to it. Opening the dashboard with Settings open closes Settings first, asking if something is unsaved.
- The Queue monitor window is put away while the dashboard is open, as it already was for Settings.

### Fixed

- The dashboard could open underneath Settings (from the Queue monitor menu) and get stuck there.
- After a reload with the dashboard open, the dashboard covered Autotask's top bar until its next refresh, because Autotask builds the bar after the page loads. It now moves below the bar as soon as the bar appears.

## 0.16.1 (2026-10-08)

### Changed

- The Queue monitor menu's name lines up with Autotask's own menus beside it, with the credit line underneath it rather than pushing it up.

## 0.16.0 (2026-10-08)

### Added

- **Queue monitor menu** in Autotask's top bar, after Dashboards, My and Calendar, showing the version with a credit line underneath. It's built from Autotask's own menu buttons and colours, so it looks like them. It opens the **Dashboard** and **Settings**, and shows or hides the **Queue monitor window** and the **Macros button on ticket pop-ups**.
- Settings **Queue monitor window** and **Macros button on ticket pop-ups**, under Window and display: the same two switches as the menu. The window is only hidden on pages with Autotask's top bar, where the menu can bring it back, and never on a locked monitoring tab. With the Macros button off, a macro run in a pop-up still shows how it went.

## 0.15.4 (2026-10-08)

### Changed

- Settings opens below Autotask's top bar like the dashboard, so New, search and the menus still work. Opened from the dashboard, it sits over it. The Queue monitor window is put away while Settings is open.
- Settings has a **Back to dashboard** button, or **Dashboard** when it was opened from the cog. It closes Settings (asking first if something is unsaved) and goes to the dashboard.

### Fixed

- Opening Settings from a dashboard in full screen showed nothing, because only the full-screen page was visible. Full screen now ends first.

## 0.15.3 (2026-10-08)

### Changed

- **Change account**'s **Sub-Issue Type, if empty** and **Work Type, if empty** start on **Other** and **Remote Support**. They're still only filled in where the ticket has nothing in that field. Clear one to leave that field alone.

### Fixed

- When Autotask didn't load its list for the account (or type) the macro typed, the macro waited 10 seconds and failed the ticket. Now, if the name hasn't come up after 3 seconds, it clears the box, waits half a second and types it again, 3 times in all, before failing the ticket.

## 0.15.2 (2026-10-08)

### Fixed

- In Autotask's new layout, the Macros tab couldn't see tickets ticked in a list, so **Ticked in this queue** stayed greyed out. The page in Autotask's frame now tells the Queue monitor window which tickets are ticked, and which ticket it shows (for **This ticket**). This works in any list of tickets, including a dashboard widget's drill-down, not only My Workspace queues.

## 0.15.1 (2026-10-08)

### Fixed

- The dashboard could cover Autotask's top bar. It now finds the bar by Autotask's own header, even with a notice above it or something laid over the page, so the bar and its menus stay usable.
- In a ticket window where a macro ran, the strip along the bottom stayed after the macro had finished. It now goes as soon as the macro is done or stopped, and the result shows in the corner.

## 0.15.0 (2026-10-08)

### Added

- **Macros tab**, on the right of the window. Each macro is a square: click one to open a small window that asks for what it needs and has **Run**. Nothing runs until you press Run. A macro that asks for nothing can also run from its square with a double-click; a single click only opens its window.
- Macros run on **this ticket** (right there, in that page) or on the tickets **ticked in this queue** (one at a time, in a tab of their own, with progress, **Stop**, **Try again** and **Done** in the Macros tab).
- The first macro, **Change account**: presses Edit, picks the account from Autotask's list, saves, and checks the ticket shows the new account. A ticket already on that account is skipped. Its window has optional **Sub-Issue Type, if empty** and **Work Type, if empty** settings. Each is filled in only where the ticket has nothing in that field, checked on the ticket's page before editing and again on the edit page, so a value already there is never overwritten.
- Ticket pop-up windows get a small **Macros** button in the corner, with the same squares, for that ticket.
- **Refresh service calls every** (Settings > Service calls): the Service calls page refreshes on its own interval, 10 minutes by default, separate from the queues.
- `docs/autotask-pages.md`: how Autotask's ticket page is built, for fixing the script after an Autotask update.

### Changed

- Opening a ticket counts as seeing its changes, while its page is in front of you. A status change made while it's open (usually yours) arrives already seen, without a ping.
- The red count at the top of the window is the tickets that need you within the hour (overdue, or due in the next 60 minutes), not unread changes.
- The dashboard opens below Autotask's top bar, so New, search and the menus still work. It stays open when its page reloads, but not after going to another page. The **Dashboard button** is on by default.

### Fixed

- A queue, especially Service calls, could briefly show "Last scan … ago" and send a "stopped updating" alert when the browser held back a background tab's timers. The monitor now learns how far apart each queue's scans really are before calling it stopped.

## 0.14.0 (2026-10-06)

### Changed

- **Settings has its own window.** The Settings tab is replaced by a cog (⚙) at the top of the Queue monitor window, always there even when minimised, and a **Settings** button on the dashboard. It opens over the whole browser window, with sections down the left (Tracked queues, Deadlines and statuses, Alerts, Service calls, Monitoring, Window and display, Dates and times, Backup and help), **Quick start** at the top, and each setting on its own row with its explanation beside it.
- Settings are grouped by what they're for rather than General and Window: thresholds and statuses together, refresh and monitoring tabs together, dates and time zone together.
- Changes wait for **Save changes** (or Ctrl+S). The bar at the bottom counts what's unsaved and changed rows are marked; **Discard** puts them back, and closing with something unsaved asks first. Numbers outside a setting's range are saved within it, and the field shows what was saved.
- Each tracked queue shows its light and status, with **All changes** / **New & first response** as a switch and **Stop** beside it.
- The service calls page, when Service calls is off, has an **Open Settings** button that goes straight to that setting.

### Added

- **Find a setting** filters the window as you type, by name or explanation (a section's name shows all of it). Esc clears the search, then closes.
- **Statuses that need action** are chips in their Autotask colours: × removes one, typing a name and Enter adds one, and the other statuses seen in your queues are offered to add with a click.

## 0.13.1 (2026-10-03)

### Changed

- **Waiting for you** puts tickets with a deadline (an SLA or response target) first, soonest first, before sorting the rest by age, so an SLA always comes before an older ticket without one.

## 0.13.0 (2026-10-03)

### Changed

- Next up now includes every ticket in My queue that needs action, not just those with a deadline or a recent change. The order: service call now, **In progress** (your In Progress tickets, since that's what you're doing), overdue, due soon, **Waiting for you** (everything else that needs action, oldest first, alongside new tickets from shared queues), coming up, and service calls later today.
- The separate "New tickets" and "Changed since you last looked" groups are folded into **Waiting for you**. A changed ticket keeps its place and still shows what it was, with **Seen**.
- The dashboard's **Overdue** number counts every overdue ticket, including ones In progress.

## 0.12.1 (2026-10-03)

### Changed

- Dashboard layout: two columns that each fill downwards on their own, so a long list on one side no longer leaves gaps on the other. Next up and My queue on the left, Queues, deadlines and Recent changes on the right; stacked on narrower screens.
- Next up on the dashboard is a table like My queue, one line per ticket: when, ticket, status, priority, queue, title and deadline. Long titles are shortened, with the full text on hover.
- My queue's table puts status and priority next to the ticket, and only shows a deadline column when a ticket has one.
- The deadlines chart only appears when something is due in the next 8 hours. Recent changes shows 15 with **Show more**.

### Added

- **Priority colours:** like statuses, the colour Autotask shows each priority in is read from the grid and used wherever a priority is shown. Until it's known, high priorities are picked out in red.

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
