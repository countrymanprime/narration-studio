import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
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
import { Icon } from '../primitives/Icon';
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
import { findQuery } from '../script/page/scriptQuery';
import { aliasFlagged, entryFlagged, reviewFlags } from './entryList';
import { EntryText } from './EntryText';
import {
  draftFrom,
  NO_TALK,
  propertiesFrom,
  propertyProblem,
  sameProperties,
  splitTalk,
  TALK_FIELDS,
  withTalk,
  type DraftProperty,
  type TalkDraft,
} from './propertyDraft';
import { IconButton } from '../primitives/IconButton';
import { Listbox, listboxOptionId } from '../primitives/Listbox';
import { TextField } from '../primitives/TextField';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import type { Notify } from '../primitives/Toast';

// The alias box's popup of matching entries, named by the text box that drives it.
const ALIAS_MATCHES_ID = 'story-bible-alias-matches';

// What the form holds while an entry is being edited: the entry's own values, until the narrator changes them.
// A character's says, does and knows properties are fields of their own (`talk`), so `properties` holds the rest.
type Draft = { name: string; description: string; personality: string; context: string; properties: DraftProperty[]; talk: TalkDraft };
const speaks = (entity: GuideEntity) => entity.category === 'Character';
const propertiesOf = (entity: GuideEntity) => (speaks(entity) ? splitTalk(entity.properties) : { rest: entity.properties, talk: NO_TALK });
const draftOf = (entity: GuideEntity): Draft => ({
  name: entity.canonical_name,
  description: entity.description.text,
  personality: entity.personality_notes.map((note) => note.text).join(' '),
  context: entity.context || '',
  properties: draftFrom(propertiesOf(entity).rest),
  talk: propertiesOf(entity).talk,
});

// The matches of the relationship picker's search box, named by the text box that drives it.
const RELATION_MATCHES_ID = 'story-bible-relation-matches';
const PICKER_LIMIT = 50;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const hasText = (entry: GuideEntity, text: string) => {
  const needle = text.trim().toLowerCase();
  return entry.canonical_name.toLowerCase().includes(needle) || entry.aliases.some((alias) => alias.text.toLowerCase().includes(needle));
};
const hasName = (entry: GuideEntity, text: string) => sameName(entry.canonical_name, text) || entry.aliases.some((alias) => sameName(alias.text, text));
/** The other entry that already has `text` as its name or one of its names, ignoring case; a draft is not an entry yet. */
const nameOwner = (entries: readonly GuideEntity[], text: string, exceptId: string) =>
  entries.find((row) => row.id !== exceptId && row.category !== 'Draft' && hasName(row, text));

/** One row of the Relationships table: the relationship and the other entry. The host holds a relationship on the entry it was written from. */
type RelationRow = { key: string; label: string; otherId: string; otherName: string; incoming: boolean; holderId: string; targetId: string };
const relationRows = (entity: GuideEntity, entries: readonly GuideEntity[]): RelationRow[] => [
  ...entity.relationships.map((rel) => ({
    key: `out:${rel.id}:${rel.label}`,
    label: rel.label,
    otherId: rel.id,
    otherName: rel.name,
    incoming: false,
    holderId: entity.id,
    targetId: rel.id,
  })),
  ...entries
    .filter((other) => other.id !== entity.id && other.category !== 'Draft')
    .flatMap((other) =>
      other.relationships
        .filter((rel) => rel.id === entity.id)
        .map((rel) => ({
          key: `in:${other.id}:${rel.label}`,
          label: rel.label,
          otherId: other.id,
          otherName: other.canonical_name,
          incoming: true,
          holderId: other.id,
          targetId: entity.id,
        })),
    ),
];

