# Autotask page structure

A reference for the parts of Autotask's pages that the script reads and clicks. The selectors themselves are in the `AT` section at the top of `autotaskQueueMonitor.user.js`. This file explains what they match and why, so that fixing things after an Autotask update is quicker.

> **No personal information, ever.** This file and the test fixtures describe structure only. People's names, email addresses, phone numbers, account and company names, ticket numbers, titles, descriptions, notes and alert text are all replaced with made-up placeholders, such as Contoso Ltd, Jane Doe and T20260101.0001. Keep it that way when you add to them. [Capturing a page safely](#capturing-a-page-safely) explains how.

## The outer page and its frame

In Autotask's new layout, an outer page holds the top bar and side panels. Autotask's own pages (queues, tickets, dashboard drill-downs) are shown inside a frame within it. Captured October 2026.

```html
<body>
  <div class="h-screen flex flex-col …">
    <div … data-slot="header">… the top bar (below) …</div>
    <div class="relative min-h-0 flex-1 flex">
      <div class="relative z-1"><div … data-slot="side-panel">… the left navigation, icons only …</div></div>
      <main class="min-w-0 flex-1">
        <div class="relative w-full h-full" data-slot="iframe">
          <iframe class="w-full h-full border-none" src="https://…autotask.net/Mvc/…"></iframe>
        </div>
      </main>
      <div class="relative z-1"><div … data-slot="side-panel">… the right-hand panel, with counts …</div></div>
    </div>
  </div>
  <div class="relative z-iframeOverlay"><iframe … data-slot="iframe-overlay" src="…/DialogIFrameOverlay"></iframe></div>
  <div class="fixed z-dialog"></div> … and layers for drawers, tooltips and other overlays …
</body>
```

- **Two copies of the script.** It runs in both pages. The Queue monitor window, with its Macros tab, is in the outer page. The copy in the frame reads and clicks the page there: the queue grid, the ticket, the edit page.
- **The frame reports what it shows.** `reportPage()` sends the outer page a `page` message. It says which queue the frame shows (if it's one of My Workspace's), whether it shows a list of tickets, which tickets are ticked, and which ticket it shows. That's how the Macros tab in the outer page can see your ticks and the open ticket. `pageInfo()` in the outer page uses the report while it's less than 25 seconds old.
- **Lists that aren't queues.** A dashboard widget's drill-down (`/Mvc/ServiceDesk/TicketGridWidgetDrilldown.mvc/PrimaryStandardDrilldown?…`) is a ticket grid without the queue menu. A macro can change the tickets you tick there, but the list isn't monitored.
- **How a ticked row is marked** in these grids hasn't been captured yet. The script accepts any of these in the row:
  - a checked `<input type="checkbox">`
  - Autotask's own `.Checkbox2 .Checked` (the kind on the ticket page)
  - `[role="checkbox"][aria-checked="true"]`
- **Third-party scripts.** The outer page loads feedback and guidance tools. One of them puts the signed-in user's details in `window.dataLayer`. Never copy those script blocks into a fixture or into this file.

## Top bar

The bar across the top of Autotask, on every page. It holds the logo, the Dashboards, My and Calendar menus, search, and buttons for New (+), favourites, recent items, links, help and your profile. Captured October 2026.

```html
<div class="relative min-h-3.5rem h-3.5rem flex justify-between …" data-slot="header">
  <div class="min-w-0 min-h-0 flex">
    <div class="…" data-slot="header:logo"><img …></div>
    <div class="…" data-slot="header:navigation-section">
      <button type="button" data-slot="header:navigation-menu-button" aria-expanded="false">
        <div class="flex-grow">Dashboards</div><span class="fa-chevron-down …"></span>
      </button>
      … My, Calendar, and a More button that's invisible until the menus don't fit …
    </div>
  </div>
  <div class="relative flex justify-end overflow-x-hidden …">
    <div data-slot="header:search-bar-container">… the search type picker and the Search box …</div>
    <div class="flex" data-slot="header:utility-buttons">
      <button data-slot="header:utility-menu-button" aria-expanded="false">…an icon…</button>
      … one per button: New, favourites, recent, links, help, your profile …
    </div>
    <div class="contents" data-slot="header:app-launcher-slot">…</div>
  </div>
</div>
```

- It's 3.5rem (56 px) tall.
- **Use `data-slot`, not the classes.** The class names are utility classes that only describe how it looks, so they change easily. The `data-slot` attributes name the parts. `AT.sel.topBar` is `[data-slot="header"]`.
- The menus and buttons open with `aria-expanded`. Where their drop-downs are attached hasn't been captured yet.
- The profile button shows your initials and first name. Leave them out of any copy.

**How the dashboard and Settings use it.** `topBarBottom()` returns the header's bottom edge, and `placeBelowBar()` starts the dashboard and Settings there, so the bar and its menus stay usable. Their z-index is set just above the page they cover, Settings one step above the dashboard, so the bar's drop-down menus open over both. Full screen and locked monitoring tabs cover the bar on purpose. While Settings is open, the Queue monitor window (z-index 2147483000) is hidden, since it would float over Settings' own controls.

