import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown,
  faCodeMerge,
  faFloppyDisk,
  faLock,
  faLockOpen,
  faPause,
  faPen,
  faPlus,
  faRotate,
  faTrash,
  faWaveSquare,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { GuideEntity, GuidePreview, TtsInstallJob } from '../../types';
import { categoryCssName, categoryLabel, categoryValue, CREATABLE_CATEGORIES, findAliasMatches } from '../../state';
import { useApi } from '../../api/ApiContext';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { overlay } from '../../overlay/overlayService';
import { usePendingAction } from '../../hooks/usePendingAction';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
import { CAT_DOT_BG, EntitySummary, entityBadgeColors } from '../manuscript/EntitySummary';
import { Dot, StatusBadge, badgeClass, badgeStyle } from '../primitives/StatusBadge';
import { SlideOver } from '../primitives/SlideOver';
import { Button } from '../primitives/Button';
import { Field } from '../primitives/Field';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Menu } from '../primitives/Menu';
import { Panel } from '../primitives/Panel';
import { TooltipTarget } from '../primitives/Tooltip';
import { previewKey, usePreviewAudio } from './usePreviewAudio';
import { PropertiesSection } from './PropertiesSection';
import { VoiceReferencesSection } from './VoiceReferencesSection';
import { DialogueCueAttribution } from './DialogueCueAttribution';
import { SpeakerColourField } from './SpeakerColourField';
import { NamePronunciation } from './source/NamePronunciation';
import { nameRows } from './source/pronunciationRows';
import { usePronunciationSources } from './source/usePronunciationSources';
import { AppearsIn } from './AppearsIn';
import type { ChapterRef } from './appearsIn';
import { aliasFlagged, entryFlagged, reviewFlags } from './entryList';
import { draftFrom, propertiesFrom, propertyProblem, sameProperties, type DraftProperty } from './propertyDraft';
import { IconButton } from '../primitives/IconButton';
import { Listbox, listboxOptionId } from '../primitives/Listbox';
import { Select } from '../primitives/Select';
import { TextField } from '../primitives/TextField';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import type { Notify } from '../primitives/Toast';

// The alias box's popup of matching entries, named by the text box that drives it.
const ALIAS_MATCHES_ID = 'story-bible-alias-matches';

// What the form holds while an entry is being edited: the entry's own values, until the narrator changes them.
type Draft = { name: string; description: string; personality: string; context: string; properties: DraftProperty[] };
const draftOf = (entity: GuideEntity): Draft => ({
  name: entity.canonical_name,
  description: entity.description.text,
  personality: entity.personality_notes.map((note) => note.text).join(' '),
  context: entity.context || '',
  properties: draftFrom(entity.properties),
});

const NO_CHAPTERS: readonly ChapterRef[] = [];
const NO_PRONUNCIATION_REASON = 'No pronunciation exists for this name yet.';
const VERIFY_FIRST_REASON = 'Verify or reject its suggestions first.';

