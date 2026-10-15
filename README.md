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
- Desktop notifications and a sound for each change, plus a history of changes under Next up. Statuses and priorities show in the colours Autotask gives them.

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

After that, **Quick start** (in the window, or at the top of Settings, behind the cog) opens a monitoring tab for every tracked queue in one go, and leaves the tab you're in alone. Press it from another window later to move them all there, for example to a window you keep minimised.

Quick start opens several tabs from one click, which browsers block unless pop-ups are allowed. If that happens the window tells you, and you have two ways round it:

- **Allow pop-ups:** click the pop-up icon at the right of the address bar and choose to always allow pop-ups from autotask.net. Quick start then opens every tab at once. Until then, **Open <queue>** in the window opens the rest one per click.
- **Use one tab for all queues:** press **One tab for all queues** in the window, or turn on **Monitor all queues from one tab** in Settings. Quick start then opens a single tab that checks every queue in turn (see below), which browsers allow without pop-up permission.

## Next up

The first tab in the window lists what to do next, most urgent first, across every queue you track. Only tickets in a status that needs action are listed (see [Statuses that need action](#statuses-that-need-action)):

1. **Service call now**: a scheduled call that has started.
2. **In progress**: tickets In Progress in My queue (and any other queue tracked for all changes), since that's what you're doing. Soonest deadline first, then oldest.
3. **Overdue**: first responses, SLAs and response targets that are past due.
4. **Due soon**: first responses, SLAs and response targets due within your "due soon" thresholds.
5. **Waiting for you**: every other ticket in My queue that needs action (Action Required, Escalated, New and so on), new tickets in queues tracked for new tickets, and tickets in those queues that changed back into needing action. Tickets with a deadline (an SLA or response target) come first, soonest first; then the rest, oldest first by the ticket's age.
6. **Secondary resource**: tickets that need action where you're a secondary resource and someone else is the primary resource (see [Secondary resource tickets](#secondary-resource-tickets)).
7. **Coming up**: everything else with a deadline, soonest first.
8. **Service calls later today**.

Tickets without an SLA aren't forgotten: a ticket still in New status with no first response SLA gets a **response target** (1 hour by default, in Settings), so it lines up against your SLAs by time, and you get an alert when the target passes.

Each ticket appears once, in its most urgent group. A ticket that has changed since you last looked shows what it was, marked **Unseen**. Press **Unseen** to mark it as seen, and the mark goes. Opening the ticket in Autotask does the same: its changes count as seen while its page is open in front of you, and a status change made while it's open (usually by you) arrives already seen, without a ping. The tab's count is the number of things in groups 1 to 5, and the minimised window shows the top one. The red count at the top of the window is the tickets that need you within the hour: overdue, or with a deadline in the next 60 minutes (hover it for the split).

What goes in the list follows your setup: which queues you track and how (a queue tracked for new tickets & first response only contributes new tickets and first responses), the "due soon" thresholds, the statuses that need action, the response target, and whether service calls are on. The top of the tab shows the queues and settings it's working from.

Every ticket shows its status (in its Autotask colour) and priority.

Underneath is **Recent changes**, the full history: new tickets, status changes, tickets leaving a queue, SLA warnings and service call changes. **Mark read** marks them all as read.

## Secondary resource tickets

My queue (Open Tickets) lists every ticket you're a resource on, including those where you're only a secondary resource. On those, someone else is the primary resource, the one responsible for the ticket. With the **Resources** column in the queue's grid (it shows, say, "Smith, John (primary) | Doe, Jane"), the monitor tells these tickets apart:

- They're marked **Secondary**, with a dashed outline. Hover over it to see who the primary resource is.
- In Next up they're in a **Secondary resource** group of their own, after Waiting for you. They aren't counted as needing you: they're not in the tab's count, the red count, the dashboard's Overdue, Due in the next hour, Waiting for a first response and Need action numbers, or its deadlines chart. Their deadline is still shown on the line.
- In the dashboard's table of your queue they're in a **Secondary resource** group at the end.
- Elsewhere (the Overview lists) they keep their place, marked **Secondary**.

Their changes are still alerted and still show in Recent changes, as before.

To know which name is yours, the monitor looks at My queue: you're on every ticket in it, so it takes the name on the most of them. If it can't tell (say My queue has one ticket, with two people on it), or picks the wrong name, set **Your name in Autotask** in Settings → Deadlines and statuses, as the Resources column shows it. Without the Resources column, nothing is marked.

## Statuses that need action

Some statuses need you (a new ticket, a customer reply) and some don't (waiting on the customer or a vendor). **Statuses that need action** in Settings lists the first kind; the default is:

New, First Response, In Progress, Action Required, Waiting Internal, Escalated, Workshop, Dispatch

A ticket in any other status rests: it stays visible (in the dashboard's ticket table and the Overview), but it isn't in Next up, gets no SLA or response target warnings, and doesn't ping you when you set it to that status. When a resting ticket moves back into a status that needs action (Waiting Customer → Action Required, say), you get a **Needs action** alert and it's back in Next up. Leave the setting empty to treat every status as needing action.

## Macros

The **Macros** tab, on the right of the window, does repetitive jobs on tickets for you: **Change account**, which is built in, and any you build yourself in the [Macro builder](#macro-builder). Each macro is a square. Click one to open its window: fill in what it asks for, choose which tickets to run it on, and press **Run**. Nothing runs until you press **Run**, and Esc or **Cancel** closes the window. A macro that asks for nothing can also run straight from its square with a double-click (a single click only opens its window).

Ticket pop-up windows don't show the Queue monitor window (unless you turn off **Hide in ticket pop-up windows**), so they get a small **Macros** button in the bottom right corner instead, with the same squares, for that ticket. A ticket pop-up is any ticket shown on its own in a window or tab, without Autotask's top bar, however it was opened (by Autotask, or from a ticket link in the dashboard). The dashboard never opens over one.

Where a macro can run depends on the page:

- **This ticket**, when the page shows a ticket: it runs right there, in that page.
- **Ticked in this queue**, when the page shows a queue: tick the tickets in Autotask's grid (you can do this with the window open). Each ticket opens in a tab of its own, up to 5 at once (**Tickets at once**, in Settings → Macros). When a ticket is done its tab closes and the next ticket starts in its place. Keep the tab you started it from open until it finishes.

The tickets' tabs open in the background, next to the one you're in, so you stay on the queue and can carry on with something else while the macro runs. Tampermonkey opens them, so they don't need pop-ups allowed for autotask.net. (With a script manager other than Tampermonkey, the browser opens them instead: each comes to the front, and more than one at once needs pop-ups allowed, or it does one ticket at a time, each in the tab the last one finished in, and says so.)

### Change account

Moves tickets to another account. **Change to** is the account to move them to. It starts on the one you used last; the list has the others you've used recently and the accounts in your tracked queues, and **Another account…** lets you type any name as Autotask shows it.

**Sub-Issue Type, if empty** and **Work Type, if empty** start on **Other** and **Remote Support**. Each is filled in only on tickets where that field is empty. The macro checks the field on the ticket's own page before editing, and again on the edit page once the account is picked. A ticket that already has one keeps it. Type another value to use that instead, or clear the box to leave that field alone. Values you've used before are offered as you type.

Autotask sometimes doesn't load its list for what was typed. If the name hasn't come up after 3 seconds, the macro clears the box, waits half a second and types it again, 3 times in all, before it gives up on that ticket.

On each ticket it reads the Account field. A ticket already on that account is only edited if it has one of the given types empty; then only that type is filled in. With nothing to fill, it's skipped.

Otherwise it presses **Edit**, types the account into the Account field and picks it from Autotask's list, and does the same for the types where they're empty. It checks each field shows what it picked, opening a closed section (like Billing) to reach a field if need be. Then it presses **Save** (never Save & Close, which goes on to close the ticket) and checks the ticket shows the new account and the types it filled in.

If Autotask opens Edit in a window of its own and your browser blocks it, the ticket fails straight away and says to allow pop-ups for autotask.net.

Each ticket ends up **Done** (with which types were filled in, and which it kept because the ticket had one), **Already on it** (skipped), **Failed** (with why: the account or type wasn't offered, several matched, a field wasn't on the edit page or was greyed out, Autotask wanted another field before saving, or it asked a question) or **Check it** (saved, but the change couldn't be confirmed). **Stop** halts it straight away and closes the macro tabs (the tickets they were on are marked **Check it**). At the end, **Try the _n_ again** reruns the tickets that didn't get done, and **Done** clears the list. A message box with only OK is acknowledged; any other question is left unanswered and that ticket isn't saved.

### Macro builder

Build macros of your own out of blocks. Open the **Macro builder** from any of these:

- **+ New macro**, the last square in the Macros tab and behind a ticket pop-up's Macros button.
- **Edit**, at the top of the window of a macro you built.
- **Settings → Macros**, which lists your macros with **Edit** and **Delete**, and has **New macro**.

Give the macro a name (what its square says) and, if you like, a line on what it does. Then choose what it **Runs on**:

- **Queue selection**: the tickets you've ticked in a queue (or any list of tickets). Each opens in a tab of its own, up to **Tickets at once** (5 to start with) at a time, and its tab closes when that ticket is done.
- **On page**: the ticket in the page you run it from, right there. These are the ones behind a ticket pop-up's Macros button.

The blocks are on the left, grouped by where they work. Drag one into **Steps**, or click it (or press Enter on it) to add it at the end. Drag a step by its handle (⠿) to move it, or use its arrows. Drag it back onto the blocks, or press ×, to take it out. Steps run top to bottom on each ticket. Nothing is kept until **Save macro** (or Ctrl+S); Esc or **Cancel** asks first if you've changed something.

**On the ticket's page**

| Block | What it does |
| --- | --- |
| **Only if** | Carries on only if the ticket matches: *If Account is Fabrikam Ltd*. Pick the field from the list (Account, Status, Priority, **Ticket Category**, **Ticket Type**, Queue, Work Type…) or **Another field…** to type one in, as Autotask labels it. It checks the field **is** one of some values (separate them with commas), **isn't** any of them, **is empty** or **is filled in**. **+ Add a line** checks another field too, joined by **and** or **or** (up to 10 lines). And is checked before or: *A and B, or C* carries on when A and B both match, or when C does. Otherwise the ticket is **Skipped**, with what each field showed. |
| **Enter edit mode** | Presses **Edit**. Then the macro is in edit mode. |
| **New time entry** | Opens a new time entry from the ticket's page. Then the macro is in a time entry. |
| **Quick note** | Writes a note in the ticket page's Quick note box, picks its note type if you name one, and saves it. |

**In edit mode**

| Block | What it does |
| --- | --- |
| **Ticket speed code** | Types the speed code into the edit page's speed code box and picks it from Autotask's list, so its template fills in the ticket. It sets whatever its template sets, over what's already there. |
| **Set a ticket field** | Picks a value for a field, named as Autotask labels it (Status, Priority, Queue, Work Type…), from the field's own list. A plain box such as Purchase Order Number is typed into. Tick **Only if it's empty** to leave a field that has something in it alone (checked on the ticket's page before Edit, and on the edit page). |
| **Save ticket** | Leaves edit mode, saving: plain **Save**, never Save & Close (which goes on to close the ticket). Back on the ticket's page, it checks the fields you set show what was picked. |
| **Save ticket & enter time** | The edit page's **Save & Enter Time** (from its Save & ... menu): saves the ticket and opens a new time entry. |
| **Cancel edit** | Leaves edit mode without saving. |

**In a time entry**

| Block | What it does |
| --- | --- |
| **Time entry speed code** | Types the speed code into the time entry's speed code box and picks it, so its template fills in the time entry. |
| **Hours worked** | Fills in Hours Worked. |
| **Summary notes** / **Internal notes** | Writes in that box, in place of what's there or after it. |
| **Set a time entry field** | Picks a value for any other field of the time entry (Status, which sets the ticket's when the time entry is saved; Role; Work Type…), or types it in a plain box (Date, Start Time). |
| **Save time entry** | Saves the time entry (its **Save & Close**), back to the ticket's page. |
| **Cancel time entry** | Closes the time entry without saving it (its ✕: it has no Cancel button). |

**Anywhere**: **Wait** pauses 1 to 60 seconds, for Autotask to catch up. Adding a speed code (ticket or time entry) puts a 3 second Wait after it for you, unless there's one there already, so its template has time to fill in. Change its seconds, or take it out with ×.

The builder follows the pages the blocks lead to, shows where each step runs, and draws a line wherever the macro moves to another page. A block put where it can't work, such as a ticket speed code with no **Enter edit mode** before it, is marked, with a button that puts in what's missing. So is a macro that would end in edit mode or a time entry, unsaved. It can't be saved until it makes sense, and it needs at least one step that changes the ticket (a save, or a quick note).

For example, *Only if Status is New and Ticket Category is Standard, Enter edit mode, Ticket speed code PWR, Wait 3 s, Set Status to In Progress, Save ticket & enter time, Time entry speed code T30, Wait 3 s, Save time entry* checks the ticket, edits it, saves it, logs the time and is done.

**Ask each time.** Tick it on a step's value (or on a line of an Only if), and the macro's window asks for that value whenever you run it, starting on what you put in the builder. A macro that asks for nothing runs from its square on a double-click, like any other.

Your macros show the same progress list as Change account, with the step each ticket is on, and **Stop**, **Try again** and **Done**. As well as Done and Failed, a ticket can end up:

- **Skipped**: an Only if didn't match.
- **Check it**: saved, but a field it set shows something else on the ticket afterwards.

It fails a ticket when Autotask doesn't offer the speed code or value (or offers several that match), a field or button isn't on the page or is greyed out (a button is waited for up to 10 seconds first, as part of a page, such as the toolbar with New Time Entry, can show after the rest; the note says whether it was missing, hidden or greyed out), Autotask asks a question (a box with only OK is acknowledged), Autotask says why it won't save, or a page loads again part-way through a step. Whatever was saved before that stays saved.

**Not all checked against Autotask yet:** the time entry (a dialog over the ticket's page) has been captured down to its Start Time, but not its Hours Worked, Summary Notes or Internal Notes (see [docs/autotask-pages.md](docs/autotask-pages.md#time-entry)). Those blocks find their boxes by label and fail the ticket with a note if the time entry is built differently. Try a new macro on one ticket first.

Macros you build are kept in this browser with your settings, and **Export** and **Import** (Settings → Backup and help) take them along. Macros built in 0.18, which pressed Edit and Save by themselves, get Enter edit mode and Save ticket put in, and become queue selection macros.

## Queue monitor menu

Autotask's top bar gets an **Autotask Queue Monitor** menu after its own (Dashboards, My, Calendar), showing the version, with a credit line underneath. It's built from Autotask's own menu buttons, so it looks like them. It has:

- **Dashboard** and **Settings**, which open them.
- **Hide** or **Show Queue monitor window**. Hidden, the window stays out of the way on pages with Autotask's top bar, and this menu brings it back. Locked monitoring tabs always show it.
- **Hide** or **Show Macros button on ticket pop-ups**, the small button in the corner of ticket pop-up windows.
- **Update**, a link to the latest release. Tampermonkey opens its install page in a new tab and asks before installing.

Both choices are saved, so every Autotask tab follows them. They're also in Settings, under Window and display. Pages without Autotask's new top bar don't get the menu, and there the window always shows.

## Dashboard

The ⛶ button at the top of the window opens a dashboard over the page, below Autotask's own top bar so **New**, search and the menus still work (turn off **Dashboard button** in Settings to remove it), for keeping SLAs and the tickets without one in view at the same time:

- **Service call reminders** at the top, with **Dismiss**, as in the Queue monitor window (which is put away while the dashboard is open).
- **The numbers:** overdue, due in the next hour, waiting for a first response (and how many are past your response target), changed since you looked, tickets in your queues, and your next service call.
- **Next up** as a table: one line per ticket with when, status, priority, queue, title and deadline.
- **Every ticket in My queue** (and any other queue tracked for all changes) in a table under it: those that need action first, most urgent at the top, then those in a status that needs nothing yet, then those you're a [secondary resource](#secondary-resource-tickets) on. Each row has the status, priority, title, next deadline (when any ticket has one) and age, and **Unseen** when it has changed since you last looked (press it to mark it as seen).
- **Deadlines in the next 8 hours** (only when something is due): a column per hour. Hover or tab to a column for its tickets, or press **Table** for the same as a table.
- **Queues:** each queue's status and its tickets per status.
- **Recent changes**, with **Mark all read**.

Next up and your queue's tickets fill the left; queues, deadlines and changes the right. Each side fills downwards on its own, and on narrower screens they stack.

**Run a macro from the dashboard.** Next up and the queue tables have a tick box on each ticket, and one in the header that ticks every ticket in that table. A ticket in both is ticked in both. Once something is ticked, a bar along the bottom shows how many, with **Clear**, and your queue selection macros (Change account and the ones you've built). Click one to open its window, as in the Macros tab, and **Run** it on the ticked tickets. As from a queue, each ticket opens in a tab of its own, so keep the dashboard's tab open until it's done. The ticks clear once it starts, and how it's going shows in a **Macro** card at the top, with **Stop**, **Try again** and **Done**. Press **Done** before running another. Closing the dashboard clears the ticks.

**Full screen** fills the screen; ✕ or Esc goes back to the page. The dashboard stays open when that page reloads, so it can stay up on a second screen; going to another page from Autotask's top bar leaves it closed. It only shows what the monitoring tabs collect, so keep those open too.

## How monitoring works

Each tracked queue is monitored by one tab. That tab refreshes the queue (every 2 minutes by default; the Service calls page every 10, as calls change less often), compares it with the last scan and sends alerts for what changed. Every other Autotask tab shows the overview.

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

**Resources** is optional. With it in My queue (and any other ticket queue), tickets where you're a secondary resource are marked (see [Secondary resource tickets](#secondary-resource-tickets)). It isn't added for you: add it with the grid's Column Chooser.

If a column is missing, the window says which one and offers **Add missing columns**, which adds it through the grid's Column Chooser. That changes your saved view for that grid, which is why it asks first. Turn on **Add missing columns automatically** in Settings to skip the question.

If a queue has more tickets than one page of the grid shows, the window offers **Show up to N rows** for the same reason. Tickets that aren't on the page aren't monitored.

## Settings

Press the cog (⚙) at the top of the window, or **Settings** on the dashboard. Like the dashboard, Settings opens over the page below Autotask's own top bar, so New, search and the menus still work. It has its sections down the left and **Find a setting** at the top. Settings and the dashboard are open one at a time. Opening Settings from the dashboard takes its place, and closing Settings (✕, Esc or **Back to dashboard**) goes back to it. **Dashboard**, when you opened Settings some other way, closes Settings and opens the dashboard. The Queue monitor window is put away while either is open. Changes wait until you press **Save changes** (or Ctrl+S); the bar at the bottom counts what's unsaved, and **Discard** puts it back. Esc or ✕ closes it, and asks first if something is unsaved. Settings are shared by every Autotask tab in the browser.

The sections, and the settings most people change:

- **Tracked queues**: each queue's light and status, how it's tracked (**All changes** or **New & first response**), and **Stop**. **Quick start** sits above it.
- **Deadlines and statuses**: **Warn when an SLA / first response is due within** (the "due soon" thresholds, for alerts and for Next up), **Respond to tickets without an SLA within** (the response target for tickets in New with no first response SLA; 0 turns it off) **Statuses that need action** (see [Statuses that need action](#statuses-that-need-action)) and **Your name in Autotask** (see [Secondary resource tickets](#secondary-resource-tickets); leave it empty to have it worked out). The statuses are chips in their Autotask colours: × removes one, type a name and press Enter to add one, or pick from the other statuses seen in your queues.
- **Alerts**: **Desktop notifications** and **Sound on new alerts**. **Send a test** checks both.
- **Service calls**: **Service calls**, **Refresh service calls every** (10 minutes by default, separate from the queues) and **Call reminders**.
- **Monitoring**: **Refresh queues every**, **Monitor all queues from one tab** (see [One tab for all queues](#one-tab-for-all-queues)) and **Lock monitoring tabs**.
- **Window and display**: **Dashboard button** (adds the ⛶ button that opens the dashboard), **Queue monitor window** and **Macros button on ticket pop-ups** (show or hide them, as the Queue monitor menu does), and how the window looks.
- **Dates and times**: **Date format in Autotask** (detected from your queues; set it if the window shows the wrong dates) and **Autotask time zone** (set it if the time zone in your Autotask profile differs from your PC's; the window warns you when due times look hours out).
- **Macros**: the macros you've built, with **Edit** and **Delete**, and **New macro**, which open the [Macro builder](#macro-builder). These are kept as soon as the builder saves them, not with Save changes. **Tickets at once** (5 to start with) is how many ticked tickets a macro does at a time, each in a tab of its own.
- **Backup and help**: **Export** / **Import** move your settings, tracked queues and macros to another browser or PC. **Diagnostics** and **Reset to defaults** are here too.

## Limitations

- **English Autotask only.** The monitor finds pages, buttons and columns by their English names.
- **Autotask updates can break it.** It reads Autotask's pages rather than an API. Everything it depends on is listed in one place in the script (the `AT` section at the top), so fixes are usually small. See Troubleshooting.
- **One browser at a time.** Settings, tracked queues and history are stored in this browser for autotask.net. Another browser or PC starts fresh (use Export and Import), and clearing the browser's site data resets it.
- **One person at a time.** Each person's browser refreshes the queues it monitors. That's fine for individuals and small teams. For team-wide monitoring, a small service using the Autotask REST API would be sturdier (it needs an API user and somewhere to run); that isn't planned for now.
- **Sound needs a click.** Browsers only play sound in a tab that has been clicked since it loaded. The monitor passes sounds on to a tab you've used, and a locked monitoring tab asks you to click it once.

## Privacy

To compare scans, the monitor keeps the ticket numbers, titles, account names, statuses and due times of the queues you track in your browser's storage for autotask.net. It sends nothing outside Autotask. **Clear** in the window removes the change history. **Diagnostics** and **Export** never include ticket titles or account names from your queues. Export does include the macros you've built, with whatever you typed into their steps (an account name in a Set a ticket field step, say).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Amber light, "Last scan … ago" | The monitoring tab was closed, moved off the queue or put to sleep. Open the queue again or press **Quick start**, and see [Keeping monitoring alive](#keeping-monitoring-alive). |
| "Rows found but no ticket numbers recognised" | Add the **Ticket Number** column to the grid. |
| Due times are hours out | Set **Autotask time zone** in Settings. |
| Wrong dates (day and month swapped) | Set **Date format in Autotask** in Settings. |
| No sound | Click once in the monitoring tab, check **Sound on new alerts** is on, and press **Test alert**. |
| No desktop notifications | Allow notifications for autotask.net in your browser's site settings, then press **Send a test** (Settings → Alerts). |
| Anything else, especially after an Autotask update | Settings (the cog) → Backup and help → **Diagnostics** → **Collect**, then **Copy diagnostics**, and paste the result into a [new issue](https://github.com/AdamConnell1565/Autotask-Queue-Monitor/issues). It lists what the monitor can see on the page (column names, counts, sample dates), never ticket titles or account names. |

## Browsers

Written for Tampermonkey on current Chrome, Edge and Firefox. The script needs no special Tampermonkey permissions, so Violentmonkey should also work, but it hasn't been tried.

## Development

- `npm install`, then `npm test` (Node 20 or later) and `npm run check` (syntax check).
- Everything specific to Autotask's pages (CSS selectors, button names, column names, page addresses) is in the `AT` section at the top of the script. [docs/autotask-pages.md](docs/autotask-pages.md) describes the pages those selectors match, such as the ticket page's fields and buttons.
- Tests load the script into [jsdom](https://github.com/jsdom/jsdom) through a test hook that stops before the script starts its widget and timers (`tests/harness.js`). `tests/boot.test.js` runs the whole script.
- The sample pages in `tests/fixtures`, and the ticket and edit pages `tests/pages.js` builds for the macro tests, are written by hand to match the `AT` selectors. To add a real Autotask page, save it from the browser and replace every ticket title, account name, person's name and ticket number before committing it (see [Capturing a page safely](docs/autotask-pages.md#capturing-a-page-safely)). Never commit personal information.
- For a release, raise `@version` in the script header (Tampermonkey only updates when it goes up) and `version` in `package.json`, and add a [CHANGELOG](CHANGELOG.md) entry. Raise the middle number (0.x.0) only for a major feature; fixes and smaller changes raise the last (0.0.x). See [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)
