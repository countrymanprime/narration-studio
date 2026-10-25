import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import { statusLabel, statusTone } from '../../kinds/statusTone';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  faRotate,
  faTrash,
  faWaveSquare,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { GuideEntity, GuidePreview, GuideType, TtsInstallJob } from '../../types';
import { canSpeak } from '../../storyBibleTypes';
import { categoryLabel, CREATABLE_CATEGORIES } from '../../state';
import { entryColour } from '../../kinds/entityColour';
import { kindChipColors } from '../../kinds/kindMap';
import { useApi } from '../../api/ApiContext';
import { usePort } from '../../ports/usePort';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { overlay } from '../../overlay/overlayService';
import { usePendingAction } from '../../hooks/usePendingAction';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
import { Icon } from '../primitives/Icon';
import { Dot, StatusBadge, badgeClass, badgeStyle } from '../primitives/StatusBadge';
import { Button } from '../primitives/Button';
import { Field } from '../primitives/Field';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Menu } from '../primitives/Menu';
import { Panel } from '../primitives/Panel';
import { TooltipTarget } from '../primitives/Tooltip';
import { previewKey, usePreviewAudio } from './usePreviewAudio';
import { PropertiesSection } from './PropertiesSection';
import { EntryVoiceSamples } from './voicesamples/EntryVoiceSamples';
import { VoiceReferencesSection } from './VoiceReferencesSection';
import { DialogueCueAttribution } from './DialogueCueAttribution';
import { SpeakerColourField } from './SpeakerColourField';
import { NamePronunciation } from './source/NamePronunciation';
import { nameRows } from './source/pronunciationRows';
import { usePronunciationSources } from './source/usePronunciationSources';
import { AppearsIn } from './AppearsIn';
import type { ChapterRef } from './appearsInModel';
import { addressPath } from '../../navigation/address';
import { aliasFlagged, entryFlagged, reviewFlags } from './entryList';
import { EntryText } from './EntryText';
import { ReadNotice } from './ReadNotice';
import type { SamplePlayer } from '../voicesamples/useSamplePlayer';
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
import { TextField } from '../primitives/TextField';
import { PANEL_BODY_CLASS, PANEL_ENTRY_TITLE_CLASS, PANEL_FRAME_CLASS, PANEL_HEADER_CLASS, PANEL_SUBTITLE_CLASS } from '../primitives/panelStyles';
import { Relationships, type RelationRow } from './Relationships';
import type { Notify } from '../primitives/Toast';

// What the form holds while an entry is being edited: the entry's own values, until the narrator changes them.
// The says, does and knows properties of an entry whose type can speak are fields of their own (`talk`), so `properties` holds the rest.
type Draft = { name: string; description: string; personality: string; context: string; properties: DraftProperty[]; talk: TalkDraft };
const propertiesOf = (entity: GuideEntity, speaks: boolean) => (speaks ? splitTalk(entity.properties) : { rest: entity.properties, talk: NO_TALK });
const draftOf = (entity: GuideEntity, speaks: boolean): Draft => ({
  name: entity.canonical_name,
  description: entity.description.text,
  personality: entity.personality_notes.map((note) => note.text).join(' '),
  context: entity.context || '',
  properties: draftFrom(propertiesOf(entity, speaks).rest),
  talk: propertiesOf(entity, speaks).talk,
});

const NO_TYPES: GuideType[] = [];

/** The Story Bible's types, read again whenever the entries are (a reload after a change); none until read or when the read fails,
 * so nothing speaks then, and `failed` says so for the entry to show. */
