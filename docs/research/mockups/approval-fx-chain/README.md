# Approval FX chain: mock

**Status:** draft for [#2932](https://github.com/countrymanprime/narration-studio/issues/2932) (threat model row 5o), awaiting the owner's sign-off. The research mock has no mastering approval dialog ([What a page builds to](../../../design/design-system.md#what-a-page-builds-to)). This draft covers only the chain the dialog adds.

One static file, `index.html`: no build, no network, system fonts. It takes the research mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark).

## Frames

| Frame | What it shows |
| --- | --- |
| A short chain | First, under the question: a count in signal order (with how many are switched off) and an i saying what the approval covers, then numbered rows, each track's plug-ins and then the master's (a Master badge from the host's flag); Approve binds the chain shown |
| A long chain | The list takes up to 20 rem before it scrolls; a bypassed plug-in has an Off badge; hidden characters in a name are dropped or shown as their code |
| A window too small for the chain | Approve stays usable; a button beside it names the effects above and scrolls to them |
| No FX anywhere | One row says so |
| Unreadable or changed chain | A toast with what to do; a chain changed after the approval stops the export at that file |

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the research mock's rule says (What a page builds to).
