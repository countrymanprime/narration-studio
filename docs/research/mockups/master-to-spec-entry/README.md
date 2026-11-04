# Master to spec entry: mock

**Status:** draft for [#2931](https://github.com/countrymanprime/narration-studio/issues/2931), an owner-approved follow-up to the mastering work. The Studio Next mock has no Master to spec control ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft covers only how the narrator gets into it.

One static file, `index.html`: no build, no network, system fonts. It takes the Studio Next mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark).

## Frames

| Frame | What it shows |
| --- | --- |
| Nothing picked yet | The page header keeps the icon as a secondary shortcut. The always-present Master to spec card has a primary text button, **Choose files to master…** (**Choose files to encode…** with mastering off), and the Master before encoding checkbox |
| Files picked | Unchanged: Add files… and Master & encode in the card's header, and the checkbox under the table |
| Nothing picked, 390 px | The button wraps under the title |

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the Studio Next mock's rule says (Which mocks are the spec).
