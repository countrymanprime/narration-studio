# UI state, the command journal and ports

**Status: implemented.** The UI keeps a small cache of what the Go host last said (the read-model store), runs every narrator change through one in-memory command journal that undo reads, and reaches the host only through narrow ports. Test fixtures and a contract kit keep the mock and the host adapters from drifting. The decisions are The store: host reads, cached (store, ports, fixtures, no state library) and The journal and undo (the journal and its refusals). Import rules enforced by a lint or test name their ADR ([Verification and code-health tooling](../operations/verification-tooling.md)).

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Read-model store | `src/studio/ui/src/studio/store/createStudioStore.ts` | Holds one parsed copy of each cross-page read model (a slot). Never holds the book. |
| Slot registry | `src/studio/ui/src/studio/slots.ts` | Names the slots, how each loads and what makes it stale. |
| Hooks | `src/studio/ui/src/studio/store/react.tsx` | `bindStudio` produces `useStudio(selector)` over `useSyncExternalStore`; callers import `useStudio` from `studio/StudioProvider`. |
| Selectors | `src/studio/ui/src/studio/selectors/createSelector.ts` | Memoised pure functions of state. |
| Copy-on-write helpers | `src/studio/ui/src/studio/store/copyOnWrite.ts` | `getIn` and `setIn` for UI-only slices. |
| Command journal | `src/studio/ui/src/studio/journal/createJournal.ts` | `act`, `undo`, `undoLast`, `entries`, `clear`. |
| Leave guard | `src/studio/ui/src/studio/journal/leaveGuard.ts` | One page may stop a navigation and ask first (the Booth while a take records). |
| Journalled commands | `src/studio/ui/src/studio/commands/bookmarks.ts` | Add, edit and remove a bookmark, each with its inverse host command. |
| Composition root | `src/studio/ui/src/studio/StudioProvider.tsx` | Creates the one store and the one journal, starts the store, empties both on a project switch. |
| Ports | `src/studio/ui/src/ports/` | The typed seam a page uses to reach the host. |
| Fixtures | `src/studio/ui/src/fixtures/` | Plain builders and data that seed the mock. |
| Contract kit | `src/studio/ui/src/ports/providerContract.ts` | One suite run against the mock and the host adapter. |

## The store: host reads, cached

The Go host stays the source of truth. The store is a cache that can be thrown away and rebuilt at any moment: after a restart or a project switch it starts empty and loads again. The UI imports no `immer`, Redux or Zustand.

- **Slots.** A `SlotConfig` (`createStudioStore.ts`) is `{ schema, load, events?, topics?, refreshOnFocus? }`. `load` reads through a port; the store parses the result with `parseWire` ([Wire contracts: how data is checked where it crosses a boundary](wire-contracts.md)), so a wrong shape fails loudly instead of reaching a page. A slot is absent from `getState().slots` until its first successful load.
- **Registered slots.** `createSlots` in `slots.ts` registers `chapters` (stale on `job:ended`, on the in-app topic `MANUSCRIPT_CHANGED`, and on window focus) and `bookmarks` (reloaded on focus and by the bookmark commands). A new cross-page read model is a new entry there; state one component owns stays in that component.
- **What makes a slot stale.** `start()` wires host events (`createHostEvents` maps `job:ended` to `SystemApi.subscribeJobEnded`; an event with no host subscription logs a development warning and does nothing) and window focus (`focusSource.ts`). `publish(topic)` reloads every slot that lists the topic, for a change the app made that is not a job. `load(slot)` reads now and rejects on failure.
- **Failures and races.** A failed load is recorded in `getState().errors[slot]` and reported through `onError`; it never replaces a cached value. A load that was overtaken by a newer load of the same slot, or by `reset()`, writes nothing, not even its failure. `reset()` empties every slot and drops loads in flight.
- **Reading.** `useStudio(selector)` returns a slice of state or a value built with `createSelector`. In development a selector that returns a new value for the same state is reported. A selector imports types and other selectors only.
- **UI-only slices.** `setIn` returns a new object along the changed path and keeps the identity of every other branch; a value already at the path returns the root itself.

