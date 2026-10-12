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
- **Ticked rows** are marked by the grid's own drawn tick box ([Ticket grids](#ticket-grids)), which the frame reads and reports.
- **Third-party scripts.** The outer page loads feedback and guidance tools. One of them puts the signed-in user's details in `window.dataLayer`. Never copy those script blocks into a fixture or into this file.

## Ticket grids

Queues in My Workspace & Queues, and dashboard widgets' drill-down lists, show tickets in the same grid. Captured October 2026, from a drill-down.

```html
<tr class="Display Selected" data-row-key="100001">
  <td class="ImageSelectionCell FW61"><div class="Container"><div class="Decoration Icon CheckBox Selected"></div></div></td>
  <td class="ContextMenuCell FW30"><div class="Button ButtonIcon ContextMenu" data-route-key="0"><div class="Icon"></div></div></td>
  <td class="ImageCell SA FW30 AC"><img src="…/circle_3_gold_16x16.png" alt="Gold (3)" title="Gold (3)"></td>
  <td class="TextCell SA Link FW130 AL" onclick="…__openPage(new Autotask.NewWindowPage('TicketDetail',
      '/Mvc/ServiceDesk/TicketDetail.mvc?workspace=False&ids%5B0%5D=100001&ids%5B1%5D=100002…',
      false,'ticketId','100001',true))…">T20260101.0001</td>
  <td class="TextCell SA Link LW200 HW800 R AL" onclick="…the same…">Printer not working</td>
  <td class="TextCell SA LW200 HW800 R AL">…the description, cut short…</td>
  <td class="TextCell SA Link LW100 HW200 R AL" onclick="…NewWindowPage('AccountDetail',…,'accountId','…',true)…">Contoso Ltd</td>
  <td class="DateTimeCell SA FW72 AC"><div>01/01/2026</div><div>09:30</div></td>
  <td class="TextCell SA LW100 HW200 R AL">Doe, Jane (primary)</td>
  <td class="ColorSwatch ColorText ColorizedTextCell Color3 SA LW100 HW300 R AL">Waiting Customer</td>
  <td class="ColorSwatch ColorText ColorizedTextCell Color10 SA FW100 AL">High</td>
  <td class="TextCell SA Link …" onclick="…NewWindowPage('ContactDetail',…,'ContactId','…',false)…">Smith, John</td>
  <td class="TextCell SA FW100 AL">Support 1st Line</td>
</tr>
```

- **A data row** is `tr.Display` (`AT.sel.row`). Its `data-row-key` is the ticket's internal ID, the one `TicketDetail.mvc?ticketId=` needs (`AT.sel.rowKey`).
- **Ticked rows:** there's no real checkbox. The first cell draws one: `td.ImageSelectionCell .Decoration.Icon.CheckBox`, which gets `Selected` when ticked, as does the row (`tr.Display.Selected`). `tickedTickets()` looks for `.ImageSelectionCell .CheckBox.Selected` (`AT.sel.rowTicked`). Before October 2026 the script only looked for real checkboxes, so it never saw a tick.
- **Links aren't `<a>`s:** each link cell has an `onclick` calling `autotask.siteNavigation.__openPage(new Autotask.NewWindowPage(page, url, …, idName, id, …))`. The ticket's links carry `'ticketId','<id>'` and a URL listing every ticket in the grid (`ids[0]`, `ids[1]`, …, for next and previous). Inside the attribute the `&`s are written `&`. `findTicketRef()` reads the ID from `'ticketId','<id>'`, and falls back to the row's `data-row-key`.
- **Columns** follow the grid's own column layout, which you choose with the Column Chooser. So the ticket number is found by its pattern, and the other columns by their header names (`HEADERS`).
- **Cell styles:**
  - Status and priority cells are `ColorizedTextCell` with a `ColorN` class, which is where the colours the monitor shows come from.
  - Date cells (`DateTimeCell`) hold the date and the time in two `<div>`s. `cellText()` uses `innerText`, so the two stay apart.
  - Empty cells are `EmptyCell`.
  - Width and alignment classes (`FW`, `LW`, `HW` with a number; `AL`, `AC`) mean nothing to the script.

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

