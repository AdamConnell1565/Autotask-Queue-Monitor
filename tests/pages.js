'use strict';
// Autotask's pages as tests build them, from the structure in docs/autotask-pages.md: placeholders throughout, never
// anything copied from a real ticket.

// The ticket page, built as Autotask builds it (see docs/autotask-pages.md): the title bar, the Edit button,
// and read-only fields, label then value. A note's Save is on the page too, and isn't the edit page's.
const field = (label, value) => '<div class="ReadOnlyData QuickEditEnabled"><div class="ReadOnlyLabelContainer"><div class="LabelContainer1">' +
  `<div class="Text ClickEnabled"><span class="PrimaryText">${label}</span></div><div class="Required">*</div><div class="WalkMeIconPlaceholder"></div></div></div>` +
  `<div class="ReadOnlyValueContainer"><div class="Value">${value}</div></div></div>`;
const linkTo = text => `<div class="LinkButtonWrapper2"><div class="LinkButton2" tabindex="0"><div class="Text2">${text}</div></div></div>`;
// status: a Status field too, as a colour band (none unless given). category: the heading too, with the ticket's
// category and type (by the selectors in the docs; the heading's markup around them wasn't captured)
const ticketPage = (id, account, { contact = 'Jo Bloggs', subIssue = 'Other', workType = 'Remote Support', status, category } = {}) => '<!doctype html><body>' +
  `<div class="TitleBarItem Title"><span class="Text">Ticket </span><span class="SecondaryText">- ${id} - Laptop</span></div>` +
  (category ? `<div class="EntityHeadingContainer"><div class="CategoryChip"><div class="Name">${category}</div></div><div class="TypeChip">Incident</div>` +
    `<div class="IdentificationText">${id}</div><div class="Title"><div class="Text">Laptop</div></div></div>` : '') +
  '<div class="ToolBar"><div class="Button2 ButtonIcon2 NormalBackground" id="edit" tabindex="0"><div class="Spacer"></div>' +
  '<div class="Icon2"><div class="StandardButtonIcon Edit"></div></div><div class="Text2">Edit</div><div class="Spacer"></div></div></div>' +
  '<div class="ReadOnlyDetailsContainer">' + field('Account', linkTo(account)) + field('Contact', linkTo(contact)) +
  (status ? field('Status', `<div class="ColorBand ColorSwatch Color3"><div class="Right"><div class="Text ColorSample">${status}</div></div></div>`) : '') +
  field('Issue Type', 'Support') + field('Sub-Issue Type', subIssue) + field('Work Type', workType) + '</div>' +
  '<div class="QuickNote"><textarea placeholder="Add a note..."></textarea><div class="Button2 Disabled2" tabindex="0"><div class="Text2">Save</div></div></div>' +
  '<input type="text" placeholder="Search..."></body>';
const editPage = '<!doctype html><body>' +
  '<div class="FormTemplateSelector"><input type="text"></div>' +
  '<div class="Field"><div class="Label"><label>Account</label></div><div class="Value"><input type="text" id="acc" value="Fabrikam Ltd"></div></div>' +
  '<div class="Field"><div class="Label"><label>Contact</label></div><div class="Value"><input type="text"></div></div>' +
  '<div id="drop"></div>' +
  '<div class="Button2" id="save"><span class="Text2">Save</span></div></body>';

// The edit page with a Sub-Issue Type and a Work Type, as given
const typesPage = (subIssue, workType) => editPage.replace('<div id="drop">',
  `<div class="Field"><div class="Label"><span>Sub-Issue Type</span></div><div class="Value"><input type="text" id="sub" value="${subIssue}"></div></div>` +
  `<div class="Field"><div class="Label"><span>Work Type</span></div><div class="Value"><input type="text" id="work" value="${workType}"></div></div>` +
  '<div id="drop">');
// Autotask's drop-down list: typing in the box lists these, and clicking one puts it in the box
const offer = (doc, input, names) => input.addEventListener('input', () => {
  const drop = doc.getElementById('drop');
  drop.innerHTML = names.map(n => `<div class="Item">${n}</div>`).join('');
  for (const item of drop.querySelectorAll('.Item')) item.addEventListener('click', () => { input.value = item.textContent; drop.innerHTML = ''; });
});

// Autotask's ticket edit page as it's built today: structure only, placeholders throughout (see docs/autotask-pages.md)
const editorLabel = label => '<div class="EditorLabelContainer1"><div class="LabelContainer1"><div class="Text">' +
  `<span class="PrimaryText">${label}</span></div><div class="Required Active">*</div><div class="WalkMeIconPlaceholder"></div></div></div>`;
