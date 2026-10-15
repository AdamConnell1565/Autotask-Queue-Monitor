# Notes for agents working on this repo

## Version numbers

Every change that ships raises the version: `@version` in the header of `autotaskQueueMonitor.user.js` (Tampermonkey only updates when it goes up), `version` in `package.json`, and a new entry at the top of `CHANGELOG.md`. Pick the part to raise by the size of the change:

- **0.x.0 (minor):** only for a major feature or a big new piece of functionality, such as the Macro builder or running macros from the dashboard.
- **0.0.x (patch):** everything else: fixes, and smaller changes and additions to features that already exist, such as marking secondary resource tickets in the existing lists, a new setting, or a changed layout.

When unsure, it's a patch. Don't renumber versions already released.

## Tampermonkey sandbox

The script asks for `GM_openInTab` (macro tabs open in the background), so Tampermonkey runs it in its sandbox, not in the page. `window` there is Tampermonkey's, not the page's. Use `W` (`unsafeWindow`) for the page's own window: its `open`, `name`, `top`, `opener` and anything Autotask puts on it. A function handed to the page, such as one put in place of `W.open`, goes through `exportFunction` where it exists (Firefox). Ask for another `@grant` only when it's needed.

## Docs

- `README.md` describes what the script does for the people using it. Update it with any change they'd notice.
- `docs/autotask-pages.md` describes the Autotask pages the script reads and how it reads them. Update it when the script reads something new, or reads something differently. Never put personal information in it or in the test fixtures (see its first section).

## Checks

- `npm run check` checks the syntax. Run the tests with `node --test tests/*.test.js`.
- Two dashboard tests expect a 24-hour clock ("13:00") and fail where the system locale uses a 12-hour one. That's the environment, not the change.