**The Queue monitor menu.** `ensureNavMenu()` puts a button just after `[data-slot="header:navigation-section"]`. The button copies the `className` of one of Autotask's `header:navigation-menu-button`s, plus `max-sm:hidden`, and that button's chevron `<span>`. So it takes on whatever Autotask's own buttons look like now. Its drop-down (`#atqm-navmenu`) is our own element at the end of `<body>`. It uses Autotask's colour classes (`bg-background-primary`, `border-border-primary`, `color-text-primary`, `hover:bg-background-hover`), which are all seen in the bar and side panels. Our own colours sit under them in `:where()` rules (no specificity), so they only apply if Autotask's classes go away. If Autotask redraws its bar, the button is put back within 3 seconds.

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

### Activity toolbar

Above the activity area, a toolbar of its own, built the same way. Captured October 2026.

```html
<div class="ToolBar">
  <div class="ToolBarItem Left ButtonGroupStart"><div data-tabbing-system="1" data-alpha-id="z…">
    <div class="Button2 ButtonIcon2 NormalBackground" id="z…" tabindex="0">
      <div class="Spacer"></div><div class="Icon2"><div class="StandardButtonIcon Time"></div></div>
      <div class="Text2">New Time Entry</div><div class="Spacer"></div>
    </div>
  </div></div>
  <div class="ToolBarItem Left">… New Note (StandardButtonIcon Note) …</div>
  <div class="ToolBarItem Left ButtonGroupEnd">… New Attachment (StandardButtonIcon Attachment) …</div>
  <div class="ButtonGroupDivider"></div>
  <div class="ToolBarItem Left ButtonGroupStart ButtonGroupEnd LockedWidth">… Refresh: IconOnly2, an empty .Text2 …</div>
</div>
```

- A built macro's **New time entry** presses New Time Entry with `findButton()` (the first of `AT.text.newTimeButtons`).
- New Note opens a note: not captured, and no block uses it yet.

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

Which fields a section shows, and in what order, varies from ticket to ticket. It follows the ticket's category and form. Another ticket's Billing had Estimated Hours before Purchase Order Number, and no Monitor Type, Co-managed Visibility or Closure Reason. So always find a field by its label, never by its position. A field with its own action has an icon button in its label container, after `.LabelContainer1`. For example, Additional Contacts has `.InlineIconButton.Note` titled "Notify Contacts", as Secondary Resources has "Notify Resources".

`QuickEditEnabled` with `ClickEnabled` means clicking the label edits that one field in place. The script doesn't use this yet. It could replace the full edit page for changing a single field.

**The Account field is read directly.** The page has several `.LinkButton2` links (Account, Contact, Primary Resource and others). The script used to accept any of them, so a contact with the same name as the target account made a ticket count as "already on it". `accountShown()` now reads the Account field. It only falls back to "any link" on a page without `.ReadOnlyData` fields.

### Heading

`.EntityHeadingContainer` holds:

- the ticket category (`.CategoryChip .Name`)
- the ticket type (`.TypeChip`, e.g. Incident)
- the ticket number (`.IdentificationText`)
- the title (`.Title .Text`)
- when it was created and by whom (`.Bundle`)

An Only if reads the category and type from here (`AT.sel.ticketCategory`, `AT.sel.ticketType`), for its Ticket Category and Ticket Type fields. Only these selectors were noted, not the markup around them: the tests build the heading from them alone. The script uses none of the others.

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

- **Opening the ticket.** It waits for the page to settle, then reads the Account field, Sub-Issue Type and Work Type. A type the ticket already has is never written over, even if the edit page appears to show nothing there.
  - **Already on the target account:** if a type it was given is empty on the ticket, it still edits the ticket for that type and leaves the account alone. Otherwise it skips the ticket.
  - **Otherwise:** it presses Edit. If Autotask opens the edit page in a window of its own and the browser blocks it, the ticket fails straight away with "allow pop-ups" (`pressEdit()` watches `window.open` for 5 seconds).
- **After saving.** The ticket counts as done once the Account field shows the new account and each type it filled in shows what it picked. If a type shows something else, the ticket is marked **Check it**.

## Ticket edit page

Captured October 2026. The title bar reads `Edit Ticket -` followed by the ticket number, so `openTicketId()` (which wants "Ticket") doesn't take it for the ticket page. The body has the class `EntityEdit` (the ticket page's is `EntityDetail`). **Edit opens it in the same tab, as a new page load**, so the script starts afresh there. The macro's job carries over through sessionStorage, and the macro tab keeps its window name. (`pressEdit()` still watches for a blocked window, in case some setup opens one.)

### Toolbar

All `.Button2 > .Text2`, as on the ticket page:

- **Save**: saves and reloads the same tab back to the ticket page.
- **Save & Close**: saves and goes on to close the ticket, with a drop-down for the closing note. It's for finishing a ticket, not leaving the page.
- **Cancel**.
- **Save & ...**, a drop-down whose hidden menu holds Save & Enter Time, Save & Add Note, Save & Create New and Save & Assign to Taskfire.
- **Notify Taskfire**, usually disabled.

Change account, and a built macro's **Save ticket**, only ever press plain **Save** (`AT.text.saveButton`), then check the ticket page they land back on. The text is matched exactly, so neither Save & Close nor the Save & ... menu's buttons are pressed. `AT.text.saveButtons` (both) is only for recognising the edit page.

A built macro's **Save ticket & enter time** presses **Save & Enter Time** (`AT.text.saveAndTime`) from the Save & ... menu. `menuButton()` finds the hidden button in a `.ContextOverlayContainer` (`AT.sel.menu`), presses the visible part of its `.DropDownButton2` (`AT.sel.dropButton`, `AT.sel.menuOpener`) to open the menu, and waits for the button to show. **Not captured yet:** the menu's own markup, so which part opens it is a guess (its button, or something with Arrow in its class).

### Speed code box

It sits at the right of the toolbar: `.FormTemplateSelector > .SingleItemSelector2`, a single-item picker (below) whose list has recent, personal, department and company speed codes under `.GroupHeader`s. Its empty selection reads "Enter Speed Code or Choose Template".

Change account never uses it, because a speed code sets fields over whatever is already in them. `AT.sel.formTemplate` is excluded from `findField()` and from `pickOptions()`, so no other field's typing or picking can land in it. Only a built macro's **Ticket speed code** block uses it (and **Time entry speed code**, the same way, in a time entry):

- `speedCodeBox()` finds the box and its search box, as `findField()` would give a field, marked `template`.
- `chooseOption()` types the code and picks from the box's own list (`pickOptions(name, scope, true)`).

**Its list**, captured October 2026 from a time entry's (same widget). Codes and names here are placeholders:

```html
<div class="ContextOverlayContainer"><div class="ContextOverlay SingleItemSelectorDropDownOverlay"><div class="Content">
  <div class="ItemSet"><div class="ItemList">
    <div class="Item" data-item-type="Default" data-index="0" data-is-targeted="true" data-is-selected="true">
      <div class="Text"><span>Enter Speed Code or Choose Template</span></div></div>
    <div class="GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">Recently Used</div></div>
    <div class="Item" data-item-type="SingleText" data-index="1"><div class="Text"><span>PWR-100 - Password reset</span></div></div>
    <div class="GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">Personal</div></div>
    …
    <div class="GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">Department</div></div>
    <div class="Item" data-item-type="SingleText" data-index="7"><div class="Text"><span>PWR-100 - Password reset</span></div></div>
    …
    <div class="GroupHeader" data-item-type="GroupHeader"><div class="HeaderText">Company</div></div>
    …
  </div></div>
</div></div></div>
```

