# Settings parity: mock-review pack

**Temporary sign-off pack. Delete this folder after the owner signs off.** The owner asked for these images as an exception to the "no other images" rule ([UI PRs update the how-to guide](../../../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide)); the pictures that stay are the guide's own, in `docs/images/ui/`.

It shows the Settings rows added for issue [#2815](https://github.com/countrymanprime/narration-studio/issues/2815): every setting a page changes must also have an equivalent on the Settings page. Each entry in `manifest.json` has the issue, the pull request, a title, what changed and why in plain words, the two images and a caption. The images are real-app screenshots (the mock host), light theme, at 1440 px and 390 px, each under 250 KB.

| Entry | Pull request | Settings row |
| --- | --- | --- |
| Chapter layout | #2890 | Recording & DAW › Chapter sync |
| Chapter sync and Voices | #2906 | Recording & DAW › Chapter sync |
| Booth text size | #2939 | Appearance & keys › Look |
| Editing playback | #2952 | Appearance & keys › Listening |
| Effects coverage cap | #2952 | Recording & DAW › Effects |
| Story Bible order | #2966 | Appearance & keys › Look |
| First-use tips | #2969 | App & updates › Tips |
| Schedule basis | #2971 | Project › Schedule |

The folder is not published to the docs site (`tools/docs-site/mkdocs.yml` excludes it, as it does the other mock folders). The audit that lists every control, and the taxonomy and settings-by-page matrix, are in [the audit](../../2026-11-settings-parity-audit.md).
