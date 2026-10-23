import type { PackageItemKind } from '../../types';

/**
 * The role a picked file most likely has in the package, from its name ("Opening credits.wav", "Retail sample.wav"): the narrator can
 * change it, but a credits file that defaults to Chapter ships as a chapter unless the narrator notices. Anything else is a chapter.
 */
export function kindFromFileName(name: string): PackageItemKind {
  if (/opening[\s_-]*credits/i.test(name)) return 'credits_opening';
  if (/closing[\s_-]*credits|end[\s_-]*credits/i.test(name)) return 'credits_closing';
  if (/retail[\s_-]*sample|\bsample\b/i.test(name)) return 'retail_sample';
  return 'chapter';
}
