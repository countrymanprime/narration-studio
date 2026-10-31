// Buttons that draw words inside a toolbar or ribbon, as `file | words`. A toolbar button is an icon with a tooltip and an aria-label
// wherever an icon can say it (.claude/skills/frontend-primitives/SKILL.md). The list may only shrink: guards/toolbarButtons.test.ts
// fails on a text button that is not listed and on an entry whose button is gone or now an icon.
export const TOOLBAR_TEXT_BUTTONS: string[] = ['components/booth/CompanionShell.tsx | Follow'];