| Rule | Enforced by |
| --- | --- |
| Slot load, parse, event, topic and focus refresh, stale-answer drop, `reset` | `studio/store/createStudioStore.test.ts` |
| `useStudio` snapshot stability | `studio/store/react.test.tsx` |
| Copy-on-write identity and prototype safety | `studio/store/copyOnWrite.test.ts` |
| No `immer`, Redux, Zustand or Redux Toolkit in either `package.json` or `pnpm-lock.yaml` | `studio/store/noStateLibrary.test.ts` |
| `src/studio/` imports no component, `App.tsx` or `main.tsx` | dependency-cruiser rule `studio-does-not-import-components` |
| A selector imports only types and other selectors | dependency-cruiser rule `selectors-import-types-and-selectors-only` |
| `src/studio/`, `src/ports/`, `src/fixtures/` and `src/overlay/` never import `src/api/wailsClient` | dependency-cruiser rule `bridge-only-at-the-composition-root` |

The dependency-cruiser rules are in `src/studio/ui/.dependency-cruiser.mjs` and run as the `architecture` script of `src/studio/ui` ([Verification and code-health tooling](../operations/verification-tooling.md)).

## The journal and undo

`createJournal` (`journal/createJournal.ts`) takes `{ dawName, dawLastAction }`. It imports neither the store, the overlay nor the DAW port: the DAW's name and its last-action check are injected by `StudioProvider`.

A change is a `Command<R>`: `{ label, touches, daw?, dawAction?, run, undo?, notUndoableReason? }`.

- **`act(command)`** runs `run`. A refusal is returned unchanged and journals nothing. On success it adds one entry holding the label, the `touches` keys, the DAW flag and an inverse closure over the value `run` returned, and answers `{ id, value }` so a toast can offer Undo for exactly that entry. One narrator action is one entry, even when it calls several host commands.
- **Memory only.** The journal keeps the newest 40 entries (`JOURNAL_LIMIT`). It starts empty at launch, is not persisted, and `clear()` empties it on a project switch. A crash loses the journal and no data, because the host already wrote the change.
- **The inverse is a host command.** `undo(result)` is a closure the command passes, usually a second port call. For UI-only state it is the previous value of the changed path. Redo is not built: an undone entry leaves the journal.
- **Display.** `entries()` lists newest first, each row with `{ id, label, daw, touches, undoable, refusal }`, where `refusal` is the sentence Undo would give right now. `App.tsx` and `components/layout/HistoryPanel.tsx` read it through `components/layout/useJournalEntries`.

Undo refuses with a reason and changes nothing. The checks run in this order, and the sentence is the narrator-facing text:

| Case | Code | Sentence |
| --- | --- | --- |
| The entry is gone or its inverse is already running | `already-undone` | `Already undone.` |
| The command has no inverse | `not-undoable` | Its `notUndoableReason`, else `This change cannot be undone in the app.`, or for a DAW change `This change was made in <DAW> and the app cannot undo it. Use Edit > Undo in <DAW>.` |
| A DAW entry and any entry came after it | `daw-came-after` | `Undo '<newest later label>' first. It came after this.` |
| A DAW entry and the DAW reports another last action, or cannot tell | `daw-last-action` | `<DAW>'s last action is not this one, so it was left alone. Use Edit > Undo in <DAW>.` |
| A later entry touches an overlapping key | `same-thing` | `Undo '<newest overlapping label>' first. It changed the same thing.` |
| The inverse throws or answers a malformed result | `undo-failed` | `That change could not be undone.` |
| `undoLast()` on an empty journal | `nothing-to-undo` | `Nothing to undo` |

- **Keys.** `touches` lists read-model keys as `domain/id` (`bookmarks/12`) or a whole domain. Two keys overlap when they are equal or one is a prefix of the other on whole path segments: `bookmarks` covers `bookmarks/12`, and `bookmarks/1` does not. Entries on disjoint keys undo in either order.
- **The host may refuse an inverse.** When the inverse answers a refusal (a finding whose evidence changed, an id the host no longer has), the journal returns the host's sentence and keeps the entry.
- **Reaching the DAW.** A DAW entry is undoable only when it is the last entry and the DAW reports the change is still its last action. `StudioProvider` implements `dawLastAction` by calling `DawClient.lastAction(kind)` (`ports/daw.ts`) for the kinds in `DAW_ACTION_KINDS` (`api/contracts/daw.ts`: `cut_range`, and `record_take`, a take the Booth stopped in the DAW, journaled by `components/booth/record/takeCommand.ts`); an entry that names no kind, or one this build does not know, answers `unknown` and is refused. The journal never calls `DawClient.undoLast` itself. The mock DAW's undo history that answers `lastAction` is `fixtures/dawUndo.ts`.
- **A recreating inverse** (the inverse of a bookmark delete is a create) gives the thing a new id; `commands/bookmarks.ts` reloads the `bookmarks` slot after each command and each undo, so the page sees the new id. An earlier entry that names the old id is refused by the host.

