# Approval FX chain: mock

**Status:** draft for [#2932](https://github.com/countrymanprime/narration-studio/issues/2932) (threat model row 5o), awaiting the owner's sign-off. The Studio Next mock has no mastering approval dialog ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft covers only the chain the dialog adds.

One static file, `index.html`: no build, no network, system fonts. It takes the Studio Next mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark).

## Frames

| Frame | What it shows |
| --- | --- |
| A short chain | Under the files, a second capped list: each track's plug-ins in chain order, then the master's |
| A long chain | The list scrolls in its own box; a switched-off plug-in says "(off)" |
| No FX anywhere | One row says so |

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the Studio Next mock's rule says ([Which mocks are the spec](../../../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)).
