import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isolatedIfRtl } from '../../visibleText';
import { apiErrorMessage } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import { previewParts } from '../../creditsPreviewParts';
import type { CreditsRenderResult, CreditTemplate, CreditValues, DetectedCandidate } from '../../types';
import { hostTrim } from '../../studio/hostTrim';
import { useGuardedAction, useSharedSave, useUnsavedDraft, withinSaveLimit, SaveTimeout } from '../../studio/drafts/unsavedDrafts';
import { projectDataChanged } from './data/projectDataSignal';
import { CREDITS_FIELDS, CREDITS_HEADING, CREDITS_SECTION } from './creditsLayout';
import { RetailSamplePanel } from './RetailSamplePanel';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Field } from '../primitives/Field';
import { Select } from '../primitives/Select';
import { Highlight } from '../primitives/Highlight';
import { type Notify, retryAction } from '../primitives/Toast';
import { plural, pluralWord, formatCount } from '../../plural';

const KIND_LABEL: Record<string, string> = { opening: 'Opening', closing: 'Closing', chapter_announcement: 'Chapter announcement' };

/** The picker's label: the name with its kind, unless the name already says it ("ACX minimum (opening)") or is the kind. */
function templateLabel(template: { name: string; kind: string }): string {
  const kind = KIND_LABEL[template.kind] ?? template.kind;
  const name = template.name.toLowerCase();
  // A name that is the kind ("Chapter announcement") or already says it is not followed by the kind again (alignment audit R3SE2-6).
  return name === kind.toLowerCase() || name.includes(`(${kind.toLowerCase()})`) ? template.name : `${template.name} (${kind})`;
}
const NEW_TEMPLATE_NAME = 'New template';
const KIND_OPTIONS = [
  { value: 'opening', label: 'Opening' },
  { value: 'closing', label: 'Closing' },
  { value: 'chapter_announcement', label: 'Chapter announcement' },
];
const BODY_HINT: Record<string, string> = {
  chapter_announcement:
    'Read at the head of every chapter. [Chapter] is the chapter heading and [Chapter Title] its subtitle; wrap a part in { } to drop it when a token in it is empty, as in [Chapter]{: [Chapter Title]}.',
};
const DEFAULT_BODY_HINT =
  'Bracketed tokens such as [Title], [Author] and [Narrator] are filled from the project values below. Wrap a part in { } to drop it when a token in it is empty.';

/** The project's own credit token value fields: every one is optional and per-project except
 * `narrator`, which overrides the global narrator default only for this project. */
const VALUE_FIELDS: { key: keyof CreditValues; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'author', label: 'Author' },
  { key: 'series', label: 'Series' },
  { key: 'bookNumber', label: 'Book number' },
  { key: 'copyright', label: 'Copyright' },
  { key: 'year', label: 'Year' },
  { key: 'copyrightHolder', label: 'Copyright holder' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'narrator', label: 'Narrator (override the global default)' },
];

// A DetectedCandidate's token is a credits.Values Go field name ("Title", "CopyrightHolder"), not this panel's
// lowerCamelCase key; every VALUE_FIELDS key maps to its token by capitalizing the first letter, with no
// exceptions to keep track of as fields are added.
/** What Clear credits removes, named in its confirmation: every project value field, the narrator as the override it is here. */
const CLEARED_FIELDS = `${VALUE_FIELDS.slice(0, -1)
  .map(({ label }) => label)
  .join(', ')} and the Narrator override`;

const detectedToken = (key: keyof CreditValues): string => key.charAt(0).toUpperCase() + key.slice(1);

// previewParts (splitting an unresolved token out as its own chip marker) lives in ../../creditsPreviewParts,
// shared with the Manuscript pseudo-entries so both surfaces highlight an unresolved token the same way.

/**
 * Settings > Credits: the narrator's template library (shipped defaults
 * plus their own, add/duplicate/edit/delete), this project's own credit values with suggestions seeded from the
 * manuscript, and a live preview rendered by the same Go renderer the estimate and the teleprompter use.
 * Saving values never blocks on an unresolved token; this panel only shows the count and chip. Clear credits empties every project
 * value at once, after a confirmation; the template library stays.
 */
