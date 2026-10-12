// Master & QC's deep link: a delivery finding has no manuscript position or REAPER item, so its link opens Master & QC on its file
// (and rule) instead. Like the other deep links (App.tsx), it is an anchor on the fixed page path: /master#file=<path>&rule=<rule id>.
// `/delivery` is a page of its own, but a `/delivery` address that carries this anchor (an older link) redirects here keeping it.

export type MasterFocus = { file: string; rule?: string };

/** The anchor that opens Master & QC on a file, and on one of its rules. */
export function masterHash(focus: MasterFocus): string {
  return `#${new URLSearchParams({ file: focus.file, ...(focus.rule ? { rule: focus.rule } : {}) }).toString()}`;
}

/** The file and rule an anchor names, or nothing when it names no file. */
export function parseMasterHash(hash: string): MasterFocus | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const file = params.get('file');
  if (!file) return undefined;
  const rule = params.get('rule');
  return rule ? { file, rule } : { file };
}