export function GuideDetail({
  entity,
  isNewDraft = false,
  onDiscardNewDraft,
  onCreatedNewDraft,
  entities,
  reload,
  notify,
  goToManuscript,
  toVerify = 0,
  chapters = NO_CHAPTERS,
  suggested,
}: {
  entity?: GuideEntity;
  // A brand-new entity with no backend record yet - see Guide.tsx's
  // pendingNewEntity/emptyGuideEntity. Nothing is written until a category
  // is chosen, so navigating away just discards it instead of orphaning a
  // "Draft"-category record.
  isNewDraft?: boolean;
  onDiscardNewDraft?: () => void;
  onCreatedNewDraft?: (id: string) => void;
  entities: GuideEntity[];
  reload: (selectId?: string) => Promise<void>;
  notify: Notify;
  // A method, so Guide's (chapter, paragraph) handler still fits; the Appears in list calls it with a chapter alone.
  goToManuscript(chapter: string, paragraph?: number): void;
  // How many of this entry's extraction suggestions are still to be verified; Mark reviewed waits until none are.
  toVerify?: number;
  /** The manuscript's chapters, for Appears in; the page reads them once. */
  chapters?: readonly ChapterRef[];
  /** The entry's accepted claims and the suggestions to verify (the mock's EntryEditor), built by the page that holds the suggestion list. */
  suggested?: ReactNode;
}) {
  const api = useApi();
  const [draft, setDraft] = useState<Draft>({ name: '', description: '', personality: '', context: '', properties: [] });
  const [propertyError, setPropertyError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasSelectedId, setAliasSelectedId] = useState<string>();
  const [aliasActiveIndex, setAliasActiveIndex] = useState(0);
  const [relationOtherId, setRelationOtherId] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const [confirmation, setConfirmation] = useState<'delete' | 'merge'>();
  // A slide-over, not select(id), so opening an alias match to review it
  // never resets the in-progress draft of the entry the user was already
  // editing - see the "Review entry" button below.
  const [reviewOverlayId, setReviewOverlayId] = useState<string>();
  const [ttsPrompt, setTtsPrompt] = useState<{ preview: Extract<GuidePreview, { status: 'asset_required' }>; aliasIndex?: number }>();
  // The voice download: one install-poll hook for every asset (D4). Success carries on with the preview the narrator asked for.
  const voiceInstall = useAssetInstall<TtsInstallJob>({
    start: () => {
      if (!ttsPrompt) return Promise.reject(new Error('Choose a name to preview first.'));
      return api.ttsInstall(ttsPrompt.preview.voice.id);
    },
    state: (jobId) => api.ttsInstallState(jobId),
    cancel: (jobId) => api.ttsInstallCancel(jobId),
    onSuccess: async () => {
      const aliasIndex = ttsPrompt?.aliasIndex;
      setTtsPrompt(undefined);
      notify('Preview voice installed.');
      await playPreview(aliasIndex);
    },
  });
  const resetVoiceInstall = voiceInstall.reset;
  // Every action that changes the Story Bible goes through this (ADR 0075): one at a time, the control that started it says so, and the others
  // wait. Each is a Python process that rewrites the same file, so two at once could lose an update.
  const mutation = usePendingAction();
  const pronunciationSources = usePronunciationSources();
  // An action that outlives a switch to another entry must not pull the selection back to the one it started on when it reloads.
  const currentId = useRef(entity?.id);
  currentId.current = entity?.id;
  const reloadFor = (id: string) => reload(currentId.current === id ? id : undefined);
  const { playingPreview, loadingPreview, playPreview } = usePreviewAudio({
    resetKey: entity,
    requestPreview: (aliasIndex) => {
      if (!entity) throw new Error('Select a Story Bible entry before previewing it.');
      return api.guidePreview(entity.id, aliasIndex);
    },
    onAssetRequired: (preview, aliasIndex) => {
      resetVoiceInstall();
      setTtsPrompt({ preview, aliasIndex });
    },
    notify,
  });

  // Selecting a different entry always starts read-only; a reload of the same
  // entry (after Save, an alias change, ...) keeps its mode.
  useEffect(() => setEditing(false), [entity?.id]);
  useEffect(() => {
    setAliasQuery('');
    setAliasSelectedId(undefined);
    setAliasActiveIndex(0);
    setTtsPrompt(undefined);
    resetVoiceInstall();
    setPropertyError(undefined);
    if (entity) setDraft(draftOf(entity));
  }, [entity, resetVoiceInstall]);

  if (!entity) return <Panel>No matching entities. Build the guide to discover names and terms.</Panel>;
  const locked = entity.locked;
  // Entries open read-only (ADR-0018): Edit reveals the form controls and Save.
  // A locked entry cannot be edited at all, and a brand-new draft is created by
  // choosing its category rather than through the edit form.
  const canEdit = !locked && !isNewDraft;
  const editingDisabled = !canEdit || !editing;
  const stopEditing = () => {
    setEditing(false);
    setPropertyError(undefined);
    setDraft(draftOf(entity));
  };
  // The properties go with a Save only when they changed, so a Save of a name alone does not rewrite them.
  const saveEntry = () => {
    const problem = propertyProblem(draft.properties);
    if (problem) {
      setPropertyError(problem);
      return;
    }
    const properties = propertiesFrom(draft.properties);
    const values: Record<string, string> = {
      canonical_name: draft.name.trim() || entity.canonical_name,
      description: draft.description,
      personality: draft.personality,
      context: draft.context,
    };
    if (!sameProperties(properties, entity.properties)) values.properties = JSON.stringify(properties);
    void save('save', values, 'Entry saved.').then((saved) => saved && setEditing(false));
  };
  const otherEntities = entities.filter((row) => row.id !== entity.id && row.category !== 'Draft');
  const aliasMatches = aliasSelectedId ? [] : findAliasMatches(entities, aliasQuery, entity.id);
  const selectedAliasMatch = aliasSelectedId ? entities.find((row) => row.id === aliasSelectedId) : undefined;
  const reviewOverlayEntity = reviewOverlayId ? entities.find((row) => row.id === reviewOverlayId) : undefined;

  const save = async (key: string, values: Record<string, string>, message: string): Promise<boolean> =>
    (await mutation.run(key, async () => {
      try {
        await api.guideEdit(entity.id, values);
        notify(message);
        await reloadFor(entity.id);
        return true;
      } catch (error) {
        notify(describeApiError(error), 'error');
        return false;
      }
    })) ?? false;
  const setAliasTexts = (aliases: string[], key = 'alias') => save(key, { aliases: aliases.join(';') }, 'Aliases updated.');
  const clearAliasMatch = () => {
    setAliasQuery('');
    setAliasSelectedId(undefined);
    setAliasActiveIndex(0);
  };
  const addAliasFromQuery = () => {
    const value = aliasQuery.trim();
    // Another action is running: keep what was typed instead of clearing it and adding nothing.
    if (!value || mutation.isBusy) return;
    clearAliasMatch();
    void setAliasTexts([...entity.aliases.map((alias) => alias.text), value]);
  };
  const closeVoicePrompt = () => {
    setTtsPrompt(undefined);
    resetVoiceInstall();
  };
  const createNewEntity = (category: string) =>
    mutation.run('create', async () => {
      try {
        const id = await api.guideCreate(draft.name.trim() || entity.canonical_name, category, []);
        notify('Entity created.');
        onCreatedNewDraft?.(id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  const rescanOccurrences = () =>
    mutation.run('rescan', async () => {
      try {
        await api.guideRescan(entity.id);
        notify('Occurrences rescanned.');
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  const setLocked = () =>
    mutation.run('lock', async () => {
      try {
        await api.guideSetLocked(entity.id, !locked);
        notify(locked ? 'Entry unlocked.' : 'Entry locked.');
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  const setSpeakerColour = (index: number) =>
    mutation.run('speaker-colour', async () => {
      try {
        await api.guideSetSpeakerColor(entity.id, index);
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  // Mark reviewed clears the flags of the entry and every name, or of one name. Undo flags back exactly what the entry carried, so a
  // flag the narrator never had is not invented; the host is the one place that decides what a cleared entry looks like.
  const markReviewed = (aliasIndex?: number) => {
    const id = entity.id;
    const flags = reviewFlags(entity);
    const named = aliasIndex === undefined ? undefined : entity.aliases[aliasIndex]?.text;
    const restore: (number | undefined)[] =
      aliasIndex !== undefined
        ? [aliasIndex]
        : [...(flags.entry ? [undefined] : []), ...entity.aliases.flatMap((alias, index) => (flags.aliases.includes(alias.text) ? [index] : []))];
    // Arguments as an array, so a call for the entry carries no `undefined` alias index.
    const argsFor = (index: number | undefined): Parameters<typeof api.guideMarkReviewed> => (index === undefined ? [id] : [id, index]);
    return mutation.run(aliasIndex === undefined ? 'review' : `review:${aliasIndex}`, async () => {
      try {
        await api.guideMarkReviewed(...argsFor(aliasIndex));
        overlay.toastUndo(`“${named ?? entity.canonical_name}” reviewed.`, async () => {
          try {
            for (const index of restore) await api.guideFlagReview(...argsFor(index));
            await reloadFor(id);
            return { ok: true as const };
          } catch (error) {
            return { ok: false as const, refusal: { reason: apiErrorMessage(error) } };
          }
        });
        await reloadFor(id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  };
  const removeRelationship = (relationId: string, label: string) =>
    mutation.run(`unrelate:${relationId}:${label}`, async () => {
      try {
        await api.guideUnrelate(entity.id, relationId, label);
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  const addRelationship = () => {
    if (!relationOtherId || !relationLabel.trim()) return;
    return mutation.run('relate', async () => {
      try {
        await api.guideRelate(entity.id, relationOtherId, relationLabel.trim());
        setRelationOtherId('');
        setRelationLabel('');
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  };
  const deleteEntry = () =>
    mutation.run('delete', async () => {
      try {
        await api.guideDelete(entity.id);
        notify('Entity deleted.');
        await reload();
      } catch (error) {
        notify(describeApiError(error), 'error');
      } finally {
        setConfirmation(undefined);
      }
    });
  const mergeEntry = (source: GuideEntity) =>
    mutation.run('merge', async () => {
      try {
        await api.guideMerge(source.id, entity.id);
        notify(`Merged ${source.canonical_name} into ${entity.canonical_name}.`);
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      } finally {
        setConfirmation(undefined);
        clearAliasMatch();
      }
    });
  // The others wait while one runs; the one that is running shows it is (`pending`).
  const waiting = (key: string) => mutation.isBlockedFor(key);
  const onAliasKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearAliasMatch();
      return;
    }
    if (!aliasSelectedId && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (!aliasMatches.length) return;
      event.preventDefault();
      setAliasActiveIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + aliasMatches.length) % aliasMatches.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!aliasSelectedId && aliasMatches.length > 0) setAliasSelectedId(aliasMatches[aliasActiveIndex].id);
      else if (!aliasSelectedId) addAliasFromQuery();
    }
  };

  return (
    <Panel
      title={entity.canonical_name || 'New entity'}
      leading={<Dot color={CAT_DOT_BG[categoryCssName(entity.category)]} />}
      subtitle={
        <div className="flex items-center gap-2" style={{ position: 'relative' }}>
          <Menu
            triggerClassName={badgeClass('pill')}
            triggerStyle={badgeStyle(entityBadgeColors(entity.category))}
            disabled={locked || !(editing || isNewDraft) || mutation.isBusy}
            items={CREATABLE_CATEGORIES.map((label) => ({
              key: label,
              label,
              leading: <Dot color={CAT_DOT_BG[categoryValue(label)]} />,
              onSelect: () => {
                if (isNewDraft) void createNewEntity(categoryValue(label));
                else void save('category', { category: categoryValue(label) }, `Category changed to ${label}.`);
              },
            }))}
          >
            {categoryLabel(entity.category)} <FontAwesomeIcon icon={faChevronDown} />
          </Menu>
          {(entryFlagged(entity) || toVerify > 0) && <StatusBadge tone="warning" label="Needs review" />}
        </div>
      }
      actions={
        <>
          {entryFlagged(entity) &&
            (toVerify > 0 ? (
              <TooltipTarget text={VERIFY_FIRST_REASON}>
                <Button variant="secondary" size="sm" disabled>
                  Mark reviewed
                </Button>
              </TooltipTarget>
            ) : (
              <Button variant="secondary" size="sm" pending={mutation.isPending('review')} disabled={waiting('review')} onClick={() => void markReviewed()}>
                Mark reviewed
              </Button>
            ))}
          {/* Lock/Unlock is read-view only (ADR 0087): it can never be pressed mid-edit, so an edit is never silently discarded by a lock. */}
          {!isNewDraft && !editing && (
            <TooltipTarget text={locked ? 'Unlock entry' : 'Lock entry'}>
              <IconButton
                label={locked ? 'Unlock entry' : 'Lock entry'}
                pending={mutation.isPending('lock')}
                disabled={waiting('lock')}
                onClick={() => void setLocked()}
              >
                <FontAwesomeIcon icon={locked ? faLock : faLockOpen} />
              </IconButton>
            </TooltipTarget>
          )}
          {canEdit && !editing && (
            <TooltipTarget text="Edit this entry">
              <IconButton label="Edit this entry" disabled={mutation.isBusy} onClick={() => setEditing(true)}>
                <FontAwesomeIcon icon={faPen} />
              </IconButton>
            </TooltipTarget>
          )}
          {canEdit && editing && (
            <>
              <TooltipTarget text="Save changes to this entry">
                <IconButton
                  label="Save changes to this entry"
                  pending={mutation.isPending('save')}
                  disabled={waiting('save')}
                  onClick={saveEntry}
                  variant="primary"
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                </IconButton>
              </TooltipTarget>
              <TooltipTarget text="Discard changes and stop editing">
                <IconButton label="Cancel editing" onClick={stopEditing}>
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </TooltipTarget>
              {/* Delete only exists in edit mode (ADR 0087): unreachable from the read view, and set off from Save/Cancel by a divider
                  so it cannot be mis-clicked beside them (B5). A locked entry never reaches edit mode (ADR 0007), so it never has one. */}
              <div className="ml-1 border-l pl-2" style={{ borderColor: 'var(--border)' }}>
                <TooltipTarget text="Delete entity">
                  <IconButton label="Delete entity" variant="danger" disabled={mutation.isBusy} onClick={() => setConfirmation('delete')}>
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </TooltipTarget>
              </div>
            </>
          )}
          {isNewDraft && (
            <TooltipTarget text="Cancel: drop this new entry">
              <IconButton label="Cancel new entry" onClick={() => onDiscardNewDraft?.()}>
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </TooltipTarget>
          )}
        </>
      }
      scroll
      className="min-h-0 flex-1"
    >
      <div className="space-y-4">
        {locked && (
          <p className="rounded px-3 py-1.5 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <FontAwesomeIcon icon={faLock} className="mr-1.5" />
            Locked entries cannot be deleted or used as merge sources.
          </p>
        )}
        {entity.category === 'Draft' && (
          <p className="rounded px-3 py-1.5 text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
            Choose a category above to finish setting up this entry.
          </p>
        )}
        <div>
          <div className="mb-1.5 text-[0.82rem] font-medium text-[var(--text-muted)]">Name</div>
          <TextField label="Name" disabled={editingDisabled} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        </div>

        <div>
          <div className="mb-1.5 text-[0.82rem] font-medium text-[var(--text-muted)]">Names the app links in the text, and how I say each</div>
          <ul aria-label="Names" className="m-0 list-none space-y-3 p-0">
            {nameRows(entity).map((row) => {
              const { aliasIndex, name, pronunciation } = row;
              const key = previewKey(aliasIndex);
              const playing = playingPreview === key;
              const playReason = playing || pronunciation.ipa ? undefined : NO_PRONUNCIATION_REASON;
              const flagged = aliasIndex !== undefined && aliasFlagged(entity, name);
              return (
                <li key={`${aliasIndex ?? 'entry'}:${name}`} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <NamePronunciation
                      entityId={entity.id}
                      row={row}
                      editing={canEdit && editing}
                      locked={locked}
                      sources={pronunciationSources}
                      reload={() => reloadFor(entity.id)}
                      notify={notify}
                    />
                    {flagged && <StatusBadge tone="warning" label="Needs review" />}
                    {/* A note from before pronunciation statuses were removed (ADR 0792): kept readable, no longer edited. */}
                    {pronunciation.note && <p className="m-0 text-xs text-[var(--text-muted)]">Note: {pronunciation.note}</p>}
                  </div>
                  <TooltipTarget
                    text={
                      aliasIndex === undefined
                        ? playing
                          ? 'Pause pronunciation preview'
                          : (playReason ?? 'Play provider-generated pronunciation')
                        : playing
                          ? 'Pause alias pronunciation preview'
                          : (playReason ?? 'Play this alias pronunciation')
                    }
                  >
                    <IconButton
                      label={
                        aliasIndex === undefined
                          ? playing
                            ? 'Pause preview'
                            : 'Play preview'
                          : playing
                            ? 'Pause alias pronunciation'
                            : 'Play alias pronunciation'
                      }
                      disabledReason={playReason}
                      pending={loadingPreview === key}
                      onClick={() => void playPreview(aliasIndex)}
                    >
                      <FontAwesomeIcon icon={playing ? faPause : faWaveSquare} />
                    </IconButton>
                  </TooltipTarget>
                  {flagged && (
                    <TooltipTarget text={`Mark ${name} reviewed`}>
                      <IconButton
                        action="markReviewed"
                        label={`Mark ${name} reviewed`}
                        pending={mutation.isPending(`review:${aliasIndex}`)}
                        disabled={waiting(`review:${aliasIndex}`)}
                        onClick={() => void markReviewed(aliasIndex)}
                      />
                    </TooltipTarget>
                  )}
                  {aliasIndex !== undefined && canEdit && editing && (
                    <IconButton
                      label={`Remove alias ${name}`}
                      disabled={waiting(`alias:${name}`)}
                      pending={mutation.isPending(`alias:${name}`)}
                      onClick={() =>
                        void setAliasTexts(
                          entity.aliases.filter((other) => other.text !== name).map((other) => other.text),
                          `alias:${name}`,
                        )
                      }
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3">
            <TextField
              label="Add an alias or find a matching entry"
              role="combobox"
              aria-expanded={aliasMatches.length > 0}
              aria-controls={aliasMatches.length > 0 ? ALIAS_MATCHES_ID : undefined}
              aria-activedescendant={aliasMatches[aliasActiveIndex] ? listboxOptionId(ALIAS_MATCHES_ID, aliasMatches[aliasActiveIndex].id) : undefined}
              disabled={editingDisabled}
              value={aliasQuery}
              onChange={(value) => {
                setAliasQuery(value);
                setAliasSelectedId(undefined);
                setAliasActiveIndex(0);
              }}
              onKeyDown={onAliasKeyDown}
              placeholder="Add an alias or find a matching entry…"
            />
            {selectedAliasMatch ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Selected match: <strong>{selectedAliasMatch.canonical_name}</strong>
                  {selectedAliasMatch.locked ? ' · locked' : ''}
                </span>
                <Button variant="secondary" onClick={() => setReviewOverlayId(selectedAliasMatch.id)}>
                  Review entry
                </Button>
                {selectedAliasMatch.locked ? (
                  <TooltipTarget text="Locked entries cannot be merged because the source would be deleted.">
                    <Button variant="primary" disabled>
                      Merge into current entry
                    </Button>
                  </TooltipTarget>
                ) : (
                  <Button variant="primary" disabled={mutation.isBusy} onClick={() => setConfirmation('merge')}>
                    <FontAwesomeIcon icon={faCodeMerge} />
                    Merge into current entry
                  </Button>
                )}
                <Button variant="secondary" onClick={clearAliasMatch}>
                  Clear selection
                </Button>
              </div>
            ) : aliasQuery ? (
              <div className="mt-1">
                <Listbox
                  id={ALIAS_MATCHES_ID}
                  label="Matching Story Bible entries"
                  options={aliasMatches.map((match) => ({
                    id: match.id,
                    label: match.canonical_name,
                    description: categoryLabel(match.category),
                    leading: <Dot color={CAT_DOT_BG[categoryCssName(match.category)]} />,
                  }))}
                  activeIndex={aliasActiveIndex}
                  onPick={setAliasSelectedId}
                  empty="No matching Story Bible entries."
                  footer={
                    <div data-alias-actions className="flex items-center justify-between p-2">
                      <TooltipTarget text="Add alias">
                        <IconButton
                          label="Add alias"
                          disabled={editingDisabled || waiting('alias')}
                          pending={mutation.isPending('alias')}
                          onClick={addAliasFromQuery}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                        </IconButton>
                      </TooltipTarget>
                      <TooltipTarget text="Rescan occurrences for this entry">
                        <IconButton
                          label="Rescan occurrences"
                          disabled={isNewDraft || waiting('rescan')}
                          pending={mutation.isPending('rescan')}
                          onClick={() => void rescanOccurrences()}
                        >
                          <FontAwesomeIcon icon={faRotate} />
                        </IconButton>
                      </TooltipTarget>
                    </div>
                  }
                />
              </div>
            ) : (
              <div data-alias-actions className="mt-2 flex items-center justify-between">
                <TooltipTarget text="Add alias">
                  <IconButton
                    label="Add alias"
                    disabled={editingDisabled || waiting('alias')}
                    pending={mutation.isPending('alias')}
                    onClick={addAliasFromQuery}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </IconButton>
                </TooltipTarget>
                <TooltipTarget text="Rescan occurrences for this entry">
                  <IconButton
                    label="Rescan occurrences"
                    disabled={isNewDraft || waiting('rescan')}
                    pending={mutation.isPending('rescan')}
                    onClick={() => void rescanOccurrences()}
                  >
                    <FontAwesomeIcon icon={faRotate} />
                  </IconButton>
                </TooltipTarget>
              </div>
            )}
          </div>
        </div>

        <Field
          label="Description"
          textarea
          disabled={editingDisabled}
          value={draft.description}
          onChange={(value) => setDraft({ ...draft, description: value })}
        />

        <PropertiesSection
          saved={entity.properties}
          rows={draft.properties}
          editing={editing && canEdit}
          error={propertyError}
          onChange={(properties) => {
            setPropertyError(undefined);
            setDraft({ ...draft, properties });
          }}
        />

        {entity.category === 'Character' && (
          <>
            <Field
              label="Personality notes"
              textarea
              disabled={editingDisabled}
              value={draft.personality}
              onChange={(value) => setDraft({ ...draft, personality: value })}
            />
            {!isNewDraft && (
              <>
                <SpeakerColourField entity={entity} disabled={mutation.isBusy || locked} onChange={(index) => void setSpeakerColour(index)} />
                <VoiceReferencesSection characterId={entity.id} characterLabel={entity.canonical_name} notify={notify} />
                <DialogueCueAttribution entity={entity} entities={entities} notify={notify} />
              </>
            )}
          </>
        )}
        {entity.category === 'Place' && (
          <Field
            label="Location context"
            textarea
            disabled={editingDisabled}
            value={draft.context}
            onChange={(value) => setDraft({ ...draft, context: value })}
          />
        )}
        {entity.category === 'Event' && (
          <Field label="Timeline context" disabled={editingDisabled} value={draft.context} onChange={(value) => setDraft({ ...draft, context: value })} />
        )}
        {entity.category === 'Item' && (
          <Field label="Item context" textarea disabled={editingDisabled} value={draft.context} onChange={(value) => setDraft({ ...draft, context: value })} />
        )}
        {entity.category === 'Lore' && (
          <Field label="Lore context" textarea disabled={editingDisabled} value={draft.context} onChange={(value) => setDraft({ ...draft, context: value })} />
        )}

        {suggested}

        <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2 text-[0.82rem] font-medium text-[var(--text-muted)]">Relationships</div>
          <Table label="Relationships">
            <TableHead>
              <TableRow>
                <TableHeader>Relationship</TableHeader>
                <TableHeader>Entry</TableHeader>
                <TableHeader hiddenLabel="Remove" />
              </TableRow>
            </TableHead>
            <TableBody>
              {entity.relationships.map((rel) => (
                <TableRow key={`${rel.id}-${rel.label}`}>
                  <TableCell>{rel.label}</TableCell>
                  <TableCell>{rel.name}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      label="Remove relationship"
                      disabled={editingDisabled || waiting(`unrelate:${rel.id}:${rel.label}`)}
                      pending={mutation.isPending(`unrelate:${rel.id}:${rel.label}`)}
                      onClick={() => void removeRelationship(rel.id, rel.label)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {entity.relationships.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} style={{ color: 'var(--text-muted)' }}>
                    No related entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
            <TextField
              label="Relationship"
              disabled={editingDisabled}
              value={relationLabel}
              onChange={setRelationLabel}
              placeholder="Relationship, e.g. located in"
            />
            <Select
              label="Related entry"
              fullWidth
              disabled={editingDisabled}
              value={relationOtherId}
              onChange={setRelationOtherId}
              options={[{ value: '', label: 'Choose entry…' }, ...otherEntities.map((row) => ({ value: row.id, label: row.canonical_name }))]}
            />
            <Button
              variant="secondary"
              disabled={editingDisabled || waiting('relate')}
              pending={mutation.isPending('relate')}
              onClick={() => void addRelationship()}
            >
              <FontAwesomeIcon icon={faPlus} /> Add
            </Button>
          </div>
        </div>

        <AppearsIn entity={entity} manuscript={chapters} onGo={(chapterId) => goToManuscript(chapterId)} />
        {ttsPrompt && (
          <AssetInstallPrompt
            ask={{
              title: 'Download local preview voice?',
              body: `This local voice is needed to play “${ttsPrompt.aliasIndex === undefined ? entity.canonical_name : (entity.aliases[ttsPrompt.aliasIndex]?.text ?? 'this alias')}”. It is not bundled with Narration Studio and will be stored in your per-user asset cache.`,
              confirmLabel: 'Download voice',
            }}
            workTitle="Downloading preview voice"
            install={voiceInstall}
            dismiss={closeVoicePrompt}
          >
            <AssetFacts
              label="Voice"
              name={`${ttsPrompt.preview.voice.displayName} · ${ttsPrompt.preview.voice.locale}`}
              version={ttsPrompt.preview.voice.version}
              publisher={ttsPrompt.preview.voice.publisher}
              license={ttsPrompt.preview.voice.license}
              licenseUrl={ttsPrompt.preview.voice.licenseUrl}
              modelCardUrl={ttsPrompt.preview.voice.modelCardUrl}
              provenanceUrl={ttsPrompt.preview.voice.provenanceUrl}
              downloadSize={ttsPrompt.preview.downloadSize}
              diskSize={ttsPrompt.preview.diskSize}
              installPath={ttsPrompt.preview.installPath}
            />
          </AssetInstallPrompt>
        )}
        {confirmation === 'delete' && (
          <ConfirmDialog
            title="Delete entry"
            body={`Delete “${entity.canonical_name}” and its aliases, evidence, and relationships? This cannot be undone.`}
            confirmLabel="Delete entry"
            confirmVariant="danger"
            pending={mutation.isPending('delete')}
            confirm={() => void deleteEntry()}
            cancel={() => setConfirmation(undefined)}
          />
        )}
        {confirmation === 'merge' && selectedAliasMatch && (
          <ConfirmDialog
            title="Merge entries"
            body={`Merge “${selectedAliasMatch.canonical_name}” into “${entity.canonical_name}”? The source entry will be deleted.`}
            confirmLabel="Merge & delete source"
            confirmVariant="danger"
            pending={mutation.isPending('merge')}
            confirm={() => void mergeEntry(selectedAliasMatch)}
            cancel={() => setConfirmation(undefined)}
          />
        )}
      </div>
      <SlideOver
        open={Boolean(reviewOverlayEntity)}
        title={reviewOverlayEntity?.canonical_name || 'Review entry'}
        closeLabel="Close review panel"
        onClose={() => setReviewOverlayId(undefined)}
      >
        {reviewOverlayEntity && <EntitySummary entity={reviewOverlayEntity} jumpToLine={goToManuscript} />}
      </SlideOver>
    </Panel>
  );
}