| Rule | Enforced by |
| --- | --- |
| One entry per action, 40-entry cap, `clear`, newest-first listing, subscribers | `journal/createJournal.test.ts` (`journal.act`) |
| Same-thing refusal, whole-segment key overlap, out-of-order undo, double undo | `journal/createJournal.test.ts` (`journal.undo`) |
| DAW entry only when last and the DAW agrees; a thrown DAW check is `unknown` | `journal/createJournal.test.ts` (`DAW entries`) |
| Host refusal shown as it comes; no-inverse entries listed with a reason; recreate gets a new id | `journal/createJournal.test.ts` |
| Act then undo restores the original value; no stale inverse overwrites a newer one | `journal/createJournal.test.ts` (`undo-then-original-property`) |
| The leave guard allows by default and asks when a page set one | `journal/leaveGuard.test.ts` |
| Bookmark commands, their inverses and the slot reload | `commands/bookmarks.test.ts`, `commands/bookmarks.contract.test.ts` |
| Composition: one shared journal, DAW name in refusals, emptied on a project attach, a missing provider throws | `studio/StudioProvider.test.tsx` |

## Ports and `usePort`

A port is a narrow interface a page asks for by name, so it sees the methods of one domain and not the whole `NarrationApi` facade.

- **`src/studio/ui/src/ports/index.ts`** maps names to interfaces. `PortMap` maps a name (`system`, `manuscript`, `bookmarks`, `production`, and so on) to the per-domain interface under `api/contracts/` that `NarrationApi` composes. `ClientPortMap` holds four client ports with their own file and adapters: `daw` (`ports/daw.ts`), `measurements`, `alignment` and `takes`. `PortName` is the union of both; `PortOf<N>` is the type `usePort(N)` returns.
- **`src/studio/ui/src/ports/usePort.tsx`** is the hook. For a domain port it returns the provider's api, typed as that domain interface. For a client port it builds the client once per api (`CLIENT_BUILDERS`) over the api, or returns the one `PortOverrides` supplies (a test hands `usePort('daw')` the mock DAW client). Outside an `ApiProvider` it throws `usePort('<name>') called outside an <ApiProvider>.`
- **Adapters.** A client port file exports an interface, a host adapter built over `NarrationApi` (`createHostDawClient`, `createHostMeasurements`, `createHostAlignment`, `createHostTakes`) and a mock (`createMockTakes` and its siblings). `ports/editLog.ts` and `ports/fxchains.ts` are port files with a host adapter (`createHostEditLog`, `createHostFxChains`) and no `ClientPortMap` entry.
- **Where the bridge is wired.** Only the composition root and `src/api/` touch the host transport; a port takes the api it is given (rule `bridge-only-at-the-composition-root` above, and `src/api/` alone imports `wailsjs/` and `@wailsio/runtime`).

### The `useApi()` ratchet

`useApi()` returns the whole facade. New code declares its port with `usePort`; the files that still call `useApi()` are pinned.

`ports/useApiRatchet.test.ts` counts `useApi()` calls per source file outside `src/api/` and `src/ports/` (tests and stories excluded; comments stripped) against the `CEILING` table in the same file. A count may only fall: a file with no entry, or a count above its entry, fails; an entry above the real count fails too, so it is lowered, or deleted at zero, in the same change that moves the file to `usePort`. A second case, `series-folders-have-no-ceiling`, requires every remaining entry to have a line in `src/studio/ui/src/ratchetReasons.ts` (`KEPT`: a feature the Studio Next design did not draw and was left as built on purpose, with the decision that says so; `GAPS`: a page swap left the file behind). The rule is The store: host reads, cached ("ports are narrower than the facade"). `ports/usePort.test.tsx` covers the hook and `ports/dawPort.test.tsx` the DAW client.

## Fixtures and scenarios

`src/studio/ui/src/fixtures/` holds builders and data, never state. They are pure and deterministic (no clock, no random value), import no component, `App.tsx`, `main.tsx` or `src/studio/`, and the same builder can feed the mock and a host adapter (dependency-cruiser rules `ports-and-fixtures-are-below-components` and `fixtures-do-not-import-the-store`).