/** The entry's header button that opens the Script page's Find on its name. Drawn only inside the router, which every page has. */
function FindInManuscript({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <TooltipTarget text="Find in the manuscript">
      <IconButton action="find" label="Find in the manuscript" onClick={() => navigate(`/script${findQuery(name)}`)} />
    </TooltipTarget>
  );
}

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
  // The Find button navigates, so it needs the router every page has; a detail drawn outside one (a story, a unit test) has none.
  const inRouter = useInRouterContext();
  const [draft, setDraft] = useState<Draft>({ name: '', description: '', personality: '', context: '', properties: [], talk: NO_TALK });
  const [propertyError, setPropertyError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasSelectedId, setAliasSelectedId] = useState<string>();
  const [aliasActiveIndex, setAliasActiveIndex] = useState(0);
  // A name the narrator asked to add that the entry or another entry already has: the Names box says so, and for another entry's offers to merge it in.
  const [nameNote, setNameNote] = useState<{ text: string; ownerId?: string }>();
  const [nameError, setNameError] = useState<string>();
  const [relationOtherId, setRelationOtherId] = useState('');
  const [relationQuery, setRelationQuery] = useState('');
  const [relationActiveIndex, setRelationActiveIndex] = useState(0);
  const [relationLabel, setRelationLabel] = useState('');
  const [confirmation, setConfirmation] = useState<'delete'>();
  const nameField = useRef<HTMLInputElement>(null);
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
  // What was half done for one entry (an offer to merge, a relationship being written) is not carried to the next.
  useEffect(() => {
    setNameNote(undefined);
    setRelationOtherId('');
    setRelationQuery('');
    setRelationActiveIndex(0);
    setRelationLabel('');
  }, [entity?.id]);
  // A new entry opens with its name ready to type over (the mock's NameBox); starting another one while it is open does the same.
  useEffect(() => {
    if (!isNewDraft) return;
    nameField.current?.focus();
    nameField.current?.select();
  }, [isNewDraft, entity]);
  useEffect(() => {
    setAliasQuery('');
    setAliasSelectedId(undefined);
    setAliasActiveIndex(0);
    setNameError(undefined);
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
    const problem = propertyProblem(draft.properties, speaks(entity));
    if (problem) {
      setPropertyError(problem);
      return;
    }
    const nameIssue = nameProblem(draft.name);
    if (nameIssue) {
      setNameError(nameIssue);
      return;
    }
    const saved = propertiesOf(entity);
    const properties = speaks(entity) ? withTalk(propertiesFrom(draft.properties), draft.talk) : propertiesFrom(draft.properties);
    const before = speaks(entity) ? withTalk(saved.rest, saved.talk) : entity.properties;
    const values: Record<string, string> = {
      canonical_name: draft.name.trim(),
      description: draft.description,
      personality: draft.personality,
      context: draft.context,
    };
    if (!sameProperties(properties, before)) values.properties = JSON.stringify(properties);
    void save('save', values, 'Entry saved.').then((saved) => saved && setEditing(false));
  };
  // An entry cannot be saved with no name or with one another entry has (the mock's renameEntry).
  const nameProblem = (name: string) => {
    if (!name.trim()) return 'Give this entry a name.';
    const owner = nameOwner(entities, name, entity.id);
    return owner ? `“${name.trim()}” is already a name of ${owner.canonical_name}.` : undefined;
  };
  const otherEntities = entities.filter((row) => row.id !== entity.id && row.category !== 'Draft');
  const relations = relationRows(entity, entities);
  const pickedEntity = otherEntities.find((row) => row.id === relationOtherId);
  // The picker lists matches only once the narrator types, as the alias box does; the arrow keys and Enter act on that list.
  const relationMatches = relationQuery.trim() && !editingDisabled ? otherEntities.filter((row) => hasText(row, relationQuery)).slice(0, PICKER_LIMIT) : [];
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
    setNameNote(undefined);
  };
  // The text in the Names box is a name this entry or another entry already has (ignoring case): adding it would make a copy.
  const typedOwner = () => {
    const value = aliasQuery.trim();
    if (!value) return undefined;
    if (hasName(entity, value)) return { text: value };
    const owner = nameOwner(entities, value, entity.id);
    return owner ? { text: value, ownerId: owner.id } : undefined;
  };
  const addAliasFromQuery = () => {
    const value = aliasQuery.trim();
    // Another action is running: keep what was typed instead of clearing it and adding nothing.
    if (!value || mutation.isBusy) return;
    const taken = typedOwner();
    if (taken) {
      setNameNote(taken);
      return;
    }
    clearAliasMatch();
    void setAliasTexts([...entity.aliases.map((alias) => alias.text), value]);
  };
  const closeVoicePrompt = () => {
    setTtsPrompt(undefined);
    resetVoiceInstall();
  };
  const createNewEntity = (category: string) => {
    const issue = nameProblem(draft.name);
    if (issue) {
      setNameError(issue);
      return;
    }
    return mutation.run('create', async () => {
      try {
        const id = await api.guideCreate(draft.name.trim(), category, []);
        notify('Entity created.');
        onCreatedNewDraft?.(id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  };
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
  // A relationship is held by the entry it was written from, so an incoming one is removed from the other entry.
  const removeRelationship = (row: RelationRow) =>
    mutation.run(`unrelate:${row.key}`, async () => {
      try {
        await api.guideUnrelate(row.holderId, row.targetId, row.label);
        await reloadFor(entity.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  const pickRelated = (id: string) => {
    setRelationOtherId(id);
    setRelationQuery('');
    setRelationActiveIndex(0);
  };
  const onRelationKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setRelationQuery('');
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && relationMatches.length) {
      event.preventDefault();
      setRelationActiveIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + relationMatches.length) % relationMatches.length);
      return;
    }
    if (event.key === 'Enter' && relationMatches[relationActiveIndex]) {
      event.preventDefault();
      pickRelated(relationMatches[relationActiveIndex].id);
    }
  };
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
        notify(`Deleted “${entity.canonical_name}”.`);
        await reload();
      } catch (error) {
        notify(describeApiError(error), 'error');
      } finally {
        setConfirmation(undefined);
      }
    });
  // The source is folded into this entry in one step, and the toast's Undo takes that step back (SB-3): both entries, the re-pointed
  // relationships and the names the merge absorbed come back as they were, or the toast says why not.
  const mergeEntry = (source: GuideEntity) => {
    const target = entity;
    return mutation.run('merge', async () => {
      try {
        const { undoId } = await api.guideMerge(source.id, target.id);
        clearAliasMatch();
        overlay.toastUndo(`Merged “${source.canonical_name}” into “${target.canonical_name}”.`, async () => {
          try {
            await api.guideUnmerge(undoId);
            await reloadFor(target.id);
            return { ok: true as const };
          } catch (error) {
            return { ok: false as const, refusal: { reason: apiErrorMessage(error) } };
          }
        });
        await reloadFor(target.id);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  };
  // Merges `source` into this entry; a locked source stays, since the merge would delete it.
  const mergeButton = (source?: GuideEntity) =>
    source?.locked ? (
      <TooltipTarget text="Locked entries cannot be merged because the source would be deleted.">
        <Button variant="primary" disabled>
          Merge into this entry
        </Button>
      </TooltipTarget>
    ) : (
      <Button variant="primary" pending={mutation.isPending('merge')} disabled={!source || waiting('merge')} onClick={() => source && void mergeEntry(source)}>
        <FontAwesomeIcon icon={faCodeMerge} />
        Merge into this entry
      </Button>
    );
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
      // A name that is already taken is answered, not read as a pick from the list of matches that contain it.
      if (!aliasSelectedId && aliasMatches.length > 0 && !typedOwner()) setAliasSelectedId(aliasMatches[aliasActiveIndex].id);
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
          {inRouter && <FindInManuscript name={entity.canonical_name} />}
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
        {/* The name is the panel's heading until Edit; only then is it a field (the mock's EntryEditor). A new draft has no heading worth reading yet, so it keeps the field. */}
        {(!editingDisabled || isNewDraft) && (
          <div>
            <div className="mb-1.5 text-[0.82rem] font-medium text-[var(--text-muted)]">Name</div>
            <TextField
              ref={nameField}
              label="Name"
              disabled={editingDisabled && !isNewDraft}
              value={draft.name}
              aria-invalid={nameError ? true : undefined}
              onChange={(name) => {
                setNameError(undefined);
                setDraft({ ...draft, name });
              }}
            />
            {nameError && (
              <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--danger-text)' }}>
                {nameError}
              </p>
            )}
          </div>
        )}

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
                setNameNote(undefined);
              }}
              onKeyDown={onAliasKeyDown}
              placeholder="Add an alias or find a matching entry…"
            />
            {nameNote && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {nameNote.ownerId
                    ? `“${nameNote.text}” is already a name of ${entities.find((row) => row.id === nameNote.ownerId)?.canonical_name ?? 'another entry'}.`
                    : `“${nameNote.text}” is already a name of this entry.`}
                </span>
                {nameNote.ownerId && mergeButton(entities.find((row) => row.id === nameNote.ownerId))}
              </div>
            )}
            {selectedAliasMatch ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Selected match: <strong>{selectedAliasMatch.canonical_name}</strong>
                  {selectedAliasMatch.locked ? ' · locked' : ''}
                </span>
                <Button variant="secondary" onClick={() => setReviewOverlayId(selectedAliasMatch.id)}>
                  Review entry
                </Button>
                {mergeButton(selectedAliasMatch)}
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

        <EntryText label="Description" value={draft.description} editing={!editingDisabled} onChange={(description) => setDraft({ ...draft, description })} />

        {speaks(entity) &&
          TALK_FIELDS.map(({ key, label }) => (
            <EntryText
              key={key}
              label={label}
              value={draft.talk[key]}
              editing={!editingDisabled}
              onChange={(value) => setDraft({ ...draft, talk: { ...draft.talk, [key]: value } })}
            />
          ))}

        <PropertiesSection
          saved={propertiesOf(entity).rest}
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
              {relations.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    {row.incoming ? (
                      <TooltipTarget text={`${row.otherName} ${row.label} ${entity.canonical_name}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span role="img" aria-label="Incoming" className="text-[var(--text-muted)]">
                            <Icon name="incomingRelationship" />
                          </span>
                          {row.label}
                        </span>
                      </TooltipTarget>
                    ) : (
                      row.label
                    )}
                  </TableCell>
                  <TableCell>{row.otherName}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      label="Remove relationship"
                      disabled={editingDisabled || waiting(`unrelate:${row.key}`)}
                      pending={mutation.isPending(`unrelate:${row.key}`)}
                      onClick={() => void removeRelationship(row)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {relations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} style={{ color: 'var(--text-muted)' }}>
                    No related entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-3 grid items-start gap-3" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
            <TextField
              label="Relationship"
              disabled={editingDisabled}
              value={relationLabel}
              onChange={setRelationLabel}
              placeholder="Relationship, e.g. located in"
            />
            <div>
              {pickedEntity ? (
                <div
                  data-picked
                  className="flex min-h-[var(--control-height)] items-center justify-between gap-2 rounded-[var(--control-radius)] border border-[var(--line-strong)] px-3"
                >
                  <span className="truncate">{pickedEntity.canonical_name}</span>
                  <IconButton label="Choose another entry" disabled={editingDisabled} onClick={() => setRelationOtherId('')}>
                    <FontAwesomeIcon icon={faXmark} />
                  </IconButton>
                </div>
              ) : (
                <>
                  <TextField
                    label="Search entries"
                    role="combobox"
                    aria-expanded={relationMatches.length > 0}
                    aria-controls={relationMatches.length > 0 ? RELATION_MATCHES_ID : undefined}
                    aria-activedescendant={
                      relationMatches[relationActiveIndex] ? listboxOptionId(RELATION_MATCHES_ID, relationMatches[relationActiveIndex].id) : undefined
                    }
                    disabled={editingDisabled}
                    value={relationQuery}
                    onChange={(value) => {
                      setRelationQuery(value);
                      setRelationActiveIndex(0);
                    }}
                    onKeyDown={onRelationKeyDown}
                    placeholder="Search entries…"
                  />
                  {relationQuery.trim() && !editingDisabled && (
                    <div className="mt-1">
                      <Listbox
                        id={RELATION_MATCHES_ID}
                        label="Matching entries"
                        options={relationMatches.map((match) => ({
                          id: match.id,
                          label: match.canonical_name,
                          description: categoryLabel(match.category),
                          leading: <Dot color={CAT_DOT_BG[categoryCssName(match.category)]} />,
                        }))}
                        activeIndex={relationActiveIndex}
                        onPick={pickRelated}
                        empty="No entries match."
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <IconButton
              label="Add relationship"
              disabled={editingDisabled || waiting('relate')}
              pending={mutation.isPending('relate')}
              onClick={() => void addRelationship()}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
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