- **Each line is "code - template name"** (a speed code such as `PWR-100`, then ` - `, then the name). The script takes a line that is the code, has a part that is the code, or starts with the code and then a separator. Failing those, it takes the only line containing it. With several, it doesn't guess. Typing the code itself is the reliable way: `PWR-10` doesn't take `PWR-100`.
- **Headings** are `.GroupHeader`s, not `.Item`s, so they're never picked. (`AT.sel.pickHeader` also keeps off a heading built as an `.Item`.) Its groups are Recently Used, Personal, Department and Company.
- **The same speed code can be under two headings** (Recently Used and Department, say). For the speed code box only, lines with the same text count as one choice. Elsewhere two lines the same are two choices (two accounts with the same name), and the script doesn't guess between them.
- The first line, `data-item-type="Default"`, is the empty choice, showing "Enter Speed Code or Choose Template". It's never picked.
- **Not captured yet:** what the box shows after a pick. The pick counts as taken once the list closes (or the box shows it), since the template applies to the other fields rather than staying in the box.
- **Not captured yet:** whether applying a template ever asks something (replace what's there?) or reloads the edit page. A question with buttons other than OK fails the ticket unsaved with Autotask's words, and so does the page loading again part-way through a block (see `runBuilt()`). Either note says what to capture.

### Fields

Every field is a label followed by its editor, side by side in the section's `.Content`:

```html
<div class="EditorLabelContainer1">
  <div class="LabelContainer1"><div class="Text"><span class="PrimaryText">Sub-Issue Type</span></div>
    <div class="Required Active">*</div><div class="WalkMeIconPlaceholder"></div></div>
</div>
<div class="Size1">… the editor …</div>
```

- A required field's asterisk has `Required Active`. A field that isn't required has no `Required` element at all (Contact, Location).
- Account's editor is wrapped in `.BundleContainer > .EditorContainer`, with icon buttons beside it (open tickets for the account, new).
- `findField()` takes `.EditorLabelContainer1` as the label (its text is "Sub-Issue Type*") and finds the editor's search box after it. The editor is the label's next sibling, which `findField()` returns as `editor`.
- The sections (`.DetailsSection`) match the ticket page's: the top one with no heading (Account, Contact, Status, Priority), then Ticket Information, Assignment and Billing.
  - Collapsible ones are `.CollapsibleSectionContainer`, with a `.HeadingContainer`.
  - Autotask remembers which you've closed. A field in a closed section is hidden, so `findFieldOpening()` presses the section's heading to open it first.
- **Billing** on the edit page:

  | Field | Editor |
  |---|---|
  | Additional Contacts | `.MultipleDataSelector2`: a data picker that holds several chips (`.ChipList.MultipleDataSelection`), its chip list after the button rather than inside `.ContentContainer` |
  | Contract | data picker |
  | Service/Bundle | single-item picker |
  | Work Type | **data picker**, not a single-item picker. Its chosen work type is a chip; its drop-down list (`SingleDataSelectorDropDownOverlay`) has every work type; typing searches |
  | Estimated Hours | `<input class="DecimalBox2" maxlength="11">` straight in its `.Size2`, no picker |
  | Purchase Order Number | `<input class="TextBox2" maxlength="50">` straight in its `.Size1` |
  | Line of Business | single-item picker |

  Work type names are your own company's list in Autotask, such as Remote Support, Onsite Support and Meeting. Typing "Onsite" finds Onsite Support, the only one containing it, which the macro then picks.
- **Fields that depend on others are locked until those are filled in.** The editor gets `Disabled Locked`, its search box `Disabled`, its input `disabled`, and its icon buttons `Disabled2`. Its placeholder says what to choose first:
  - **With no account:** Contact, Contract and Additional Contacts read "Choose Account".
  - **With no contract:** Service/Bundle reads "Choose Contract".
  - A locked single-item picker shows its placeholder as its `Default` item, for example `<div class="Item" data-item-type="Default">…Choose Contract…</div>`. So a `Default` item can have text, and "empty" means `data-item-type="Default"`, whatever the text. That's how `fieldShows()` reads it.
  - Picking a new account presumably resets these, so Contract and Service/Bundle may need choosing again. The macro doesn't touch them.
- **Required fields left empty** are marked `Invalid`: both the label (`.LabelContainer1.Invalid`) and the editor (`.SingleDataSelector2.Invalid`). `formProblem()` names the marked fields from their labels ("Check Account"). It never reads the marked editor's own text, which is just "Type to search..." and the like.

### The two kinds of picker

**Single-item picker** (`.SingleItemSelector2`): Status, Priority, Issue Type, Sub-Issue Type, Source, Queue, and the speed code box.

```html
<div class="SingleItemSelector2">
  <div class="ContentContainer">
    <div class="ValueContainer">
      <div class="TargetPreview">Other</div>
      <div class="SearchBox"><input type="text"></div>
      <div class="SelectionDisplay">
        <div class="Item" data-item-type="SingleText"><div class="Text"><span>Other</span></div></div>
      </div>
    </div>
    <div class="Triangle"><div class="InlineIcon Carrot"></div></div>
  </div>
  <div class="ContextOverlayContainer">
    <div class="ContextOverlay SingleItemSelectorDropDownOverlay"><div class="Content"><div class="ItemSet"><div class="ItemList">
      <div class="Item" data-item-type="Default" data-index="0"><div class="Text"><span></span></div></div>
      <div class="Item" data-item-type="SingleText" data-index="1"><div class="Text"><span>Hardware</span></div></div>
      …
    </div></div></div></div>
  </div>
</div>
```

- **What's chosen** shows twice: as text in `.TargetPreview`, and as an `.Item` in `.SelectionDisplay`.
  - `data-item-type="Default"` with empty text means nothing is chosen. That's how `fieldShows()` tells an empty field.
  - The chosen `.Item` uses the same class as the choices in the list. `pickOptions()` therefore never picks inside `.SelectionDisplay`: another field showing "Other" isn't a choice.
- **The list** is in the picker's own `.ContextOverlayContainer`. Its first line is always the empty `Default` item. The chosen line has `data-is-selected="true"`, and the keyboard's line `data-is-targeted="true"`. Status and Priority lines (`data-item-type="IconSingleText"`) also have a coloured icon before the text.
- **Typing in the search box** narrows the list (assumed). The macro picks from the field's own list first (`pickOptions(name, scope)`), and from any open list only when the field has none.

**Data picker** (`.SingleDataSelector2`): Account, Contact, Location, Contract, Work Type. `.MultipleDataSelector2` is the same with several chips (Additional Contacts).

```html
<div class="SingleDataSelector2">
  <div class="ContentContainer">
    <div class="SearchBox"><div class="Placeholder">Type to search...</div><input type="text"></div>
    <div class="ChipList SingleDataSelection">
      <div class="Chip"><div class="Text">Contoso Ltd</div><div class="RemoveButton"><div class="RemoveIcon"></div></div></div>
    </div>
  </div>
  <div class="Button2 EditorButton2 IconOnly2 ButtonIcon2">… opens a full selector …</div>
  <div class="ContextOverlayContainer"><div class="ContextOverlay SingleDataSelectorDropDownOverlay">… "or open selector" …</div></div>
  <div class="ContextOverlayContainer"><div class="ContextOverlay SingleDataSelectorAutoCompleteOverlay">
    <div class="Content"><div class="LoadingIndicator"></div><div class="ItemSetContainer"></div></div>
  </div></div>
</div>
```

- **What's chosen** is the `.Chip` in `.ChipList`. There's none when the field is empty, and the "Type to search..." placeholder isn't a value.
- **Typing in the search box** opens the autocomplete overlay after a moment. It gets the class `Active` and an inline `left`/`top`. `.ItemSetContainer` stays empty; the results are a new `.ItemSet` after it:

  ```html
  <div class="ContextOverlay SingleDataSelectorAutoCompleteOverlay Active" style="left: …px; top: …px;">
    <div class="Content">
      <div class="LoadingIndicator"></div>
      <div class="ItemSetContainer"></div>
      <div class="ItemSet"><div class="ItemList">
        <div class="Item" data-item-type="SingleText" data-index="0" data-is-targeted="false"><div class="Text"><span><mark>Contoso</mark> IT</span></div></div>
        <div class="Item" data-item-type="SingleText" data-index="1" data-is-targeted="true"><div class="Text"><span><mark>Contoso</mark> IT Solutions</span></div></div>
      </div></div>
    </div>
  </div>
  ```

  - Every account whose name contains what was typed is listed, by name only, with the typed part in `<mark>`. The line's text is still the whole name.
  - One line has `data-is-targeted="true"`, the keyboard's highlight.
  - The macro matches the whole name. With several lines containing what it typed, it doesn't guess: it fails the ticket with "N accounts match …: use the full name".
  - The overlay sits inside the field's own markup, so `pickOptions(name, scope)` finds it there.
- **Contact's chip** has an icon before its text: `<div class="ItemGroupingIcon ChildAccount"></div><div class="Text">Jane Doe</div>`.
- **Contact's list**:
  - It's split by `.GroupHeader`s (`data-item-type="GroupHeader"`, text in `.HeaderText`): "Account Contacts", then "Parent Account Contacts" when the account has a parent. The same person can be in both groups.
  - Each line is `data-item-type="IconPersonName"` (or `PersonName` without the icon): an `.ItemGroupingIcon ChildAccount` or `ParentAccount`, then the first and last names in two `.Text` children. The primary contact's last name ends "(primary)".
  - The line's `textContent` runs the two names together with no space, so matching a person needs the `.Text` parts joined with a space.
- **Location** is a data picker too, but without the `.BundleContainer > .EditorContainer` wrapper Account and Contact have.
- **Required single-item pickers** (Status, Priority) have no empty `Default` line: their list starts with the first real choice. Optional ones (Issue Type, Sub-Issue Type, Source) start with it.

**After a pick**, `chooseOption()` waits up to `MACRO.confirm` (3 s) for the field to show it:

- a data picker's chip, or a single-item picker's selection
- for a plain box, its text

If the field doesn't show it, the ticket fails unsaved.

**When the list doesn't load**, which Autotask sometimes does after typing: if the name hasn't come up within `MACRO.pick` (3 s), the macro clears the box, waits `MACRO.retype` (0.5 s) and types it again, `MACRO.tries` (3) times in all.

### Other editors

- **Due Date**: `.DateAndTimeEditor` with a `.DateBox2` and a `.TimeBox2`, each a plain `<input type="text">` holding the date or time as you'd type it. On a time entry, `DateBox2` and `TimeBox2` are `<div>`s around the box, with a calendar or clock button beside it (see [Time entry](#time-entry)), so `AT.sel.plainBox` takes a box inside them too.
- **Numbers and free text** (Estimated Hours, Purchase Order Number): a plain `<input type="text">` with the class `DecimalBox2` or `TextBox2`, straight in its size box with no picker around it. `fieldShows()` reads its value.
- A built macro's **Set a ticket field** (and Hours worked, and Set a time entry field) types into these (`AT.sel.plainBox`) rather than waiting for a list, and fires `change` and blurs the box. It counts as taken when the box keeps the text, or the same number ("2" kept as "2.00").

### Validation

- **No errors:** `.ValidationSummary > .FormValidation.Valid`, with an empty `.Count` and `.Message`.
- **Errors:** a field that's wrong gets `Invalid` on its label (`.LabelContainer1.Invalid`) and on its editor. The summary at the top goes `Active`. For a required field left empty, it says just "Required":

  ```html
  <div class="ValidationSummary Active">
    <div class="CustomValidation Valid"></div>
    <div class="FormValidation Single"><div class="ErrorContent"><div class="TransitionContainer">
      <div class="IconContainer"><div class="Icon"></div></div>
      <div class="TextContainer"><span class="Count"></span><span class="Count Spacer"> </span><span class="Message">Required</span></div>
    </div></div>
    <div class="ChevronContainer"><div class="Up DisabledState"></div><div class="Down DisabledState"></div></div></div>
  </div>
  ```

  `Single` is for one error. With several errors it's presumably `Multiple`, with a count and the arrows (`ChevronContainer`) to step through them.
- **What the macro reports:** "Not saved: Required: Account", made from the summary's message and other messages it finds (`AT.sel.formError`, two at most) and the fields marked `Invalid`, by their labels. With no message, it says "Check Account".

## Time entry

New Time Entry (the ticket page's [activity toolbar](#activity-toolbar)) opens it as a **dialog**, not a page. Captured October 2026, down to Start Time.

```html
<div class="VerticalContainer">
  <div class="Header">
    <div class="TitleBar1">
      <div class="Title"><span class="Text">New Ticket Time Entry</span></div>
      <div class="DialogTitleBarButton"><div class="DialogTitleBarIcon Help"></div></div>
      … PopOut, Minimize …
      <div class="DialogTitleBarButton"><div class="DialogTitleBarIcon Close"></div></div>
    </div>
    <div class="ValidationSummary">… as the edit page's …</div>
    <div class="ToolBar">
      <div class="ToolBarItem Left ButtonGroupStart ButtonGroupEnd">… a .Button2: StandardButtonIcon Save, .Text2 "Save &amp; Close" …</div>
      … "Save &amp; New" (SaveAndNew), "Save &amp; Forward/Modify" (SaveAndForward) …
      <div class="ToolBarItem FormTemplateSelector Right"><div class="FormTemplateSelector"><div class="SingleItemSelector2">…</div></div>
        … and a search button (StandardButtonIcon Search) …</div>
    </div>
  </div>
  <div class="Body">
    <div class="MessageBarContainer Active">… the account's alert, if it has one …</div>
    <div class="IdentificationContainer ReadOnly">
      <div class="EntityTypeIcon TicketTimeEntry"></div>
      <div class="Left">
        <div class="IdentificationTextContainer"><div class="IdentificationText">T20260101.0001</div> … copy buttons …</div>
        <div class="Title" title="…"><div class="Text">Printer not working (Contoso Ltd)</div></div>
      </div>
      <div class="Right"><div class="StopwatchContainer"><div class="StopwatchTime">00:00:34</div> … Start/Pause, Clear …</div></div>
    </div>
    <div class="Normal Section"><div class="CollapsibleSectionContainer">
      <div class="HeadingContainer">… <span class="PrimaryText">Ticket Status</span> …</div>
      <div class="ContentContainer"><div class="Content">… the sections' fields …</div></div>
    </div></div>
    … Billing, Time Entry Details …
  </div>
</div>
```

- **The title** is in `.TitleBar1 .Title .Text` (`AT.sel.formTitle`), the same as the Column Chooser's, and reads "New Ticket Time Entry" (`AT.text.timeTitle`).
- **No Cancel button.** Its toolbar has Save & Close, Save & New and Save & Forward/Modify. It closes with the ✕ in its title bar (`.DialogTitleBarButton` around `.DialogTitleBarIcon.Close`, `AT.sel.dialogTitleButton` and `dialogClose`). That's what **Cancel time entry** presses (`timeEntryClose()`).
- **Save time entry** presses Save & Close (the first of `AT.text.timeSaveButtons`).
- **The ticket it's for** is in `.IdentificationContainer .IdentificationText` (`AT.sel.formTicket`). `timeEntryPage()` doesn't take a time entry showing another ticket's number for this ticket's.
- **The account alert** (`.MessageBarContainer`) is your own team's text about the customer: never copy it into a fixture or into this file.
- **The speed code box** is the same `.FormTemplateSelector` as the edit page's, with its list (see [Speed code box](#speed-code-box)).

**Its sections**, each a `.CollapsibleSectionContainer` with fields built as the edit page's (`.EditorLabelContainer1` and its editor):

| Section | Field | Editor |
|---|---|---|
| Ticket Status | Status | single-item picker. The ticket's status, as it is when the time entry is saved. Its lines are `IconSingleText`, a coloured icon before the text. Beside it: "Status as of … Get current Status" (a link). |
| Billing | Role | single-item picker (with the empty `Default` line) |
| | Work Type | data picker (its chip; its full list; typing searches) |
| | Non-Billable | `.Checkbox2 > .TabIndexHack.Checked Disabled`, set by the work type |
| | Contract | data picker |
| | Service/Bundle | single-item picker, `Disabled`, with empty `.GroupHeader.NoItems` headings ("Services", "Service Bundles") |
| Time Entry Details | (a timeline) | `.TimeEntryTimelineShell`: the week's days as buttons, and the day's time entries drawn in 15-minute blocks. Nothing to fill in. |
| | Date | `<div class="DateBox2"><input type="text" value="01/01/2026"> … a calendar button …</div>`: the class is on the `<div>`, not the box |
| | Start Time | `<div class="TimeBox2"><input type="text" value="09:00"> … a clock button …</div>` |

**Not captured yet** (the capture stopped after Start Time):

- End Time, Hours Worked, and Summary Notes and Internal Notes. Hours worked finds its field by `AT.text.hoursLabel`. **Summary notes** and **Internal notes** find a `<textarea>` or a box you type in (`contenteditable`) after their label (`AT.text.summaryLabel`, `internalLabel`, `findTextBox()`). A rich text editor in a frame of its own wouldn't be found, and the block says so.
- **Where the dialog is**: laid over the ticket page in the same page, or in a frame of its own. The script handles both:
  - **In the same page.** The ticket page counts as the time entry while the dialog shows (`pageKind()` looks for the time entry first). New time entry is through once it does, and Save time entry once Save & Close has gone.
  - **In a frame.** The copy of the script there does the time entry's steps (it knows the ticket from the macro tab's name). The ticket page waits, then loads again to carry on.
- What Save & New and Save & Forward/Modify do. No block presses them.

## What built macros do on these pages

Macros made in the Macro builder are lists of blocks (`BLOCKS` in the script). Each block works on one page (`PAGES`: the ticket page, the edit page, a time entry), and some lead to another (Enter edit mode, Save ticket, Save ticket & enter time, New time entry, Save time entry). `macroFlow()` follows them from the ticket page, so it knows which page each step runs on. The builder won't save a macro with a step on the wrong page, or one ending anywhere but the ticket page. `ROUTES` holds the blocks that get from one page to another, which the builder offers as the fix.

The job keeps a step pointer per ticket (`item.step`). `runBuilt()` does the steps for whichever page is showing (`pageKind()`), so a ticket can go ticket page → edit page → time entry → ticket page as its steps need.

- **Leading to another page.** Where the ticket is up to (the next step, and `navAt`, when the button was pressed) is kept before the button is pressed, so the page it leads to carries on from there. `leadAway()` then waits:
  - for the page to go (a new page load) or the button to disappear (a page redrawn in place);
  - or for the page it leads to to show in this one (the time entry's dialog laid over the ticket page, its New Time Entry button still showing);
  - or for a window of its own to open. Then this page is from before `navAt` (`PAGE_T0` is when each page loaded), so it waits. Once that window has had time to finish (`MACRO.stale`), the ticket page loads again to carry on.
  - If the page is still there after `MACRO.saved` and Autotask says why (a question, a marked field), the ticket fails. Otherwise it's left to load; one that never comes is given up on as stuck after `MACRO.stage`.
- **Part-way.** While a step is under way its number is kept (`item.doing`). A page that loads again with one set fails the ticket rather than doing that step again, which could go round for ever.
- **Fields by name.** A block names a field as you'd read it ("Sub-Issue Type"). `fieldSpec()` turns that into a label pattern like `AT.text`'s, allowing the trailing `*` and a space or hyphen either way. The names the builder offers are `AT.text.ticketFields` and `AT.text.timeFields`.
- **Only if** reads each line's field on the ticket page with `ticketField()`: its value container's text, so a colour band's (Status, Priority) is its text. Ticket Category and Ticket Type aren't fields there, so they're read from the heading (see [Heading](#heading)). A field the page doesn't show, on any line, fails the ticket rather than guessing.
- **Enter edit mode** first reads each "only if it's empty" ticket field of the edit steps after it off the ticket page, as Change account does with the types.
- **On the edit page**, Set a ticket field uses `findFieldOpening()` (so a closed section is opened) and `chooseOption()`, or types into a plain box (`AT.sel.plainBox`).
- **After Save ticket**, the ticket page it lands back on is checked: each field it picked should show it there, or the ticket is marked Check it.
- **Quick note** uses the ticket page's Quick note (`AT.sel.quickNote`): it types into the `<textarea>`, picks the note type from the `<select>` by its text, waits for Save to lose `Disabled2` (`AT.sel.disabledButton`), presses it, and counts it saved once the box empties.

## Macro tabs

A macro run on ticked tickets opens each ticket in a tab of its own, up to `CONFIG.macroTabs` at once.

- **Names.** Each tab is named `atqm_macro:` and its ticket number (`MACRO_WIN`). That's how its copy of the script knows which ticket is its own (`myItem()`). It also notes the job and the ticket in sessionStorage (`MACRO_SS`, `MACRO_ITEM_SS`), which any window Autotask opens from it inherits.
- **Driving.** The page you started it from drives it (`macroStep()`). It opens tabs for waiting tickets while fewer than that many are under way, and closes a tab once its ticket is finished with. If the browser won't open another tab (pop-ups not allowed for autotask.net), the next ticket goes in a finished ticket's tab instead: renamed for it and sent to its page.
- **Closing.** A macro tab whose ticket is finished with closes itself after `MACRO.linger`, unless it has been renamed for another ticket by then. That's for when the driving page has gone.

## Capturing a page safely

1. In the browser, open DevTools (F12), right-click the element you need (or `<body>`) and choose **Copy → Copy outerHTML**.
2. Before saving it in the repository, as a fixture or in this file, replace everything that identifies anyone:
   - people's names, email addresses and phone numbers
   - account, company and site names
   - ticket numbers, titles, descriptions, notes and time entries
   - account alert text
3. Trim it to the structure you need. One or two fields of each shape is enough.
4. Use made-up placeholders: Contoso Ltd and Fabrikam Ltd for accounts, Jane Doe and John Smith for people, T20260101.0001 for ticket numbers.

**Keep each copy small.** Copy the one part you need (a section, a field) rather than `<body>`. A whole page runs past 50,000 characters and gets cut off when pasted.

**Lists that close when you right-click.** Autotask closes its drop-downs as soon as the page loses focus, which happens when you open DevTools or right-click. To copy one, open DevTools on the **Console** tab first. If the page is inside Autotask's frame, pick that frame in the console's context drop-down, which reads "top" by default. Then run:

```js
setTimeout(() => {
  const open = [...document.querySelectorAll('.ContextOverlay')].filter(o => o.getClientRects().length && o.querySelector('.Item'));
  window.atqmList = open.map(o => o.outerHTML).join('\n\n');
  console.log(`Kept ${open.length} open list(s). Now click in this console and run: copy(atqmList)`);
}, 6000);
```

Within 6 seconds, click back into the page and open the list (type into the box, or click its arrow). After 6 seconds, whatever list is open is kept in `atqmList`. Then click into the console and run `copy(atqmList)` to put it on the clipboard. Two steps, because Chrome's `copy()` only works while DevTools has the focus, and during the 6 seconds the page has it.

`tests/pages.js` builds the ticket page and its edit page this way, from the markup above, for the macro tests.