On a page without the header, `topBarBottom()` looks for full-width strips at the top of the window instead:

- It checks every element at three points 3 px from the top, not just the one in front, so a transparent layer laid over the page can't hide the bar.
- Once it finds a strip, it looks again just below it, so a notice above the bar isn't taken for the bar itself.

## Ticket page

Address: `/Mvc/ServiceDesk/TicketDetail.mvc?workspace=False&ticketId=<internal ID>`. Captured October 2026.

Element IDs (`z` followed by 32 hex characters) change on every page load, so never select by them.

### Title bar

```html
<div class="TitleBarItem Title">
  <span class="Text">Ticket </span>
  <span class="SecondaryText">- T20260101.0001 - Printer not working (Contoso Ltd)</span>
</div>
```

`openTicketId()` finds `.TitleBarItem.Title` (`AT.sel.ticketTitle`), checks that its `.Text` starts with "Ticket", and reads the ticket number from the rest. The same bar has a "1 of 11" navigator and some icon buttons (`.TitleBarButton`); the script uses neither.

### Toolbar buttons

```html
<div class="ToolBarItem Left ButtonGroupStart">
  <div class="Button2 ButtonIcon2 NormalBackground" id="z…" tabindex="0">
    <div class="Spacer"></div>
    <div class="Icon2"><div class="StandardButtonIcon Edit"></div></div>
    <div class="Text2">Edit</div>
    <div class="Spacer"></div>
  </div>
</div>
```

- A button is a `.Button2` and its label is a `.Text2`. The label is a `<div>` here; other pages use a `<span>`. `findButton(text)` matches a visible `.Text2` by its exact text and clicks the `.Button2` around it.
- A disabled button also has the class `Disabled2`, for example Accept on a ticket you can't accept. `findButton` doesn't check for it.
- The left of the toolbar has Edit, Accept, Forward, Tools ▾ and Complete. The right has Knowledge Base ▾, Transfer to Co-managing User, Livelinks ▾ and Print View.
- A drop-down button (`.DropDownButton2.Combined`) keeps its menu in the page, hidden: `.ContextOverlayContainer > .ContextOverlay` holds more `.Button2`s. For example, Tools holds Copy, Merge into Another Ticket and Account Service Details. They stay hidden until the menu opens, and `visible()` keeps `findButton` off them.

### Read-only fields

The ticket's fields are in the left-hand column (the Details tab of `.SecondaryContainer`). Every field is built the same way:

```html
<div class="ReadOnlyData QuickEditEnabled">
  <div class="ReadOnlyLabelContainer">
    <div class="LabelContainer1" id="z…">
      <div class="Text ClickEnabled"><span class="PrimaryText">Work Type</span></div>
      <div class="Required">*</div>
      <div class="WalkMeIconPlaceholder"></div>
    </div>
  </div>
  <div class="ReadOnlyValueContainer">
    <div class="Value">Remote Support</div>
  </div>
</div>
```

`ticketField(re)` reads these, using `AT.sel.detailField`, `detailLabel` and `detailValue`:

- It matches the label container's text. That text includes the `Required` asterisk ("Work Type*"), which every field has whether it's required or not. That's why the label patterns in `AT.text` allow a trailing `*`.
- It returns the value container's text, or `''` for an empty field.
- It returns `null` when the page has no field with that label.

A value comes in one of these shapes:

| Shape | Fields | Markup inside `.Value` |
|---|---|---|
| Plain text | Location, Issue Type, Sub-Issue Type, Source, Due Date, Contract, Work Type | the text itself |
| Link | Account, Contact | `.LinkButtonWrapper2 > .LinkButton2 > .Text2`. A contact may have a note icon beside it (`.InlineIconButton`, no text). |
| Colour band | Status, Priority, Queue | `.ColorBand.ColorSwatch.ColorN`, with the text in `.Right > .Text.ColorSample` |
| Resource | Primary Resource (Role) | initials (`.Initials`), a name link, and the role in `.Support .Text`, e.g. "(Technical)" |
| Empty | any | `<div class="Value"></div>` |

The fields are grouped in sections. Each is a `.DetailsSection > .CollapsibleSectionContainer`, with its heading in `.DetailsSectionHeading .Left .Text`. A collapsed section still contains its fields.

| Section | Fields, top to bottom |
|---|---|
| (top, no heading) | Account, Contact, Status, Priority |
| Ticket Information | Location, Issue Type, Sub-Issue Type, Source, Due Date |
| Assignment | Queue, Primary Resource (Role), Secondary Resources (Role) |
| Billing | Additional Contacts, Contract, Service/Bundle, Work Type, Purchase Order Number, Estimated Hours, Line of Business, Monitor Type, Co-managed Visibility, Closure Reason |

`QuickEditEnabled` with `ClickEnabled` means clicking the label edits that one field in place. The script doesn't use this yet. It could replace the full edit page for changing a single field.