| File | What it builds | Test |
| --- | --- | --- |
| `chapters.ts` | `makeChapters` and `makeParagraphs` in one of three heading shapes (`CHAPTER_SHAPES`: `titleAndSubtitle`, `titleOnly`, `legacyNewline`) | `chapters.test.ts` |
| `scenario.ts` | `makeScenario({ shape, chapters, daw? })`: a chapter list, its paragraphs and a DAW setup (`SCENARIO_DAW_SETUPS`: `reaper`, `reaper-off`, `builtin`; default `reaper`), with a `seed` for `createMockApi({}, scenario.seed)`. `SCENARIO_SIZES` is `12` and `40`. | `scenario.test.ts` |
| `renderScenario.tsx` | `renderScenario(scenario, ui)` mounts a page in an `ApiProvider` over a mock seeded with the scenario; `renderScenarioApp(scenario, route, app)` mounts the app at a route with the theme, api and command router. Both return the api. | `scenario.test.ts` |
| `daw.ts`, `dawUndo.ts` | The mock DAW's setups, project states, answers and undo history | `daw.test.ts`, `ports/daw.contract.test.ts` |
| `speakers.ts`, `measurements.ts`, `boothStress.ts` | Speaker seeds, sample recorder and take-log data, and the Booth's worst-case seeds (`?mockBooth=`, `?mockMics=`) | `speakers.test.ts` |

A scenario widens the manuscript domain and the DAW setup only. The mock's other domains still read the Alice manuscript, so a page test that needs another domain adds that seed field to `api/mockHost/state.ts`.

`scenario.test.ts` pins four properties: the built lists parse as wire payloads (`scenario-builds-valid-wire`), the same options build the same scenario (`scenario-is-deterministic`), the seed reaches the mock (`scenario-seed-reaches-the-mock`), and `renderScenario` is imported by no non-test file (`helper-is-test-only`).

## The provider contract kit

A port with a mock and a host adapter is checked by one suite run against both, so the mock cannot be more permissive than the host: a mock that accepts what the host refuses lets a page ship a path the real app cannot take.

- **`ports/providerContract.ts`** exports `describeProviderContract(name, { mock, host }, cases, { goldens?, runner? })`. The host factory receives the goldens, so the host adapter can be built over what the real host sends. A `check` case asserts and runs on each adapter as its own test. An `observe` case returns what the port answers (or throws): the mock and the host must both accept with equal answers or both reject; accept-or-reject behaviour (an input the host refuses) belongs in one. `case.golden(file, schema)` reads a golden through `parseWire`.
- **Goldens** are the payload files the Go host or a sidecar wrote to `tests/fixtures/contracts/`, the same ones the [wire contracts](wire-contracts.md) pin.
- **One suite per port.** Each port file `ports/<port>.ts` has a sibling `ports/<port>.contract.test.ts` that calls the kit: `alignment`, `daw`, `editLog`, `fxchains`, `measurements`, `takes`. `studio/commands/bookmarks.contract.test.ts` applies it to the bookmark commands.

| Rule | Enforced by |
| --- | --- |
| The kit reports a mock that accepts what the host rejects, rejects what the host accepts, or answers differently | `ports/providerContract.test.ts` |
| Every port file in `src/ports/` (any `*.ts` except `index.ts`, the kit and tests) has a `.contract.test.ts` that imports the kit and calls `describeProviderContract` | `ports/providerContractRegistration.test.ts` (`registration-test-scans-ports`) |

The registration test also proves it fails: a port with no suite, a suite that only mentions the kit in a comment, and a suite that never calls it are all named. Adding a port file without a suite turns it red.

## Adding to this

- **A cross-page read model:** add a slot in `studio/slots.ts` with a schema from `api/schemas/`, a `load` through a port, and its events, topics and focus refresh; add a case to `createStudioStore.test.ts` if the slot has new behaviour.
- **A journalled change:** build a `Command` (see `studio/commands/bookmarks.ts`) with `touches`, and an `undo` when the host has a command that takes it back, or a `notUndoableReason` when it does not.
- **A port:** add the interface to `ports/index.ts`, the adapters in `ports/<port>.ts`, and `ports/<port>.contract.test.ts`. Move callers from `useApi()` to `usePort` and lower their entry in `useApiRatchet.test.ts`.
- **A change that crosses the wire** also follows [wire contracts](wire-contracts.md).