function useGuideTypes(entities: readonly GuideEntity[]): { types: GuideType[]; failed: boolean; checkAgain: () => void } {
  const storyBible = usePort('storyBible');
  const [types, setTypes] = useState<GuideType[]>(NO_TYPES);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let current = true;
    storyBible.guideTypes().then(
      (read) => {
        if (!current) return;
        setTypes(read);
        setFailed(false);
      },
      () => {
        if (!current) return;
        setTypes(NO_TYPES);
        setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [storyBible, entities, nonce]);
  return { types, failed, checkAgain: () => setNonce((n) => n + 1) };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const hasName = (entry: GuideEntity, text: string) => sameName(entry.canonical_name, text) || entry.aliases.some((alias) => sameName(alias.text, text));
/** The other entry that already has `text` as its name or one of its names, ignoring case; a draft is not an entry yet. */
const nameOwner = (entries: readonly GuideEntity[], text: string, exceptId: string) =>
  entries.find((row) => row.id !== exceptId && row.category !== 'Draft' && hasName(row, text));

/**
 * The entry's card: the panel look (panelStyles.ts) with the name as its heading, or, while the entry is edited, as a bare 26 px input in the
 * header with no label of its own (the mock's EntryEditor). Always the same elements, so turning Edit on does not rebuild the body.
 */
/** The read view's one line for the entry's empty text parts: "Not written yet: How they talk, How they act." */
function NotWritten({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <p className="m-0 text-[0.82rem] text-[var(--text-muted)]">
      Not written yet:{' '}
      {labels.map((label, index) => (
        <Fragment key={label}>
          {index > 0 && ', '}
          <span>{label}</span>
        </Fragment>
      ))}
      .
    </p>
  );
}

function EntryFrame({
  title,
  nameInput,
  leading,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  nameInput?: ReactNode;
  leading: ReactNode;
  subtitle: ReactNode;
  actions: ReactNode;
  className: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`${PANEL_FRAME_CLASS} flex flex-col overflow-hidden ${className}`}>
      <div className={PANEL_HEADER_CLASS}>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="flex items-center gap-2 self-center">{leading}</span>
          {/* The heading stays for assistive technology while the input stands in for it, so the sections below keep their level. */}
          <h2 id={titleId} className={nameInput ? 'sr-only' : PANEL_ENTRY_TITLE_CLASS}>
            {title}
          </h2>
          {nameInput}
          <div className={PANEL_SUBTITLE_CLASS}>{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      <div className={`${PANEL_BODY_CLASS} min-h-0 flex-1 overflow-y-auto`} tabIndex={0} role="group" aria-labelledby={titleId}>
        {children}
      </div>
    </section>
  );
}

/** The entry's header button that opens the Script page's Find on its name. Drawn only inside the router, which every page has. */
function FindInManuscript({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <TooltipTarget text="Find in the manuscript">
      <IconButton label="Find in the manuscript" onClick={() => navigate(addressPath({ page: 'script', find: name }))}>
        <Icon name="find" />
      </IconButton>
    </TooltipTarget>
  );
}

/** What the entry list asks the open entry to do (its right-click menu, or a Hear whose voice must be installed first). `nonce` makes the same command twice two commands. */
export type EntryCommand = { id: string; kind: 'review' | 'delete' | 'hear'; nonce: number };

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
  samplePlayer,
  toVerify = 0,
  chapters = NO_CHAPTERS,
  suggested,
  command,
  onCommandTaken,
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
  /** The page's one voice-sample player; an entry drawn alone has its own. */
  samplePlayer?: SamplePlayer;
  // How many of this entry's extraction suggestions are still to be verified; Mark reviewed waits until none are.
  toVerify?: number;
  /** The manuscript's chapters, for Appears in; the page reads them once. */
  chapters?: readonly ChapterRef[];
  /** The entry's accepted claims and the suggestions to verify (the mock's EntryEditor), built by the page that holds the suggestion list. */
  suggested?: ReactNode;
  /** A command from the entry list's right-click menu for this entry: Mark reviewed runs the button's own action, Delete opens its confirm. */
  command?: EntryCommand;
  /** The command has been taken, so the page can drop it. */
  onCommandTaken?: () => void;
}) {
  const api = useApi();
  const { types, failed: typesFailed, checkAgain: checkTypesAgain } = useGuideTypes(entities);
  const speaks = entity ? canSpeak(types, entity.category) : false;
  /** The dot beside a category: its type's colour (a Needs Review or Draft entry is amber), the same as its chip and its list swatch. */
  const dotOf = (category: string): string => `var(${entryColour(types, category).line})`;
  // The Find button navigates, so it needs the router every page has; a detail drawn outside one (a story, a unit test) has none.
  const inRouter = useInRouterContext();
  const [draft, setDraft] = useState<Draft>({ name: '', description: '', personality: '', context: '', properties: [], talk: NO_TALK });
  const [propertyError, setPropertyError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState('');
  // A name the narrator asked to add that the entry or another entry already has: the Names box says so, and for another entry's offers to merge it in.
  const [nameNote, setNameNote] = useState<{ text: string; ownerId?: string }>();
  const [nameError, setNameError] = useState<string>();
  const [confirmation, setConfirmation] = useState<'delete'>();
  const nameField = useRef<HTMLInputElement>(null);
  const [ttsPrompt, setTtsPrompt] = useState<{ preview: Extract<GuidePreview, { status: 'asset_required' }>; aliasIndex?: number }>();
  // The voice download: one install-poll hook for every asset. Success carries on with the preview the narrator asked for.
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
  // Every action that changes the Story Bible goes through this: one at a time, the control that started it says so, and the others
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
  // Done while rendering, not in an effect: an effect also runs on mount, after React may have flushed a click on Edit that came in
  // right after the entry first drew, and it would turn that edit mode off again.
  const [shownId, setShownId] = useState(entity?.id);
  if (shownId !== entity?.id) {
    setShownId(entity?.id);
    setEditing(false);
  }
  // What was half done for one entry (an offer to merge, a relationship being written) is not carried to the next.
  useEffect(() => {
    setNameNote(undefined);
  }, [entity?.id]);
  // A new entry opens with its name ready to type over (the mock's NameBox); starting another one while it is open does the same.
  // The field holds the draft's name only once the draft has been set from the entry, a render after this one, so the name is selected then.
  const selectName = useRef(false);
  useEffect(() => {
    if (!isNewDraft) return;
    nameField.current?.focus();
    selectName.current = true;
  }, [isNewDraft, entity]);
  useEffect(() => {
    if (!selectName.current || !nameField.current || nameField.current.value !== (entity?.canonical_name ?? '')) return;
    selectName.current = false;
    nameField.current.select();
  }, [isNewDraft, entity, draft.name]);
  useEffect(() => {
    setAliasQuery('');
    setNameError(undefined);
    setTtsPrompt(undefined);
    resetVoiceInstall();
    setPropertyError(undefined);
  }, [entity, resetVoiceInstall]);
  // The draft is the entry's, its talk rows split out once the types say it speaks. A change of the types alone (they arrive
  // after the entry) leaves a draft being edited as typed; a new or reloaded entry always replaces it.
  const draftEntity = useRef<GuideEntity>(undefined);
  const editingNow = useRef(editing);
  editingNow.current = editing;
  useEffect(() => {
    if (!entity || (draftEntity.current === entity && editingNow.current)) return;
    draftEntity.current = entity;
    setDraft(draftOf(entity, speaks));
  }, [entity, speaks]);

  // The entry list's menu asked this entry to do something: it does what its own button does, once per command.
  const commandRun = useRef<(kind: EntryCommand['kind']) => void>(undefined);
  const takenCommand = useRef<number>(undefined);
  useEffect(() => {
    if (!command || !entity || command.id !== entity.id || isNewDraft || takenCommand.current === command.nonce) return;
    takenCommand.current = command.nonce;
    commandRun.current?.(command.kind);
    onCommandTaken?.();
  });

  if (!entity) return <Panel>No matching entities. Build the guide to discover names and terms.</Panel>;
  const locked = entity.locked;
  // Entries open read-only: Edit reveals the form controls and Save.
  // A locked entry cannot be edited at all, and a brand-new draft is created by
  // choosing its category rather than through the edit form.
  const canEdit = !locked && !isNewDraft;
  const editingDisabled = !canEdit || !editing;
  const stopEditing = () => {
    setEditing(false);
    setPropertyError(undefined);
    setDraft(draftOf(entity, speaks));
  };
  // The properties go with a Save only when they changed, so a Save of a name alone does not rewrite them.
  const saveEntry = () => {
    const problem = propertyProblem(draft.properties, speaks);
    if (problem) {
      setPropertyError(problem);
      return;
    }
    const nameIssue = nameProblem(draft.name);
    if (nameIssue) {
      setNameError(nameIssue);
      return;
    }
    const saved = propertiesOf(entity, speaks);
    const properties = speaks ? withTalk(propertiesFrom(draft.properties), draft.talk) : propertiesFrom(draft.properties);
    const before = speaks ? withTalk(saved.rest, saved.talk) : entity.properties;
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
  // A change is written as the new relationship, then the old one removed: a failure between leaves both, never neither.
  const changeRelationship = (row: RelationRow, change: { label?: string; otherId?: string }) => {
    const label = change.label ?? row.label;
    const otherId = change.otherId ?? row.otherId;
    const holderId = row.incoming ? otherId : entity.id;
    const targetId = row.incoming ? entity.id : otherId;
    if (holderId === row.holderId && targetId === row.targetId && label === row.label) return;
    return mutation.run(`rerelate:${row.key}`, async () => {
      try {
        await api.guideRelate(holderId, targetId, label);
        await api.guideUnrelate(row.holderId, row.targetId, row.label);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
      await reloadFor(entity.id);
    });
  };
  const addRelationship = (otherId: string, label: string) =>
    mutation.run('relate', async () => {
      try {
        await api.guideRelate(entity.id, otherId, label);
        await reloadFor(entity.id);
        return true;
      } catch (error) {
        notify(describeApiError(error), 'error');
        return false;
      }
    });
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
    if (event.key === 'Enter') {
      event.preventDefault();
      addAliasFromQuery();
    }
  };

  // What the list's menu can ask of this entry, set once the handlers exist; the effect above the early return calls it.
  commandRun.current = (kind) => {
    if (kind === 'delete' && !locked) setConfirmation('delete');
    if (kind === 'review' && entryFlagged(entity) && toVerify === 0) void markReviewed();
    // The list's Hear found the voice missing: the entry's own play asks again, and shows the install prompt.
    if (kind === 'hear') void playPreview();
  };

  return (
    <EntryFrame
      title={entity.canonical_name || 'New entity'}
      nameInput={
        (canEdit && editing) || isNewDraft ? (
          <div className="min-w-0 flex-[1_1_12rem]">
            <TextField
              ref={nameField}
              label="Name"
              aria-invalid={nameError ? true : undefined}
              value={draft.name}
              onChange={(name) => {
                setNameError(undefined);
                setDraft({ ...draft, name });
              }}
              className="h-auto! border-transparent! bg-transparent! px-1! font-['Barlow_Condensed',sans-serif] text-[1.625rem]! leading-[1.2]! font-semibold hover:border-[var(--line-strong)]! focus-visible:border-[var(--accent)]!"
            />
          </div>
        ) : undefined
      }
      leading={<Dot color={dotOf(entity.category)} />}
      subtitle={
        <div className="flex items-center gap-2" style={{ position: 'relative' }}>
          <Menu
            triggerClassName={badgeClass('pill')}
            triggerStyle={badgeStyle(kindChipColors('entity', entryColour(types, entity.category)))}
            disabled={locked || !(editing || isNewDraft) || mutation.isBusy}
            items={(types.length > 0 ? types.map((type) => type.name) : CREATABLE_CATEGORIES).map((label) => ({
              key: label,
              label,
              leading: <Dot color={dotOf(label)} />,
              onSelect: () => {
                if (isNewDraft) void createNewEntity(label);
                else void save('category', { category: label }, `Category changed to ${label}.`);
              },
            }))}
          >
            {categoryLabel(entity.category)}
            {/* The mock's read-only kind is a plain pill: the chevron promises a menu only while the kind can change. */}
            {!locked && (editing || isNewDraft) && <FontAwesomeIcon icon={faChevronDown} />}
          </Menu>
          {(entryFlagged(entity) || toVerify > 0) && <StatusBadge tone={statusTone('needs_review')} label={statusLabel('needs_review')} />}
        </div>
      }
      actions={
        <>
          {(entryFlagged(entity) || toVerify > 0) &&
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
          {/* Lock/Unlock is read-view only: it can never be pressed mid-edit, so an edit is never silently discarded by a lock. */}
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
              {/* Delete only exists in edit mode: unreachable from the read view, and set off from Save/Cancel by a divider
                  so it cannot be mis-clicked beside them (B5). A locked entry never reaches edit mode, so it never has one. */}
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
      className="min-h-0 flex-1"
    >
      <div className="space-y-4">
        {locked && (
          <p className="rounded px-3 py-1.5 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <FontAwesomeIcon icon={faLock} className="mr-1.5" />
            Locked entries cannot be deleted or used as merge sources.
          </p>
        )}
        {typesFailed && (
          <ReadNotice
            what="which entries can speak"
            effect="How they talk, act and know, the speaker colour and dialogue cues are hidden for now."
            checkAgain={checkTypesAgain}
          />
        )}
        {entity.category === 'Draft' && (
          <p className="rounded px-3 py-1.5 text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
            Choose a category above to finish setting up this entry.
          </p>
        )}
        {nameError && (
          <p role="alert" className="text-xs" style={{ color: 'var(--danger-text)' }}>
            {nameError}
          </p>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.82rem] font-medium text-[var(--text-muted)]">
            <span>Names the app links in the text, and how I say each</span>
            {/* Rescan has no mock equivalent and stays as built. */}
            {!isNewDraft && (
              <TooltipTarget text="Rescan occurrences for this entry">
                <IconButton
                  label="Rescan occurrences"
                  disabled={waiting('rescan')}
                  pending={mutation.isPending('rescan')}
                  onClick={() => void rescanOccurrences()}
                >
                  <FontAwesomeIcon icon={faRotate} />
                </IconButton>
              </TooltipTarget>
            )}
          </div>
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
                    {flagged && <StatusBadge tone={statusTone('needs_review')} label={statusLabel('needs_review')} />}
                    {/* A note from before pronunciation statuses were removed: kept readable, no longer edited. */}
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
                  {canEdit && editing && (
                    <TooltipTarget text={`Record my own clip for ${name}`}>
                      <IconButton action="record" label={`Record my own clip for ${name}`} onClick={() => notify('Recording your own clip')} />
                    </TooltipTarget>
                  )}
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
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && editing && (
            <div className="mt-3">
              <TextField
                label="Add a name"
                disabled={waiting('alias')}
                value={aliasQuery}
                onChange={(value) => {
                  setAliasQuery(value);
                  setNameNote(undefined);
                }}
                onKeyDown={onAliasKeyDown}
                placeholder="Add a name"
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
            </div>
          )}
        </div>

        <EntryText label="Description" value={draft.description} editing={!editingDisabled} onChange={(description) => setDraft({ ...draft, description })} />

        {speaks &&
          TALK_FIELDS.filter(({ key }) => !editingDisabled || draft.talk[key]).map(({ key, label }) => (
            <EntryText
              key={key}
              label={label}
              value={draft.talk[key]}
              editing={!editingDisabled}
              onChange={(value) => setDraft({ ...draft, talk: { ...draft.talk, [key]: value } })}
            />
          ))}
        {/* Read view: the empty ones are one line, not a label and a dash each (R3SB1-9). */}
        {speaks && editingDisabled && <NotWritten labels={TALK_FIELDS.filter(({ key }) => !draft.talk[key]).map(({ label }) => label)} />}

        <PropertiesSection
          saved={propertiesOf(entity, speaks).rest}
          rows={draft.properties}
          editing={editing && canEdit}
          error={propertyError}
          onChange={(properties) => {
            setPropertyError(undefined);
            setDraft({ ...draft, properties });
          }}
        />

        {speaks && (
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
                <SpeakerColourField entity={entity} speaks disabled={mutation.isBusy || locked} onChange={(index) => void setSpeakerColour(index)} />
                <EntryVoiceSamples entity={entity} entities={entities} types={types} canManage={editing && canEdit} player={samplePlayer} notify={notify} />
                <VoiceReferencesSection characterId={entity.id} characterLabel={entity.canonical_name} notify={notify} />
                <DialogueCueAttribution entity={entity} entities={entities} canSpeak={(category) => canSpeak(types, category)} notify={notify} />
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
          <Relationships
            key={`${entity.id}:${canEdit && editing}`}
            entity={entity}
            entries={entities}
            types={types}
            editing={canEdit && editing}
            isPending={mutation.isPending}
            isBlocked={waiting}
            onChange={(row, change) => void changeRelationship(row, change)}
            onAdd={addRelationship}
            onRemove={(row) => void removeRelationship(row)}
          />
        </div>

        <AppearsIn entity={entity} manuscript={chapters} onGo={(chapterId) => goToManuscript(chapterId)} />
        {ttsPrompt && (
          <AssetInstallPrompt
            ask={{
              title: 'Download local preview voice?',
              body: `This local voice is needed to play “${ttsPrompt.aliasIndex === undefined ? entity.canonical_name : (entity.aliases[ttsPrompt.aliasIndex]?.text ?? 'this alias')}”. It is not bundled with the app and will be stored in your per-user asset cache.`,
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
    </EntryFrame>
  );
}