// A single-item picker (Status, Sub-Issue Type…): what's chosen, a search box, and its list (closed)
const itemPicker = (id, chosen, options) => `<div class="Size1"><div class="SingleItemSelector2" id="${id}"><div class="ContentContainer"><div class="ValueContainer">` +
  `<div class="TargetPreview">${chosen}</div><div class="SearchBox"><input type="text"></div><div class="SelectionDisplay">` +
  `<div class="Item" data-item-type="${chosen ? 'SingleText' : 'Default'}"><div class="Text"><span>${chosen}</span></div></div></div></div>` +
  '<div class="Triangle"><div class="InlineIcon Carrot"></div></div></div><div class="ContextOverlayContainer" style="display:none">' +
  '<div class="ContextOverlay SingleItemSelectorDropDownOverlay"><div class="Content"><div class="ItemSet"><div class="ItemList">' +
  '<div class="Item" data-item-type="Default" data-index="0"><div class="Text"><span></span></div></div>' +
  options.map((o, i) => `<div class="Item" data-item-type="SingleText" data-index="${i + 1}"><div class="Text"><span>${o}</span></div></div>`).join('') +
  '</div></div></div></div></div></div></div>';
// A data picker (Account, Contact, Work Type…): a search box, the chosen value as a chip, its full list (closed;
// Work Type's has every work type), and a list of what typing finds. Account and Contact sit in a .BundleContainer.
const dataPicker = (id, chosen, { all = [], bundle = true } = {}) => (bundle ? '<div class="BundleContainer"><div class="EditorContainer">' : '') +
  `<div class="Size1"><div class="SingleDataSelector2" id="${id}">` +
  '<div class="ContentContainer"><div class="SearchBox"><div class="Placeholder">Type to search...</div><input type="text"></div>' +
  `<div class="ChipList SingleDataSelection">${chosen ? `<div class="Chip"><div class="Text">${chosen}</div><div class="RemoveButton"></div></div>` : ''}</div></div>` +
  '<div class="ContextOverlayContainer" style="display:none"><div class="ContextOverlay SingleDataSelectorDropDownOverlay"><div class="Content"><div class="ItemSet"><div class="ItemList">' +
  all.map((o, i) => `<div class="Item" data-item-type="SingleText" data-index="${i}"><div class="Text"><span>${o}</span></div></div>`).join('') + '</div></div></div></div></div>' +
  '<div class="ContextOverlayContainer" style="display:none"><div class="ContextOverlay SingleDataSelectorAutoCompleteOverlay"><div class="Content">' +
  '<div class="ItemSetContainer"></div></div></div></div></div></div>' + (bundle ? '</div></div>' : '');
const WORK_TYPES = ['Meeting', 'Onsite Support', 'Remote Support', 'Server Support Billable (On Site)'];
const section = (id, title, fields, closed) => '<div class="DetailsSection"><div class="CollapsibleSectionContainer">' +
  `<div class="HeadingContainer" id="${id}-head"><div class="DetailsSectionHeading Title"><div class="Left"><span class="Text">${title}</span></div></div></div>` +
  `<div class="ContentContainer" id="${id}"${closed ? ' style="display:none"' : ''}><div class="Content">${fields}</div></div></div></div>`;
const realEditPage = ({ subIssue = '', workType = 'Remote Support', billingClosed = true } = {}) => '<!doctype html><body>' +
  '<div class="TitleBarItem Title"><span class="Text">Edit Ticket -</span><span class="SecondaryText">T20261007.0081 - Laptop (Fabrikam Ltd)</span></div>' +
  '<div class="ValidationSummary"><div class="FormValidation Valid"><div class="ErrorContent"><div class="TextContainer">' +
  '<span class="Count"></span><span class="Message"></span></div></div></div></div>' +
  '<div class="ToolBar"><div class="Button2" id="save"><div class="Text2">Save</div></div>' +
  '<div class="Button2" id="saveclose"><div class="Text2">Save &amp; Close</div></div><div class="Button2"><div class="Text2">Cancel</div></div>' +
  '<div class="FormTemplateSelector"><div class="SingleItemSelector2"><div class="ValueContainer"><div class="SearchBox"><input type="text"></div>' +
  '<div class="SelectionDisplay"><div class="Item" data-item-type="Default"><div class="Text"><span>Enter Speed Code or Choose Template</span></div></div></div></div></div></div></div>' +
  '<div class="DetailsSection"><div class="Content">' + editorLabel('Account') + dataPicker('acc', 'Fabrikam Ltd') +
  editorLabel('Contact') + dataPicker('con', 'Jane Doe') + '</div></div>' +
  section('info', 'Ticket Information', editorLabel('Sub-Issue Type') + itemPicker('sub', subIssue, ['Hardware', 'Other', 'Software']) +
    editorLabel('Source') + itemPicker('src', 'Other', ['Email', 'Other', 'Phone'])) +
  section('billing', 'Billing', editorLabel('Work Type') + dataPicker('work', workType, { all: WORK_TYPES, bundle: false }), billingClosed) +
  '</body>';