**The Account field is read directly.** The page has several `.LinkButton2` links (Account, Contact, Primary Resource and others). The script used to accept any of them, so a contact with the same name as the target account made a ticket count as "already on it". `accountShown()` now reads the Account field. It only falls back to "any link" on a page without `.ReadOnlyData` fields.

### Heading

`.EntityHeadingContainer` holds:

- the ticket category (`.CategoryChip .Name`)
- the ticket type (`.TypeChip`, e.g. Incident)
- the ticket number (`.IdentificationText`)
- the title (`.Title .Text`)
- when it was created and by whom (`.Bundle`)

The script uses none of these.

### Account alert bar

When the account has an alert, it shows above the page in `.MessageBarContainer > .MessageBar.MessageBarWarning`. The script doesn't use it. Its text is written by your own team and is usually about the customer, so never copy it into a fixture or into this file.

### Parts that look like an edit page

The activity area under the description has controls that a careless match could take for the edit page's:

- **Quick note** (`.QuickNote`): a `<textarea>`, a note type `<select class="DropDownList2">`, and its own **Save** and **Cancel** `.Button2`s. Save stays `Disabled2` until you type. So a Save button on the page doesn't make it the edit page. `macroEditPage()` also needs an Account text box.
- **Text boxes that aren't fields**: the time entry minutes box (`<input type="text" maxlength="4">`, disabled when you can't log time on the ticket) and the activity search (`<input type="text" placeholder="Search...">`).
- **Checkboxes** aren't `<input>`s here: they're `.Checkbox2 > .TabIndexHack.Checked` or `.Unchecked` (plus `Disabled`), with an SVG tick and the label in a `.LabelContainer1`.
- **Validation**: `.ValidationSummary > .FormValidation.Valid`. When something's wrong it is presumably `.Invalid` with the text in a `.Message`; `AT.sel.formError` includes `.Invalid`.

`findField()` has two guards so that none of these is taken for a field's text box:

- It ignores labels inside `.ReadOnlyData`, since read-only fields have no box to type in.
- It rejects a text box when another field's name sits between the label and the box. That box belongs to the other field.

Without the guards, the walk up from a label container can reach a level that also holds the activity search box. That happened on the test page, so the search box was taken for the Account field.

### What Change account does on this page

- **Opening the ticket.** It waits for the page to settle, then reads the Account field. If the ticket is already on the target account, it skips the ticket. Otherwise it reads Sub-Issue Type and Work Type, so that one the ticket already has is never written over (even if the edit page appears to show nothing there), then presses Edit.
- **After saving.** The ticket counts as done once the Account field shows the new account and each type it filled in shows what it picked. If a type shows something else, the ticket is marked **Check it**.

## Ticket edit page

**Not captured yet.** The script's assumptions come from two sources: an older script that worked (it set a speed code and saved), and the label markup on the ticket page.

- **Speed code box**: `.FormTemplateSelector input`. Typing in it filters a list. The macro never types here (`AT.sel.formTemplate` excludes it), because a speed code sets fields over whatever is already in them.
- **Drop-down choices**: `.Item`, or `[role="option"]`. The macro clicks one to pick it. Autotask sometimes doesn't load the list after typing. So when the name hasn't come up within `MACRO.pick` (3 s), `chooseOption()` clears the box, waits `MACRO.retype` (0.5 s) and types it again, `MACRO.tries` (3) times in all.
- **Save**: a `.Button2` with the `.Text2` "Save", or "Save & Close".
- **Fields**: a label names each field ("Account", "Sub-Issue Type", "Work Type"), probably with the same `.LabelContainer1 > .Text > .PrimaryText` markup as the ticket page, followed by a text box the script types into. `findField()` first uses a `<label>`'s `for` attribute when it has one. Otherwise it takes the nearest text box after the label, at most 4 levels up, subject to the guards above.
- **Where Edit opens**: in the same tab, or in a window of its own, isn't known. The macro handles both, because a window opened from the macro tab inherits the job through sessionStorage.

When you capture this page, check:

- the label markup for Account, Sub-Issue Type and Work Type
- the box itself: is it an `<input>`? is it `readonly`? does a chosen value show in the box, or beside it?
- the drop-down list's markup, and where it's attached: inside the field, or at the end of `<body>`
- how errors and required fields show
- whether Save, Save & Close, or both are there

## Capturing a page safely

1. In the browser, open DevTools (F12), right-click the element you need (or `<body>`) and choose **Copy → Copy outerHTML**.
2. Before saving it in the repository, as a fixture or in this file, replace everything that identifies anyone:
   - people's names, email addresses and phone numbers
   - account, company and site names
   - ticket numbers, titles, descriptions, notes and time entries
   - account alert text
3. Trim it to the structure you need. One or two fields of each shape is enough.
4. Use made-up placeholders: Contoso Ltd and Fabrikam Ltd for accounts, Jane Doe and John Smith for people, T20260101.0001 for ticket numbers.

`tests/macros.test.js` builds its ticket page this way, from the markup above.
