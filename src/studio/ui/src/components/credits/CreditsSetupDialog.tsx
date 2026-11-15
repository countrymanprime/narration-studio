import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { CreditsSetupState, CreditValues, DetectedCandidate } from '../../types';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { Field } from '../primitives/Field';
import type { Notify } from '../primitives/Toast';
import { plural } from '../../plural';
import { confirmDiscard } from '../../studio/drafts/confirmDiscard';
import { SaveTimeout, withinSaveLimit } from '../../studio/drafts/unsavedDrafts';

// A DetectedCandidate's token is a credits.Values Go field name ("Title", "CopyrightHolder"), matching CreditsPanel's
// own map (detectedToken there goes the other way, lowerCamelCase to this form).
const CANDIDATE_LABELS: Record<string, string> = {
  Title: 'Title',
  Subtitle: 'Subtitle',
  Author: 'Author',
  Series: 'Series',
  BookNumber: 'Book Number',
  Copyright: 'Copyright',
  Year: 'Year',
  CopyrightHolder: 'Copyright Holder',
  Publisher: 'Publisher',
};

function humanList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// The caption under a prefilled field: its source, which of the manuscript's lines it came from (e.g.
// "From the title page, lines 1–3: AFTER / THE / APPLAUSE"), whether an all-capitals line was recased for the field
// and, for a low-confidence guess, "(check this)".
function candidateCaption(candidate: DetectedCandidate): string {
  let caption = `From ${candidate.source}`;
  if (candidate.lines && candidate.lines.length > 0) {
    caption += candidate.lines.length > 1 ? `, lines 1–${candidate.lines.length}: ${candidate.lines.join(' / ')}` : `, line 1: ${candidate.lines[0]}`;
    const allCapsLines = candidate.lines.every((line) => /[A-Z]/.test(line) && !/[a-z]/.test(line));
    if (allCapsLines && /[a-z]/.test(candidate.value)) caption += ' (recased)';
  }
  if (candidate.confidence === 'low') caption += ' (check this)';
  return caption;
}

/**
 * "Set up the credits": a
 * dialog shown once per project when `CreditsSetupState.needed` is true. Every field is prefilled from its detected
 * candidate and captioned with its source, so the narrator sees exactly what will be written before they write
 * it. Save fills only the
 * fields the narrator confirms (`creditsSetupSave` never replaces a value already set); "Not now" dismisses for this
 * session only, and "Don't ask for this project" dismisses until a Replace manuscript.
 */
export function CreditsSetupDialog({
  state,
  onDone,
  onMoreFields,
  notify,
}: {
  state: CreditsSetupState;
  /** Called with the host's answer after any of the three actions, so the caller (the Production home) can drop the dialog. */
  onDone: (next: CreditsSetupState) => void;
  /** "Settings > Credits" (the "More fields" link): the fields this dialog does not ask for, detected but waiting there. */
  onMoreFields: () => void;
  notify: Notify;
}) {
  const api = useApi();
  const [values, setValues] = useState<Partial<Record<keyof CreditValues, string>>>(() =>
    Object.fromEntries(state.fields.map((field) => [field.field, field.candidate?.value ?? ''])),
  );
  // Offered only while the global default is empty (the only reason Narrator is ever among `fields`),
  // checked by default so a first answer becomes every project's default.
  const [useForAllProjects, setUseForAllProjects] = useState(true);
  const [busy, setBusy] = useState(false);
  const asksForNarrator = state.fields.some((field) => field.field === 'narrator');
  const askedTokens = new Set(state.fields.map((field) => field.token));
  const moreFields = state.candidates.filter((candidate) => !askedTokens.has(candidate.token));

  // A call the host has not answered at the limit: the dialog is given back with what was typed, and a second press sends nothing while the first is still out (#3461 round 11 BR-D).
  const outstanding = useRef(false);
  const lateAnswer = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const run = async (action: () => Promise<CreditsSetupState>) => {
    if (outstanding.current) {
      notify('Your first save is still waiting for an answer.');
      return;
    }
    setBusy(true);
    outstanding.current = true;
    const call = action();
    void call.then(
      (next) => {
        outstanding.current = false;
        // An answer that lands after the limit is still the host's: it finishes the setup if the dialog is still here.
        if (lateAnswer.current && mounted.current) onDone(next);
      },
      () => void (outstanding.current = false),
    );
    lateAnswer.current = false;
    try {
      onDone(await withinSaveLimit(call));
    } catch (error) {
      if (error instanceof SaveTimeout) {
        lateAnswer.current = true;
        notify('The save did not finish. What you typed is still here.', 'error');
      } else notify(apiErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const narrator = values.narrator?.trim();
      if (asksForNarrator && useForAllProjects && narrator) {
        await api.saveSettings('General', 'global', { narrator_name: narrator });
      }
      return api.creditsSetupSave(values);
    });
  // Values the narrator changed from what was filled in: Escape, the close button, Not now and Don't ask would drop them, so each asks first. Save is the way to keep them (#3400).
  const typed = state.fields.some((field) => (values[field.field] ?? '') !== (field.candidate?.value ?? ''));
  // While Save runs every way out is off, Escape and the close button too (a Discard answered then would still be followed by the save that is already out): the buttons are disabled, and so is this (#3461 round 6 B3).
  const leaving = (action: () => Promise<CreditsSetupState>) => async () => {
    if (busy) return;
    if (typed && !(await confirmDiscard('what you typed'))) return;
    await run(action);
  };
  const notNow = leaving(() => api.creditsSetupDismiss('session'));
  const dontAsk = leaving(() => api.creditsSetupDismiss('project'));

  const fieldCount = state.fields.length;

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Set up the credits"
      description={`Your opening and closing credits need ${plural(fieldCount, 'value')}. We filled in what the manuscript already says; check them and save.`}
      onClose={() => void notNow()}
      actions={
        <>
          <Button variant="secondary" type="button" disabled={busy} onClick={() => void dontAsk()}>
            Don&rsquo;t ask for this project
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" disabled={busy} onClick={() => void notNow()}>
              Not now
            </Button>
            <Button variant="primary" type="button" disabled={busy} pending={busy} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        {state.fields.map((field, index) => (
          <div key={field.field}>
            <Field
              label={field.token}
              value={values[field.field] ?? ''}
              disabled={busy}
              autoFocus={index === 0}
              onChange={(value) => setValues((current) => ({ ...current, [field.field]: value }))}
            />
            {field.candidate ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {candidateCaption(field.candidate)}
              </p>
            ) : field.field === 'narrator' && !(values.narrator ?? '').trim() ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Not set yet: nothing in the manuscript names the narrator.
              </p>
            ) : null}
            {/* The option sits a step below the hint it follows, not against it (XPR1-30). */}
            {field.field === 'narrator' && (
              <div className="mt-2">
                <Checkbox checked={useForAllProjects} disabled={busy} onChange={setUseForAllProjects}>
                  Use for all my projects (saved as your default in Settings &gt; Project)
                </Checkbox>
              </div>
            )}
          </div>
        ))}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Only empty values are filled in; nothing you have already set is changed.
          {moreFields.length > 0 && (
            <>
              {' '}
              {humanList(moreFields.map((candidate) => CANDIDATE_LABELS[candidate.token] ?? candidate.token))} {moreFields.length === 1 ? 'was' : 'were'} also
              found and {moreFields.length === 1 ? 'is' : 'are'} waiting in{' '}
              <Button variant="link" onClick={onMoreFields}>
                Settings &gt; Credits
              </Button>
              .
            </>
          )}
        </p>
      </div>
    </Dialog>
  );
}
