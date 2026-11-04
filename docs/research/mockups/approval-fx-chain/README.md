# Approval FX chain: mock

**Status:** draft for [#2932](https://github.com/countrymanprime/narration-studio/issues/2932) (threat model row 5o), awaiting the owner's sign-off. The Studio Next mock has no mastering approval dialog ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft covers only the chain the dialog adds.

One static file, `index.html`: no build, no network, system fonts. It takes the Studio Next mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark).

## Frames

| Frame | What it shows |
| --- | --- |
| A short chain | First, under the question: a count in signal order (with how many are switched off) and an i saying what the approval covers, then numbered rows, each track's plug-ins and then the master's (a Master badge from the host's flag); Approve binds the chain shown |
| A long chain | The list takes up to 20 rem before it scrolls; a bypassed plug-in has an Off badge; hidden characters in a name are dropped or shown as their code |
| A window too small for the chain | Approve off, with its reason as its hint, until the chain has been in view |
| No FX anywhere | One row says so |
| Unreadable or changed chain | A toast with what to do; a chain changed after the approval stops the export at that file |

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the Studio Next mock's rule says ([Which mocks are the spec](../../../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)).
