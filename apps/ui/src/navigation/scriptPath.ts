// The Script address for "open this chapter or line", as the pages that hand off to it name them (App.tsx `goToScript`). A credits
// row's synthetic chapter (ADR 0333) is the credits section, not a chapter: its id would otherwise be written as a chapter named
// "credits-opening", which the Script page does not find.

import { creditsKindOfId } from '../components/credits/creditsEntries';
import { addressPath } from './address';

export function scriptPath(chapter: string, paragraph?: number): string {
  const credits = creditsKindOfId(chapter);
  return addressPath(credits ? { page: 'script', credits } : { page: 'script', chapter, paragraph });
}
