# Voice samples: mock

**Status:** approved by the owner on 2026-10-17 ("mocks look good"). Added 2026-10-17 for [the PRD](../../../prds/character-voice-samples.prd.md) ([#1820](https://github.com/countrymanprime/narration-studio/issues/1820)). The Studio Next mock does not cover this feature, and [Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec) builds nothing a mock lacks. The owner has approved this one, so phases 3 to 5 of the PRD build to it.

One static file, `index.html`: no build, no network, system fonts. Open it in a browser. It takes the Studio Next mock's tokens from `docs/research/mockups/studio-next/src/styles/app.css`, follows the system theme, and has a Light and Dark switch (`?theme=dark` also works). Sample data is invented, and the play buttons only toggle their own state.

## Frames

| Page | Frames |
| --- | --- |
| Editing | Words selected with the **Voice sample** toolbar action; the **Voice sample** dialog ready to save; the dialog refused (words across two takes); the saved toast. **In-page mark (approved 2026-10-19):** resting dots, the opened popover, playing, passage changed and audio missing, several samples on one word and Narration |
| Story Bible | A character entry with four samples (primary, playing, **Passage changed**, **Audio file missing**) above **Reference clips**; the empty section; the **Voice data** panel with Narration's sample, the totals and a sample whose character left the Story Bible |
| Booth | The speaker picker with a play control on each character that has a sample; **Voices in this scene** with the samples listed; play refused while a take records; the listening-paused state |

## Output device

Section 4 is a draft for [#2047](https://github.com/countrymanprime/narration-studio/issues/2047), drawn 2026-10-19. It follows the owner's rulings of that day: per project, a choice only with the built-in recorder, and a sentence with a DAW connected (samples stay in the app's own audio). The owner approved it on 2026-10-19; [#2047](https://github.com/countrymanprime/narration-studio/issues/2047) builds to it. Questions that were open when it was approved: does a project's **Test sound** belong here; should the row show with no project open (this draft hides it); is "System default" first, or last.

## In-page mark

Section 1b is a draft for [#2046](https://github.com/countrymanprime/narration-studio/issues/2046), drawn 2026-10-19 on the owner's request. The first Editing frame already drew the dot; 1b adds what it does. The owner approved it on 2026-10-19, so [#2046](https://github.com/countrymanprime/narration-studio/issues/2046) builds to it. Questions for the owner: is the dot the right size and weight beside the text; should hover draw the range; should the popover offer anything but **Open in Story Bible**.

## Lifecycle

This folder is deleted in the pull request that merges the last of phases 3 to 5, as the Studio Next mock's rule says ([Which mocks are the spec](../../../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)). Nothing links to it from outside this PRD.
