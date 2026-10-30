import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Replacement } from '../../../../api/contracts/replace';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { Journal } from '../../../../studio/journal/createJournal';
import { SelectionActionButton } from '../../bar/SelectionActionButton';
import { registerSelectionAction } from '../../bar/selectionActions';
import { registerWordMenuSection } from '../../menu/wordMenuRegistry';
import { summarize, type SelSummary } from '../../model';
import { useEditingPage } from '../../script/EditingPageState';
import { returnToScript } from '../../script/returnToScript';
import { cutScope, tokensOf, type RangeLocator } from '../common/locate';
import { ReplaceDialog, replaceTitle } from './ReplaceDialog';
import { replaceCommand } from './replaceCommand';
import type { ReplacementMarks } from './replacementMarks';
import { useDawCapabilities } from '../../../../hooks/useDawCapabilities';

export interface ReplaceAudioOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  locator: RangeLocator;
}

const CHECKING = 'Checking what the DAW can do.';
const NO_AUDIO = 'There is no audio for these words.';
const ONLY_SAID = 'Only words of the script can be replaced: these were said and are not in it.';
const CUT = 'Some of these words are cut. Restore them first.';
const REPLACED = 'Some of these words are already replaced. Put your audio back first.';
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Why these words cannot be replaced, in words; '' when they can. */
export function replaceRefusal(
  available: { ok: true } | { ok: false; reason: string } | null,
  sum: SelSummary,
  locator: RangeLocator,
  replaced: ReadonlySet<string>,
): string {
  if (!available) return CHECKING;
  if (!available.ok) return available.reason;
  if (sum.hasCut) return CUT;
  if (!sum.audible.length) return NO_AUDIO;
  if (sum.ranges.some((r) => !tokensOf(locator, r))) return ONLY_SAID;
  if (sum.audible.some((i) => replaced.has(i.key))) return REPLACED;
  return '';
}

/**
 * Replace audio (#2251): the toolbar's and the word menu's Replace with another narrator's audio, the question it opens, the mark after a
 * replaced stretch naming whose audio it is, and Put my audio back from that mark or the word menu. The chapter's replacements are read from the
 * host on open and after every change.
 */
export function useReplaceAudio({ journal, chapterId, locator }: ReplaceAudioOptions): ReplacementMarks {
  const { doc } = useEditingPage();
  const api = usePort('replaceAudio');
  const daw = usePort('daw');
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const { caps: dawCaps, failed: dawFailed } = useDawCapabilities();
  const available = useMemo<{ ok: true } | { ok: false; reason: string } | null>(() => {
    if (dawFailed) return { ok: false, reason: 'Could not ask the DAW what it can do.' };
    if (!dawCaps) return null;
    const support = dawCaps.capabilities.replace_range;
    return support?.available ? { ok: true } : { ok: false, reason: support?.message || `${dawCaps.daw} cannot replace audio yet.` };
  }, [dawCaps, dawFailed]);
  const dawName = dawCaps && dawCaps.daw !== 'none' ? dawCaps.daw : 'the DAW';
  useEffect(() => {
    let live = true;
    api.editingReplacementsList(chapterId).then(
      (list) => live && setReplacements(list.replacements),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, chapterId]);

  const active = useMemo(() => replacements.filter((r) => r.active), [replacements]);
  const replacedKeys = useMemo(() => new Set(active.flatMap((r) => r.keys)), [active]);
  const refusalOf = useCallback((sum: SelSummary) => replaceRefusal(available, sum, locator, replacedKeys), [available, locator, replacedKeys]);

  const ask = useCallback(
    (asked: readonly string[]) => {
      const { keys } = cutScope(doc, asked, locator);
      const sum = summarize(doc, [...keys], [], (t) => t);
      const reason = refusalOf(sum);
      if (reason) return overlay.toast(reason, { tone: 'error' });
      const first = sum.ranges[0];
      const last = sum.ranges[sum.ranges.length - 1];
      const from = first ? tokensOf(locator, first) : null;
      const to = last ? tokensOf(locator, last) : null;
      if (!from || !to) return overlay.toast(ONLY_SAID, { tone: 'error' });
      overlay.open({
        kind: 'dialog',
        dismissOnOutsidePress: false,
        returnFocus: returnToScript,
        title: replaceTitle(sum.audible.length),
        render: ({ close }) => (
          <ReplaceDialog
            api={api}
            chapterId={chapterId}
            firstToken={from.firstToken}
            lastToken={to.lastToken}
            text={sum.words}
            words={sum.audible.length}
            start={sum.start}
            end={sum.end}
            dawName={dawName}
            onCancel={close}
            onConfirm={(request) => {
              close();
              void (async () => {
                const result = await journal.act(replaceCommand({ api, daw, onReplacements: setReplacements }, request));
                if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
                const { id, value } = result.value;
                overlay.toastUndo(value.message, () => journal.undo(id), { entry: id });
              })();
            }}
          />
        ),
      });
    },
    [doc, locator, refusalOf, api, chapterId, dawName, journal, daw],
  );

  const restore = useCallback(
    async (replacement: Replacement) => {
      try {
        const answer = await api.dawRestoreReplacement(chapterId, replacement.id);
        setReplacements(answer.replacements.replacements);
        if (!answer.result.ok) return overlay.toast(answer.result.refused ?? answer.result.message, { tone: 'error' });
        overlay.toast(answer.result.message);
      } catch (e) {
        overlay.toast(why(e), { tone: 'error' });
      }
    },
    [api, chapterId],
  );

  const latest = useRef({ ask, restore });
  useEffect(() => {
    latest.current = { ask, restore };
  });
  // Registered again when the replacements or what the DAW can do change, so the bar and the toolbar redraw for a selection that stays.
  useEffect(() => {
    const replacementOf = (keys: readonly string[]) => active.find((r) => keys.some((k) => r.keys.includes(k)));
    const removers = [
      registerSelectionAction({
        id: 'replace.audio',
        order: 27,
        where: 'both',
        render: ({ keys, summary, allCut }) => {
          if (allCut) return null;
          const replaced = replacementOf(keys);
          if (replaced)
            return (
              <SelectionActionButton
                icon="replaceAudio"
                label="Put my audio back"
                hint={`Put my audio back in place of ${replaced.narratorName}'s`}
                onClick={() => void latest.current.restore(replaced)}
              />
            );
          return (
            <SelectionActionButton
              icon="replaceAudio"
              label="Replace with another narrator's audio"
              reason={refusalOf(summary) || undefined}
              onClick={() => latest.current.ask(keys)}
            />
          );
        },
      }),
      registerWordMenuSection({
        order: 105,
        items: ({ keys, summary }) => {
          const replaced = replacementOf(keys);
          if (replaced)
            return [
              { key: 'replace-restore', label: `Put my audio back (now ${replaced.narratorName}'s)`, onSelect: () => void latest.current.restore(replaced) },
            ];
          const reason = refusalOf(summary);
          return [
            {
              key: 'replace-audio',
              label: "Replace with another narrator's audio…",
              ...(reason ? { unavailable: reason } : {}),
              onSelect: () => latest.current.ask(keys),
            },
          ];
        },
      }),
    ];
    return () => removers.forEach((off) => off());
  }, [active, refusalOf]);

  return useMemo(() => {
    const at = new Map<string, Replacement>();
    for (const r of active) {
      const lastKey = r.keys[r.keys.length - 1];
      if (lastKey && doc.index.has(lastKey)) at.set(lastKey, r);
    }
    return { at, restore, keysOf: replacedKeys };
  }, [active, doc, restore, replacedKeys]);
}
