import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { providedCommands } from '../../input/commandProviders';
import { COMMAND_CATALOG, type CommandDescriptor, type CommandId } from '../../input/commands.catalog';
import type { Gesture } from '../../input/gestures';
import type { Keymap } from '../../input/keymap';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
import { commandsFor } from '../../input/surfaces';
import { overlay, type OverlayService } from '../../overlay/overlayService';
import { searchAll } from '../../registries/search';
import { Highlight } from '../primitives/Highlight';
import { Icon } from '../primitives/Icon';
import { KeyChord } from '../primitives/KeyCap';
import { Listbox, listboxOptionId, type ListboxOption } from '../primitives/Listbox';
import { TextField } from '../primitives/TextField';
import { COMMANDS_HEADING, PAGE_HEADING, hitEntries, pageEntries, pageGroupRows, pageHeading, rankEntries, type Entry, type GroupRef } from './jumpMenuModel';

// A resolved gesture's `code` is the physical key, so this reads "Slash" where the key cap should say "/".
const NAMED_CODES: Record<string, string> = { Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Slash: '/', Comma: ',', Period: '.' };
function gestureKeys(gesture: Gesture | undefined): string[] | undefined {
  if (!gesture) return undefined;
  if (gesture.source !== 'keyboard') return [gesture.code];
  const code = gesture.code.replace(/^(Key|Digit)/, '');
  return [...gesture.modifiers, NAMED_CODES[code] ?? code];
}

type JumpMenuProps = {
  /** The narrator's gestures, so a catalogue row draws the key it is really bound to. */
  keymap: Keymap;
  /** Runs a catalogue command by id; the shell routes it to the handler a page registered with `useCommand`. */
  runCommand: (id: CommandId) => void;
  close: () => void;
  initialTerm?: string;
  /** Opens with this command group already chosen (the zoom chip opens at "Zoom"); Backspace or the back row returns to the groups. */
  initialGroup?: string;
  /**
   * `page` opens the menu searching only what the page offers (Ctrl+F): its items and its search hits, no global commands. Backspace on an empty
   * field widens it to everything. With no page registered the whole menu opens.
   */
  scope?: 'page';
  /**
   * Why a catalogue command cannot run now (Back with no earlier page, Undo with nothing to undo), read once as the menu opens. Such a row stays
   * listed, off, with the reason, as a provided command does.
   */
  disabledReasons?: () => Partial<Record<CommandId, string>>;
  catalog?: readonly CommandDescriptor[];
};

/** What a result row draws as its label: the title, with the matched part marked when the source split it. */
function labelOf(entry: Entry): ReactNode {
  const { snippet } = entry;
  if (!snippet) return entry.title;
  return (
    <>
      {snippet.pre}
      <Highlight kind="Search">{snippet.hit}</Highlight>
      {snippet.post}
    </>
  );
}

const resultCount = (count: number) => (count === 0 ? 'No results' : `${count} result${count === 1 ? '' : 's'}`);

/**
 * The jump menu's content (docs/architecture/studio-shell-and-registries.md#command-providers-and-go-to): the page's own items under "On this page"
 * (`input/pageCommands.ts`), the catalogue rows for the `jumpMenu` surface, the commands providers return, then search-source hits, filtered by the
 * typed term. With nothing typed it shows one row per group, the page's first, and a group opens to its rows. A leading `>` lists commands only.
 * The field keeps focus and names the active option; nothing here waits on the host, and a page's host items join the list when they arrive.
 */