export function CreditsPanel({ notify }: { notify: Notify }) {
  const api = useApi();
  const [templates, setTemplates] = useState<CreditTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState('opening');
  const [draftBody, setDraftBody] = useState('');
  const [templateDirty, setTemplateDirty] = useState(false);
  const [values, setValues] = useState<CreditValues>({});
  // The value fields wait for the first read of the project's values: a value typed before it lands would be saved with every other value empty, and the host replaces all ten (#3461 round 13 BR-F).
  const [valuesLoaded, setValuesLoaded] = useState(false);
  // The first template list: the editor and the picker wait for it, since a list that lands later resets the editor to the first template and would drop what was typed (#3461 round 14 BR-I).
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [valuesFailed, setValuesFailed] = useState(false);
  const [narratorGlobal, setNarratorGlobal] = useState('');
  const [detected, setDetected] = useState<DetectedCandidate[]>([]);
  const [preview, setPreview] = useState<CreditsRenderResult>();
  // A chapter announcement previews for the first narration chapter: which one, out of how many, and why there
  // is nothing to show when the project has no manuscript yet.
  const [previewScope, setPreviewScope] = useState<{ chapter: string; count: number }>();
  const [previewProblem, setPreviewProblem] = useState('');
  const [templatesFailed, setTemplatesFailed] = useState(false);
  // Guards a second click while a template action or a value save is in flight: every button below that
  // starts one of these disables until it ends, and the field being saved disables too.
  const [busy, setBusy] = useState(false);
  // A Duplicate or a Delete is out: the editor is about to move onto another template, so what is typed now would be lost, and it is off until the list lands (#3461 round 15 BR-L).
  const [switching, setSwitching] = useState(false);
  const [savingKey, setSavingKey] = useState<keyof CreditValues>();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const guarded = useGuardedAction();
  const selected = templates.find((template) => template.id === selectedId);
  // What the editor holds and which template it is on, as of the last render, for a save that resolves long after it started.
  const editorNow = useRef({ id: selectedId, name: draftName, kind: draftKind, body: draftBody });
  const templateDirtyNow = useRef(false);
  templateDirtyNow.current = templateDirty;
  editorNow.current = { id: selectedId, name: draftName, kind: draftKind, body: draftBody };
  // The template the editor was last reset from. A list read again for the same template (after a save, a duplicate) resets the editor only when nothing was typed since:
  // text typed on it while a save was in flight stays, as an edit still to save, and text typed on another template is never put back on this one (#3461).
  const baseline = useRef<{ id: string; name: string; kind: string; body: string } | null>(null);
  /** What the last save sent, for Save & continue to see that more was typed while it ran. */
  // Which New template the editor is on (a number that grows with each New), and which of them had a save that went past the limit with no answer. An answer that lands late is
  // that draft's: it takes over the editor only while the editor is still on it, and a second Save of the same draft waits for it instead of creating a second template (#3461 B1, B2).
  const draftSeq = useRef(0);
  const pendingCreates = useRef(new Set<number>());
  // The id a New draft's late-answered save created, for as long as the draft lives: its next Save writes to that template and never creates another, even when the list read that
  // should have shown it failed (#3461 round 9 C-2).
  const createdIds = useRef(new Map<number, string>());
  const lastSent = useRef<{ id: string; name: string; kind: string; body: string } | null>(null);

  // Every read of the template list (the load, the list alone, a Retry) takes a number, and only the latest one is drawn: an older answer that lands after a newer read has
  // committed (a Duplicate, a Save, a Delete) would put its stale list back, drop a copy the narrator is typing on, revert a saved body or bring a deleted template back (#3461
  // round 11 BR-A, BR-B, BR-C). The project values have their own number, since only a load reads them.
  const listSeq = useRef(0);
  const valuesSeq = useRef(0);
  const notifyNow = useRef(notify);
  notifyNow.current = notify;
  // The project values alone, bounded by the save limit: a read that fails or never answers says so with a Retry that reads them again, and the fields stay off until they land, since a
  // value typed over values that were never read would be saved with every other value empty (#3461 round 14 BR-F2).
  const readValues = useCallback(async () => {
    const mine = ++valuesSeq.current;
    try {
      const projectValues = await withinSaveLimit(api.creditsProjectValues());
      if (mine !== valuesSeq.current) return;
      setValues(projectValues.values);
      setValuesLoaded(true);
      setValuesFailed(false);
      setNarratorGlobal(projectValues.narratorGlobal);
      setDetected(projectValues.detected);
    } catch (error) {
      if (mine !== valuesSeq.current) return;
      setValuesFailed(true);
      const notify = notifyNow.current;
      notify(
        `The project values could not be read: ${error instanceof SaveTimeout ? 'the host did not answer' : apiErrorMessage(error)}`,
        'error',
        retryAction(() => void readValues()),
      );
    }
  }, [api]);
  // The template list alone, bounded by the save limit: a Retry or a late answer's read only refreshes the list and never moves the editor (`load` would put a New draft onto the first
  // template and drop what was typed in it) (#3461 round 10 C-3, C-5). The first read, or one that `reselect` asks for (after a Duplicate or a Delete), also puts the editor on a template
  // that is in the list. A read that fails or never answers says so with a Retry, and the editor stays off until a read lands (#3461 round 15 BR-K1).
  const templatesLoadedRef = useRef(false);
  templatesLoadedRef.current = templatesLoaded;
  const readTemplates = useCallback(
    async (reselect = false): Promise<boolean> => {
      const mine = ++listSeq.current;
      try {
        const read = await withinSaveLimit(api.creditsTemplates());
        if (mine !== listSeq.current) return true;
        setTemplates(read);
        if (reselect || !templatesLoadedRef.current) {
          setSelectedId((current) => (read.some((template) => template.id === current) ? current : (read[0]?.id ?? '')));
        }
        setTemplatesLoaded(true);
        setTemplatesFailed(false);
        return true;
      } catch (error) {
        // A read that was overtaken says nothing: the newer one decides what the narrator sees.
        if (mine !== listSeq.current) return false;
        setTemplatesFailed(true);
        const notify = notifyNow.current;
        notify(
          `The templates could not be read: ${error instanceof SaveTimeout ? 'the host did not answer' : apiErrorMessage(error)}`,
          'error',
          retryAction(() => void readTemplates(!templatesLoadedRef.current)),
        );
        return false;
      }
    },
    [api],
  );
  // The list and the values are read apart: the list is what a Duplicate or a Delete waits for, and the values read (up to the save limit) must not keep the editor off meanwhile.
  const load = useCallback(async (): Promise<boolean> => {
    void readValues();
    return readTemplates(true);
  }, [readValues, readTemplates]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      baseline.current = null;
      // The template the editor was on is no longer in the list (a list that landed without it) while text is typed in the editor: the text stays, as a New draft, and is never blanked
      // with no question (#3461 round 16 BR-M).
      const typed = editorNow.current;
      if (typed.id !== '' && hostTrim(typed.body) !== '' && templateDirtyNow.current) {
        draftSeq.current += 1;
        setSelectedId('');
        return;
      }
      setDraftName('');
      setDraftKind('opening');
      setDraftBody('');
      setTemplateDirty(false);
      return;
    }
    const before = baseline.current;
    const typed = editorNow.current;
    baseline.current = { id: selected.id, name: selected.name, kind: selected.kind, body: selected.body };
    if (lastSent.current && lastSent.current.id !== selected.id) lastSent.current = null;
    if (before && before.id === selected.id && (typed.name !== before.name || typed.kind !== before.kind || typed.body !== before.body)) {
      // Against what the last save wrote, which a list read that is late or failed has not brought into `selected`: an edit the automatic second save wrote is clean (#3461 F).
      const saved = lastSent.current?.id === selected.id ? lastSent.current : selected;
      setTemplateDirty(typed.name !== saved.name || typed.kind !== saved.kind || typed.body !== saved.body);
      return;
    }
    setDraftName(selected.name);
    setDraftKind(selected.kind);
    setDraftBody(selected.body);
    setTemplateDirty(false);
  }, [selected]);

  useEffect(() => {
    let active = true;
    const show = (result: CreditsRenderResult | undefined, scope?: { chapter: string; count: number }, problem = '') => {
      if (!active) return;
      setPreview(result);
      setPreviewScope(scope);
      setPreviewProblem(problem);
    };
    if (draftKind === 'chapter_announcement') {
      api
        .creditsChapterAnnouncements(draftBody)
        .then((announcements) =>
          announcements[0] ? show(announcements[0].result, { chapter: announcements[0].chapter, count: announcements.length }) : show(undefined),
        )
        .catch((error) => show(undefined, undefined, apiErrorMessage(error)));
    } else {
      api
        .creditsPreview(draftBody)
        .then((result) => show(result))
        .catch(() => show(undefined));
    }
    return () => {
      active = false;
    };
  }, [api, draftBody, draftKind, values]);

  const saveTemplateNow = async (): Promise<boolean> => {
    if (hostTrim(editorNow.current.body) === '') return false;
    const seq = draftSeq.current;
    if (!selected && pendingCreates.current.has(seq)) {
      notify('Your first save of this template is still waiting for an answer. The template appears in the list when it lands.');
      return false;
    }
    setBusy(true);
    const sent = { id: selectedId, name: draftName, kind: draftKind, body: draftBody };
    try {
      // A save the host never answers gives the editor back at the limit: the picker and the buttons are free again and the text is still here (#3461 G).
      const creating = !selected && !createdIds.current.has(seq);
      const call = api.saveCreditsTemplate(selected?.id ?? createdIds.current.get(seq) ?? '', draftKind, draftName, draftBody);
      // A New template whose save answers after the limit has no id yet: when the answer lands and the editor is still on that draft it takes the id, so Save again does not
      // create a second template (#3461 G2).
      // Whether the host answered at all, even with a refusal: only a call still out at the limit can land later and create a template.
      let answered = false;
      void call.then(
        () => void (answered = true),
        () => void (answered = true),
      );
      if (creating)
        void call
          .then(async (late) => {
            if (!pendingCreates.current.has(seq)) return;
            createdIds.current.set(seq, late.id);
            // The list is read first, and only then is it decided whether the editor is still on the draft that started this save: the narrator can pick another template, Discard or press New
            // while the read is out, and the editor and its text must stay where they went, the list only learning the template that was created (#3461 round 7 BR1). The read is the
            // templates alone, since `load` would also move a New draft onto the first template.
            // The draft stays marked as having a save out until the read ends, so a Save pressed meanwhile (the editor's or Save & continue's) creates nothing (#3461 round 9 C-1).
            await readTemplates();
            pendingCreates.current.delete(seq);
            if (draftSeq.current !== seq || editorNow.current.id !== '') return;
            // The editor moves onto the template that was created, with what is in it now: text typed after the limit is an edit of that template still to save, not something
            // the template's own body replaces (#3461 round 7 N1). The baseline and what was last sent say what the template holds.
            baseline.current = { id: late.id, name: sent.name, kind: sent.kind, body: sent.body };
            lastSent.current = { id: late.id, name: sent.name, kind: sent.kind, body: sent.body };
            setSelectedId(late.id);
          })
          .catch(() => pendingCreates.current.delete(seq));
      const saved = await withinSaveLimit(call).catch((error) => {
        if (creating && !answered) pendingCreates.current.add(seq);
        throw error;
      });
      pendingCreates.current.delete(seq);
      // The template exists now: whatever the list read after this shows, the next Save of this draft writes to it and creates no second one (#3461 round 10 C-4).
      if (creating) createdIds.current.set(seq, saved.id);
      notify('Credit template saved.');
      // The narrator may have gone to another template while this ran (Discard & continue): then the save is done and the editor stays where they went, with what they
      // typed there. Text typed on this template since the save started is not in what was saved: it stays in the editor as an edit still to save, and Save template or Save & continue then sends it in a second save of its own (a second \"saved\" notice) (#3461).
      const typed = editorNow.current;
      const stillHere = typed.id === sent.id;
      const typedSince = stillHere && (typed.name !== sent.name || typed.kind !== sent.kind || typed.body !== sent.body);
      lastSent.current = sent;
      if (stillHere) setTemplateDirty(typedSince);
      projectDataChanged();
      await load();
      if (stillHere) setSelectedId(saved.id);
      return true;
    } catch (error) {
      // Saving the same template again writes the same body, so it is safe to repeat.
      notify(
        apiErrorMessage(error),
        'error',
        retryAction(() => void saveTemplate()),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  // The editor's Save and the question's Save & continue share one request: pressing both sends one (#3404).
  const saveOnce = useSharedSave(saveTemplateNow);
  // Save & continue while a save is on its way joins it, and then saves what was typed after it started, so the move never goes on with that text left behind (#3461).
  const saveTemplate = async (): Promise<boolean> => {
    const saved = await saveOnce();
    const sent = lastSent.current;
    const typed = editorNow.current;
    // A body cleared while the first save ran is not sent by the second: the edit stays held as "still needs some text" (#3461 round 14 BR-H).
    if (
      saved &&
      sent &&
      sent.id !== '' &&
      typed.id === sent.id &&
      hostTrim(typed.body) !== '' &&
      (typed.name !== sent.name || typed.kind !== sent.kind || typed.body !== sent.body)
    )
      return saveOnce();
    return saved;
  };
  // The template editor holds a draft that waits for Save template (the project values below save as they are typed), so leaving the page asks (#3400).
  // A New template with nothing typed, or an edit put back as it was, holds nothing.
  const savedText = selected && lastSent.current?.id === selected.id ? lastSent.current : selected;
  const draftHeld =
    templateDirty &&
    (savedText
      ? draftName !== savedText.name || draftKind !== savedText.kind || draftBody !== savedText.body
      : draftBody !== '' || (draftName !== NEW_TEMPLATE_NAME && draftName !== ''));
  // A template with no text would replace a built-in with an empty one (and blank the credits that use it; a blank name is fine, the host names it by its kind): it cannot be saved, and the question offers only to keep
  // editing or discard (#3461 narrator smoke, finding 1; main saved it silently).
  const blankTemplate = hostTrim(draftBody) === '';
  useUnsavedDraft('credits-template', {
    dirty: draftHeld,
    label: 'your credit template edit',
    ...(blankTemplate ? { needs: 'some text' } : { save: saveTemplate }),
    discard: () => setTemplateDirty(false),
  });
  const newTemplate = () => {
    draftSeq.current += 1;
    setSelectedId('');
    setDraftName(NEW_TEMPLATE_NAME);
    setDraftKind('opening');
    setDraftBody('');
    setTemplateDirty(true);
  };
  const duplicateTemplate = async () => {
    if (!selected) return;
    setBusy(true);
    setSwitching(true);
    try {
      const duplicate = await api.duplicateCreditsTemplate(selected.id);
      notify(`Duplicated as "${isolatedIfRtl(duplicate.name)}".`);
      projectDataChanged();
      // The copy is only selected once the list that shows it has landed.
      if (await load()) setSelectedId(duplicate.id);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    } finally {
      setBusy(false);
      setSwitching(false);
    }
  };
  const deleteTemplate = async () => {
    if (!selected) return;
    setBusy(true);
    setSwitching(true);
    try {
      const gone = selected.id;
      await api.deleteCreditsTemplate(gone);
      notify('Credit template deleted.');
      // Deleting the template takes the text typed for it along: the button is the narrator's answer, so it does not ask to save a template about to go (#3404).
      setTemplateDirty(false);
      // The editor leaves the deleted template at once, onto the next one that is left, and not only when the list read after it lands: that read can fail or time out, and until then a Save
      // would send the id of a template that is gone and the text typed on it would be blanked by the list that finally lands (#3461 round 16 BR-M).
      const rest = templates.filter((template) => template.id !== gone);
      setTemplates(rest);
      setSelectedId(rest[0]?.id ?? '');
      projectDataChanged();
      await load();
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    } finally {
      setBusy(false);
      setSwitching(false);
    }
  };

  const saveValue = async (key: keyof CreditValues, value: string) => {
    if (!valuesLoaded) return;
    // A read of the values that was started before this edit would put the old value back when it lands: it is out of date from here (#3461 round 12 BR-E2).
    valuesSeq.current += 1;
    const next = { ...values, [key]: value };
    setValues(next);
    setSavingKey(key);
    try {
      await api.saveCreditsProjectValues(next);
      projectDataChanged();
    } catch (error) {
      // The same save again writes the same values.
      notify(
        apiErrorMessage(error),
        'error',
        retryAction(() => void saveValue(key, value)),
      );
    } finally {
      setSavingKey((current) => (current === key ? undefined : current));
    }
  };
  // Clear credits: every one of this project's values goes back to empty in one save, so the credits ask for them again. The template
  // library is the narrator's across projects and stays; a template is removed with Delete above.
  const clearValues = async () => {
    valuesSeq.current += 1;
    setClearing(true);
    try {
      setValues(await api.saveCreditsProjectValues({}));
      projectDataChanged();
      notify('Credits cleared for this project.');
      setConfirmingClear(false);
    } catch (error) {
      // Clearing is a save of empty values, so doing it again is the same save.
      notify(
        apiErrorMessage(error),
        'error',
        retryAction(() => void clearValues()),
      );
    } finally {
      setClearing(false);
    }
  };
  const acceptDetected = (key: keyof CreditValues, candidate: DetectedCandidate) => {
    void saveValue(key, candidate.value);
  };

  const parts = useMemo(() => (preview ? previewParts(preview) : []), [preview]);

  return (
    <div className="@container flex flex-col gap-4 text-sm">
      <section aria-labelledby="credits-templates-heading" aria-busy={!templatesLoaded} className={`${CREDITS_SECTION} ${templatesLoaded ? '' : 'opacity-60'}`}>
        <h3 id="credits-templates-heading" className={CREDITS_HEADING}>
          Templates
        </h3>
        {!templatesLoaded && (
          <div role="status" className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {templatesFailed ? 'The templates could not be read.' : <>Reading the templates&hellip;</>}
            {templatesFailed && (
              <Button variant="secondary" size="sm" type="button" onClick={() => void readTemplates(true)}>
                Retry
              </Button>
            )}
          </div>
        )}
        {/* The template's short fields keep a field's width, not the row's, now the editor spans the row (XSE2-11). */}
        <div className={`${CREDITS_FIELDS} flex flex-col gap-3`} data-credits-fields>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Template"
              value={selectedId}
              disabled={busy || !templatesLoaded}
              onChange={(id) => id !== selectedId && guarded(() => setSelectedId(id))}
              fullWidth
              options={templates.map((template) => ({ value: template.id, label: templateLabel(template) }))}
            />
            <Button variant="secondary" size="sm" type="button" disabled={busy || !templatesLoaded} onClick={() => guarded(newTemplate)}>
              New
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={!selected || busy}
              pending={busy}
              onClick={() => guarded(() => void duplicateTemplate())}
            >
              Duplicate
            </Button>
            <Button variant="danger" size="sm" type="button" disabled={!selected || busy} pending={busy} onClick={() => void deleteTemplate()}>
              Delete
            </Button>
          </div>
          <Field
            label="Name"
            value={draftName}
            disabled={!templatesLoaded || switching}
            onChange={(value) => {
              setDraftName(value);
              setTemplateDirty(true);
            }}
          />
          <div className="text-[0.82rem] font-medium text-[var(--text-muted)]">
            Kind
            <Select
              label="Kind"
              value={draftKind}
              disabled={!templatesLoaded || switching}
              onChange={(value) => {
                setDraftKind(value);
                setTemplateDirty(true);
              }}
              options={KIND_OPTIONS}
              fullWidth
            />
          </div>
        </div>
        <Field
          label="Body"
          textarea
          disabled={!templatesLoaded || switching}
          value={draftBody}
          onChange={(value) => {
            setDraftBody(value);
            setTemplateDirty(true);
          }}
          hint={BODY_HINT[draftKind] ?? DEFAULT_BODY_HINT}
        />
        <Button
          variant="primary"
          type="button"
          className="self-start"
          disabled={!templateDirty || busy || blankTemplate}
          pending={busy}
          onClick={() => void saveTemplate()}
        >
          Save template
        </Button>
      </section>

      <section aria-labelledby="credits-preview-heading" className={CREDITS_SECTION}>
        <h3 id="credits-preview-heading" className={CREDITS_HEADING}>
          Preview
        </h3>
        {preview ? (
          <>
            <p className="m-0 rounded-md bg-[var(--surface)] p-3 whitespace-pre-wrap">
              {parts.map((part, index) =>
                typeof part === 'string' ? (
                  <span key={index}>{part}</span>
                ) : (
                  <Highlight key={index} kind="Review">
                    [{part.token}]
                  </Highlight>
                ),
              )}
            </p>
            <p style={{ color: 'var(--text-muted)' }}>
              {previewScope && `Shown for ${previewScope.chapter}, one of ${plural(previewScope.count, 'chapter')}. `}
              {plural(preview.words, 'word')}
              {preview.unresolved.length > 0 &&
                ` — ${formatCount(preview.unresolved.length)} unresolved ${pluralWord(preview.unresolved.length, 'token')}: ${preview.unresolved.join(', ')}`}
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>{previewProblem ? `Nothing to preview: ${previewProblem}.` : 'Nothing to preview yet.'}</p>
        )}
      </section>

      <section aria-labelledby="credits-values-heading" className={CREDITS_SECTION}>
        <h3 id="credits-values-heading" className={CREDITS_HEADING}>
          Project values
        </h3>
        <p style={{ color: 'var(--text-muted)' }}>
          The global narrator default is {narratorGlobal ? <strong>{narratorGlobal}</strong> : 'not set (see Settings > Project)'}; a narrator override here
          applies only to this project.
        </p>
        {!valuesLoaded && (
          <div role="status" className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {valuesFailed ? 'The values could not be read.' : <>Reading this project&rsquo;s values&hellip;</>}
            {valuesFailed && (
              <Button variant="secondary" size="sm" type="button" onClick={() => void readValues()}>
                Retry
              </Button>
            )}
          </div>
        )}
        {/* Two short fields to a line once the editor has room for them (XSE2-11). */}
        <div aria-busy={!valuesLoaded} className={`grid gap-3 @lg:grid-cols-2 ${valuesLoaded ? '' : 'opacity-60'}`}>
          {VALUE_FIELDS.map(({ key, label }) => {
            const candidate = detected.find((item) => item.token === detectedToken(key));
            const currentValue = values[key] ?? '';
            return (
              <div key={key}>
                <Field label={label} value={currentValue} disabled={savingKey === key || !valuesLoaded} onChange={(value) => void saveValue(key, value)} />
                {candidate && !currentValue && (
                  <p className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>
                      Detected from {candidate.source}: “{candidate.value}”{candidate.confidence === 'low' ? ' (check this)' : ''}.
                    </span>
                    <IconButton action="useSuggestion" size="sm" className="flex-none" onClick={() => acceptDetected(key, candidate)} />
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <Button
          variant="danger"
          className="self-start"
          type="button"
          disabled={!VALUE_FIELDS.some(({ key }) => values[key]) || savingKey !== undefined}
          onClick={() => setConfirmingClear(true)}
        >
          Clear credits
        </Button>
      </section>

      {confirmingClear && (
        <ConfirmDialog
          title="Clear this project's credits?"
          body={`This removes the credit values saved for this project: ${CLEARED_FIELDS}. The credit templates in your library stay, and the credits show their [Tokens] to fill in again.`}
          confirmLabel="Clear credits"
          confirmVariant="danger"
          pending={clearing}
          confirm={() => void clearValues()}
          cancel={() => setConfirmingClear(false)}
        />
      )}

      <RetailSamplePanel notify={notify} />
    </div>
  );
}