// How those pickers behave: typing opens the list (a data picker's with what it finds, from found by its id),
// clicking a line chooses it (takes: false, a click that doesn't), and a closed section opens from its heading
function autotaskPickers(doc, { found: lists = { acc: ['Northwind Ltd'], work: WORK_TYPES }, takes = true } = {}) {
  const choose = (picker, overlay, input, html) => item => item.addEventListener('click', () => {
    if (takes) picker.querySelector('.SelectionDisplay, .ChipList').innerHTML = html(item.textContent);
    overlay.style.display = 'none';
    input.value = '';
  });
  for (const p of doc.querySelectorAll('.SingleItemSelector2[id]')) {
    const input = p.querySelector('.SearchBox input'), overlay = p.querySelector('.ContextOverlayContainer');
    input.addEventListener('input', () => { overlay.style.display = input.value ? '' : 'none'; });
    overlay.querySelectorAll('.Item').forEach(choose(p, overlay, input, t => `<div class="Item" data-item-type="SingleText"><div class="Text"><span>${t}</span></div></div>`));
  }
  // A data picker's search, as Autotask shows it: the overlay goes Active, .ItemSetContainer stays empty and the
  // results are a new .ItemSet after it, the typed part of each name in <mark>
  for (const p of doc.querySelectorAll('.SingleDataSelector2')) {
    const input = p.querySelector('.SearchBox input'), empty = p.querySelector('.ItemSetContainer');
    const overlay = empty.closest('.ContextOverlayContainer'), panel = overlay.querySelector('.ContextOverlay');
    input.addEventListener('input', () => {
      const typed = input.value.toLowerCase();
      const found = (lists[p.id] || []).filter(a => typed && a.toLowerCase().includes(typed));
      overlay.querySelector('.ItemSet')?.remove();
      const marked = a => { const i = a.toLowerCase().indexOf(typed); return `${a.slice(0, i)}<mark>${a.slice(i, i + typed.length)}</mark>${a.slice(i + typed.length)}`; };
      if (found.length) {
        empty.insertAdjacentHTML('afterend', '<div class="ItemSet"><div class="ItemList">' + found.map((a, i) =>
          `<div class="Item" data-item-type="SingleText" data-index="${i}" data-is-targeted="${i === 0}"><div class="Text"><span>${marked(a)}</span></div></div>`).join('') + '</div></div>');
      }
      overlay.style.display = found.length ? '' : 'none';
      panel.classList.toggle('Active', found.length > 0);
      overlay.querySelectorAll('.ItemSet .Item').forEach(choose(p, overlay, input, t => `<div class="Chip"><div class="Text">${t}</div></div>`));
    });
  }
  for (const head of doc.querySelectorAll('.HeadingContainer')) {
    head.addEventListener('click', () => { doc.getElementById(head.id.replace(/-head$/, '')).style.display = ''; });
  }
}

// The ticket page's activity toolbar as captured (see docs/autotask-pages.md): each button in a data-tabbing-system
// <div>, its id (made up by Autotask; `id` here) the same as that <div>'s data-alpha-id. New Time Entry, New Note,
// New Attachment, then Refresh (an icon only). greyed: New Time Entry has Disabled2, as a button you can't use does
const activityButton = (id, icon, text, more = '') => `<div data-tabbing-system="1" data-alpha-id="${id}">` +
  `<div class="Button2 ButtonIcon2${more} NormalBackground" data-eii="000001Bb" id="${id}" tabindex="0"><div class="Spacer"></div>` +
  `<div class="Icon2"><div class="StandardButtonIcon ${icon}"></div></div><div class="Text2">${text}</div><div class="Spacer"></div></div></div>`;
const activityToolbar = ({ id = 'newtime', greyed = false } = {}) => '<div class="ToolBar">' +
  `<div class="ToolBarItem Left ButtonGroupStart">${activityButton(id, 'Time', 'New Time Entry', greyed ? ' Disabled2' : '')}</div>` +
  `<div class="ToolBarItem Left">${activityButton('note', 'Note', 'New Note')}</div>` +
  `<div class="ToolBarItem Left ButtonGroupEnd">${activityButton('attach', 'Attachment', 'New Attachment')}</div>` +
  '<div class="ButtonGroupDivider"></div><div class="ToolBarItem Left ButtonGroupStart ButtonGroupEnd LockedWidth">' +
  activityButton('refresh', 'Refresh', '', ' IconOnly2') + '</div><div class="Spacer"></div></div>';

module.exports = { field, linkTo, ticketPage, editPage, typesPage, offer, editorLabel, itemPicker, dataPicker, WORK_TYPES, section, realEditPage, autotaskPickers,
  activityToolbar };