function JumpMenu({
  keymap,
  runCommand,
  close,
  initialTerm = '',
  initialGroup,
  scope: initialScope,
  disabledReasons,
  catalog = COMMAND_CATALOG,
}: JumpMenuProps) {
  const listId = useId();
  const noteId = useId();
  const [query, setQuery] = useState(initialTerm);
  const [group, setGroup] = useState<GroupRef | null>(initialGroup ? { source: 'command', name: initialGroup } : null);
  const [active, setActive] = useState(0);

  // The page, its items and the providers are asked once per open, not per keystroke.
  const page = useMemo(() => currentPageContext(), []);
  const [pageOnly, setPageOnly] = useState(initialScope === 'page' && page !== null);
  const [loaded, setLoaded] = useState<readonly PageItem[]>([]);
  useEffect(() => {
    if (!page?.load) return;
    let live = true;
    page
      .load()
      .then((rows) => live && setLoaded(rows))
      .catch((error: unknown) => console.warn('A page could not load its jump menu items; the rest are listed.', error));
    return () => {
      live = false;
    };
  }, [page]);

  const pageRows = useMemo(() => pageEntries(page, loaded), [page, loaded]);
  const commands = useMemo<Entry[]>(() => {
    const off = disabledReasons?.() ?? {};
    const replaced = new Set(page?.supersedes ?? []);
    return [
      ...commandsFor('jumpMenu', catalog).map<Entry>((row) => ({
        id: `static-${row.id}`,
        group: row.group ?? 'Commands',
        groupName: row.group ?? 'Commands',
        title: row.label,
        hint: row.hint,
        keys: gestureKeys(keymap[row.id]?.[0]),
        source: 'command',
        disabledReason: off[row.id],
        run: () => runCommand(row.id),
      })),
      ...providedCommands(catalog).map<Entry>((row) => ({
        id: `provided-${row.id}`,
        group: row.group,
        groupName: row.group,
        title: row.label,
        hint: row.hint,
        source: 'command',
        disabledReason: row.disabledReason,
        run: row.run,
      })),
    ].filter((entry) => !replaced.has(entry.groupName));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the reasons are read once per open, like the providers.
  }, [catalog, keymap, runCommand, page]);

  const raw = query.trim();
  const commandsOnly = raw.startsWith('>');
  const term = (commandsOnly ? raw.slice(1) : raw).trim().toLowerCase();

  const entries = useMemo<Entry[]>(() => {
    if (!term && !commandsOnly) {
      if (group) {
        const inGroup = (group.source === 'page' ? pageRows : commands).filter((entry) => entry.groupName === group.name);
        const heading = group.source === 'page' ? pageHeading(group.name) : group.name;
        const back: Entry = {
          id: 'back',
          group: heading,
          groupName: group.name,
          title: group.source === 'page' ? `‹ ${PAGE_HEADING}` : '‹ All commands',
          source: group.source,
          opens: 'back',
          run: () => {},
        };
        return [back, ...inGroup.map((entry) => ({ ...entry, group: heading }))];
      }
      const pageGroups = pageGroupRows(pageRows);
      if (pageOnly) return pageGroups;
      const names = [...new Set(commands.map((entry) => entry.groupName))];
      const commandGroups = names.map<Entry>((name) => ({
        id: `group-${name}`,
        group: COMMANDS_HEADING,
        groupName: name,
        title: name,
        sub: `${commands.filter((entry) => entry.groupName === name).length} ›`,
        source: 'command',
        opens: { source: 'command', name },
        run: () => {},
      }));
      return [...pageGroups, ...commandGroups];
    }
    return rankEntries({ page: pageRows, hits: hitEntries(searchAll(term)), commands, term, pageOnly, commandsOnly });
  }, [commands, commandsOnly, group, pageOnly, pageRows, term]);

  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));
  const activeEntry = entries[activeIndex];
  const activeOptionId = activeEntry ? listboxOptionId(listId, activeEntry.id) : undefined;
  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  const choose = (entry: Entry | undefined) => {
    // An off command stays listed with its reason; running it does nothing and the menu stays open.
    if (!entry || entry.disabledReason) return;
    if (entry.opens === 'back') {
      setGroup(null);
      setActive(0);
    } else if (entry.opens) {
      setGroup(entry.opens);
      setActive(0);
    } else {
      close();
      entry.run();
    }
  };

  const options = entries.map<ListboxOption>((entry) => {
    const trailing: ReactNode = entry.keys ? <KeyChord keys={entry.keys} /> : entry.sub;
    return {
      id: entry.id,
      label: labelOf(entry),
      description: entry.disabledReason ?? entry.hint,
      leading: entry.icon ? <Icon name={entry.icon} /> : undefined,
      trailing,
      group: entry.group,
      disabled: Boolean(entry.disabledReason),
    };
  });

  const searching = raw.length > 0;
  const widen = () => {
    setPageOnly(false);
    setActive(0);
  };

  return (
    <>
      <div className="border-b border-[var(--border)] p-2">
        <TextField
          label="Jump menu"
          autoFocus
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-describedby={page ? noteId : undefined}
          placeholder={pageOnly ? 'Search this page. Backspace searches everything.' : 'Search, or jump to a page or chapter. Type > for commands.'}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive(Math.min(entries.length - 1, activeIndex + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(Math.max(0, activeIndex - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(activeEntry);
            } else if (event.key === 'Backspace' && !query && group) {
              event.preventDefault();
              setGroup(null);
              setActive(0);
            } else if (event.key === 'Backspace' && !query && pageOnly) {
              event.preventDefault();
              widen();
            }
          }}
        />
        {page ? (
          <span id={noteId} className="sr-only">
            {`On the ${page.label} page. ${pageOnly ? 'Searching this page only.' : 'Type > for commands.'}`}
          </span>
        ) : null}
        <span role="status" className="sr-only">
          {searching ? resultCount(entries.length) : ''}
        </span>
      </div>
      <Listbox
        id={listId}
        label="Jump menu results"
        options={options}
        activeIndex={activeIndex}
        onPick={(id) => choose(entries.find((entry) => entry.id === id))}
        empty="Nothing matches"
        flush
      />
    </>
  );
}

export type JumpMenuOptions = Omit<JumpMenuProps, 'close'> & { service?: OverlayService };

/** Opens the jump menu in a dialog and returns the function that closes it. The first list is drawn in the same call. */
export function openJumpMenu({ service = overlay, ...props }: JumpMenuOptions): () => void {
  return service.open({
    kind: 'dialog',
    title: 'Jump menu',
    headerless: true,
    size: 'palette',
    dismissOnOutsidePress: true,
    render: ({ close }) => <JumpMenu {...props} close={close} />,
  });
}
