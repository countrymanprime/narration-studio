/**
 * Editing: the chapter's script is the editor. The text is read-only; the audio is edited from it. The words are set against what was heard (extra
 * words, words not read, misreads, words the recogniser was unsure of), takes sit under the line they belong to, a slim ribbon draws the audio under
 * the line the cursor is on, and the narrator listens with the word lit as in the Booth. Select words to delete them and their audio, or to put one of
 * the DAW's own saved effects on them: both ask first, show what will change, and are one undo step. A drawer beside the script holds the clean-up
 * findings, the effects of the chapter and the backups; a timeline strip under it compares takes on one time axis.
 *
 * Logic: selectors/scriptedit.ts (the document, selection, ranges), state/commands/scriptedit.ts (selection, listening, cut, effects),
 * state/commands/editing.ts (takes, clean-up, regions), providers/alignment.ts and providers/fxchains.ts (what the recogniser heard, the DAW's chains).
 */
import { useEffect, useMemo } from 'react'
import { registerCommands, registerContext, registerKeys } from '@/app/registry'
import { tailItems } from '@/app/context'
import { STRIP_MIN_WIDTH, useLayout } from '@/app/layout'
import { modals } from '@/app/modals'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { ChapterBar, stepChapter } from '@/ui/ChapterBar'
import { KeyHints } from '@/ui/KeyHints'
import { IconButton, Pill } from '@/ui/primitives'
import { I, L, SEP, SUB, toast } from '@/ui/overlay'
import { FLAG_LABEL, flagOf, summarize, type FlagKind } from '@/selectors/scriptedit'
import { EDIT_TEXT, activeTake, dawOffNote, dawOffText, passagesOf, tabsFor } from '@/selectors/editing'
import { STACK_TEXT, canStack, canUnstack, retryModeOf, stackable } from '@/selectors/stacking'
import { requestStack, requestUnstack } from '@/state/commands/stacking'
import { capsOf, editGateOf, gateOf } from '@/selectors/daw'
import { getState, update, useData, useMock, useUi } from '@/state/store'
import { closeAdd, hideOtherTakes, keepTake, openDrawer, stopEditPlay, toggleDrawer } from '@/state/commands/editing'
import { pruneBackups } from '@/state/commands/backups'
import {
  clearSel, currentPassage, cycleTake, docNow, extendSel, focusFlag, jumpFlag, markForPickup, copyWords, moveCursor, movePhrase, playSelection, removeWordFx,
  markWords, requestDelete, requestFx, restoreWords, selectWord, selectedKeys, splitDuplicate, stopScript, toggleHideOthers, togglePlay, toggleStrip, toggleTakes,
  keepFocusedTake, fxPlanFor,
} from '@/state/commands/scriptedit'
import { go } from '@/state/commands/nav'
import { retryDaw } from '@/state/commands/production'
import { Drawer } from './editing/Drawer'
import { ScriptDoc } from './editing/ScriptDoc'
import { SelectionBar, SelToolbar, fxItems, openFxMenu } from './editing/Bar'
import { TimelineStrip } from './editing/Strip'
import './editing/StackDialog'
import './editing/RangeDialogs'
import './editing/scriptedit.css'

const KINDS: FlagKind[] = ['extra', 'miss', 'mis', 'low']
const KIND_CLASS: Record<FlagKind, string> = { extra: 'k-extra', miss: 'k-miss', mis: 'k-mis', low: 'k-low' }

export default function EditingPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const layout = useLayout()
  const ed = ui.editing
  const ch = ui.chapter
  const doc = useMemo(() => docNow(), [data, ch, mock.alignment])
  const passages = useMemo(() => passagesOf(data, ch), [data, ch])
  const selKeys = useMemo(() => (ed.sel ? doc.items.slice(Math.min(doc.index.get(ed.sel.anchor) ?? 0, doc.index.get(ed.sel.head) ?? 0), Math.max(doc.index.get(ed.sel.anchor) ?? 0, doc.index.get(ed.sel.head) ?? 0) + 1).map((i) => i.key) : []), [doc, ed.sel])
  const caps = capsOf(mock)
  const stripFits = layout.width >= STRIP_MIN_WIDTH
  const nowT = ed.playT
  const end = useMemo(() => doc.items.reduce((a, i) => (i.t1 != null && !i.cut ? Math.max(a, i.t1) : a), 0), [doc])
  const activeKey = ed.sel?.head ?? ed.cursor
  const activePid = (nowT != null ? doc.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss' && i.t0 <= nowT + 1e-6).pop() : doc.items[doc.index.get(activeKey ?? '') ?? -1])?.pid ?? null
  const activePara = doc.paras.find((p) => p.p.id === activePid) ?? null
  const tabs = tabsFor(mock.setup, stripFits)
  const drawerOpen = ed.drawer != null && tabs.some(([k]) => k === ed.drawer)

  useEffect(() => { if (mock.hasManuscript && ed.drawer === 'backups') pruneBackups() }, [ed.drawer, data.editor.backupKeepDays, mock.hasManuscript])
  useEffect(() => () => { stopEditPlay(); stopScript() }, [])
  /* A chapter change (or a replaced manuscript) can leave the cursor on a word that is not in this chapter. */
  useEffect(() => {
    const e = getState().ui.editing
    const stale = (k: string | null): boolean => !!k && !doc.index.has(k)
    if (stale(e.cursor) || stale(e.sel?.anchor ?? null) || stale(e.sel?.head ?? null)) {
      update((d) => { d.ui.editing.cursor = null; d.ui.editing.sel = null; d.ui.editing.flag = null; d.ui.editing.playT = null })
    }
  }, [doc])

  if (!mock.hasManuscript) return <NeedManuscript title="Editing" />

  const c = doc.counts
  const hasText = doc.paras.length > 0
  return (
    <div className={'page fill editing sx sx-e' + (drawerOpen && !layout.medium ? ' with-drawer' : '')}>
      <section className="panel sx-main" aria-label="Script editor">
        {!caps.reachable ? (
          <div className="banner" id="offbanner" style={{ margin: '12px 16px 0' }}>
            <b>{dawOffText(gateOf(mock, 'record').label)}</b><span>{dawOffNote(gateOf(mock, 'record').label)}</span>
            <span className="spacer" />
            <IconButton icon="refresh" tip="Retry" id="retry" onClick={retryDaw} />
          </div>
        ) : null}
        <div className="ph sx-ph">
          <h1>Editing</h1>
          <ChapterBar scopeKey={null} />
          {doc.aligned ? (
            <div className="sx-legend" role="group" id="legend" aria-label={'What is marked. Flagged by ' + doc.engine.name}>
              {KINDS.map((k) => (
                <span key={k} data-legend={k}><i className={KIND_CLASS[k]} />{layout.medium ? FLAG_LABEL[k][1] : FLAG_LABEL[k][0]}{layout.medium ? '' : ' · ' + c[k]}</span>
              ))}
              <span className="eng" title={'Flagged by ' + doc.engine.name}>Flagged by {doc.engine.name.split(' ')[0]}</span>
            </div>
          ) : <div className="sx-legend" id="legend"><span id="notaligned"><Pill kind="neutral">Not transcribed yet</Pill></span></div>}
          <div className="sx-hbtns">
            {stripFits ? <IconButton icon="wave" tip="Timeline strip (S)" id="striptoggle" aria-pressed={ed.strip} className={ed.strip ? 'on' : ''} onClick={toggleStrip} /> : null}
            <IconButton icon="sliders" tip="Clean up and effects (Ctrl+Shift+C)" id="drawertoggle" tipSide="l" aria-pressed={drawerOpen} className={drawerOpen ? 'on' : ''} onClick={() => toggleDrawer('cleanup')} />
          </div>
        </div>
        {hasText ? (
          <ScriptDoc doc={doc} data={data} ed={ed} setup={mock.setup} passages={passages} nowT={nowT} selKeys={selKeys}
            toolbar={(host) => <SelToolbar host={host} doc={doc} ed={ed} mock={mock} selKeys={selKeys} hidden={false} />} />
        ) : <div className="empty"><h3>{EDIT_TEXT.noText}</h3></div>}
        {ed.strip && stripFits ? <TimelineStrip doc={doc} dp={activePara} data={data} ed={ed} nowT={nowT} selKeys={selKeys} /> : null}
        <SelectionBar doc={doc} ed={ed} mock={mock} selKeys={selKeys} narrow={layout.medium} nowT={nowT} end={end} />
        <KeyHints hints={[
          { keys: ['Space'], label: 'Play from here' },
          { keys: ['←', '→'], label: 'Word' },
          { keys: ['Shift', '←', '→'], label: 'Select words' },
          { keys: ['Del'], label: 'Delete words and audio' },
          { keys: ['F'], label: 'Add FX' },
          { keys: ['T'], label: 'Takes' },
          { keys: ['Enter'], label: 'Keep take' },
          { keys: ['H'], label: 'Hide others' },
          { keys: ['S'], label: stripFits ? 'Timeline' : 'Timeline drawer' },
          { keys: ['Esc'], label: 'Clear' },
        ]} />
      </section>
      {drawerOpen ? <Drawer doc={doc} data={data} ed={ed} mock={mock} chapterId={ch} dp={activePara} nowT={nowT} selKeys={selKeys} stripFits={stripFits} /> : null}
    </div>
  )
}

/* ---- Right-click on words ---- */
function wordItems(keys: string[]) {
  const s = getState()
  const doc = docNow()
  const sum = summarize(s.data, doc, keys)
  const cutGate = editGateOf(s.mock, 'cutRange')
  const fx = fxPlanFor(keys)
  const allCut = sum.items.length > 0 && sum.items.every((i) => i.cut)
  const cutWhy = !cutGate.ok ? cutGate.reason : !sum.audible.length ? (allCut ? 'These words are cut already.' : 'There is no audio for these words.') : ''
  const pid = currentPassage()
  const p = pid ? s.data.passages.find((x) => x.id === pid) : undefined
  const edit = editGateOf(s.mock, 'takes')
  const hasScript = sum.items.some((i) => i.kind === 'w')
  const fxOn = sum.items.map((i) => i.fx[0]).filter((x): x is string => !!x)
  const fxId = fxOn[0]
  const fxRec = fxId ? s.data.wordFx.find((f) => f.id === fxId) : undefined
  const a = p ? activeTake(p) : undefined
  return [
    L(sum.items.length + (sum.items.length === 1 ? ' word selected' : ' words selected')),
    I('Play selection', playSelection, { k: 'Space', disabled: !sum.audible.length }),
    SEP,
    SUB('Add FX', fxItems(keys), { disabled: !!fx.refusal, title: fx.refusal || undefined }),
    I('Mute these words (keep the audio)', () => requestDelete(keys, true), { k: 'M', disabled: !!cutWhy, title: cutWhy || undefined }),
    I('Delete words and audio…', () => requestDelete(keys), { k: 'Del', disabled: !!cutWhy, title: cutWhy || undefined }),
    ...(allCut ? [I('Restore these words', () => restoreWords(keys))] : []),
    ...(fxRec ? [I('Remove ' + fxRec.chainName, () => removeWordFx(fxRec.id))] : []),
    SEP,
    SUB('Mark as', s.data.marks.map((m) => I(m.name, () => { markWords(keys, m.k) }, { sw: m.c })), { disabled: !hasScript }),
    I('Add note…', () => modals.wordNote({ keys }), { disabled: !hasScript }),
    I('Mark for pickup', () => markForPickup(keys)),
    ...(p ? [
      SEP,
      I('Show takes of this line', () => toggleTakes(p.id), { k: 'T' }),
      ...p.takes.filter((t) => !t.hidden).map((t) => I('Keep ' + t.id, () => keepTake(p.id, t.id), { checked: t.active && p.kept, disabled: !edit.ok })),
      I('Hide the other takes', () => hideOtherTakes(p.id), { k: 'H', disabled: !edit.ok || !p.kept }),
      ...(canStack(p) && retryModeOf(s.data, p) === 'stack' ? [I(STACK_TEXT.action, () => requestStack(p.chapterId, [p.id]), { disabled: !editGateOf(s.mock, 'stackTakes').ok })] : []),
      ...(canUnstack(p) ? [I(STACK_TEXT.unstack, () => requestUnstack(p.id), { disabled: !editGateOf(s.mock, 'stackTakes').ok })] : []),
      ...(p.takes.length === 1 && a ? [I('Split into takes', () => splitDuplicate(p.id), { disabled: !edit.ok })] : []),
    ] : []),
    SEP,
    I('Copy words', () => copyWords(keys)),
    ...tailItems(),
  ]
}

registerContext((t) => {
  const s = getState()
  if (s.ui.page !== 'editing') return null
  const k = (t.closest('[data-k]') as HTMLElement | null)?.dataset.k
  if (!k || !s.mock.hasManuscript) return null
  const keys = selectedKeys()
  if (!keys.includes(k)) { selectWord(k); return wordItems([k]) }
  return wordItems(keys)
})

registerCommands(() => {
  const s = getState()
  const on = s.ui.page === 'editing'
  return [
    { g: 'Editing', l: 'Editing: Script', fn: () => go('editing') },
    ...tabsFor(s.mock.setup, document.documentElement.clientWidth >= STRIP_MIN_WIDTH).filter(([k]) => k !== 'timeline').map(([k, l]) => ({ g: 'Editing', l: 'Editing: ' + l, fn: () => { openDrawer(k); go('editing') } })),
    ...(on ? [
      { g: 'Editing', l: 'Next chapter', k: 'Alt+↓', fn: () => stepChapter(1) },
      { g: 'Editing', l: 'Previous chapter', k: 'Alt+↑', fn: () => stepChapter(-1) },
      { g: 'Editing', l: 'Play from the cursor or the selection', k: 'Space', fn: togglePlay },
      { g: 'Editing', l: 'Delete the selected words and audio', k: 'Del', fn: () => requestDelete() },
      { g: 'Editing', l: 'Add FX to the selected words', k: 'F', fn: () => requestFx() },
      { g: 'Editing', l: 'Next flagged word', k: ']', fn: () => jumpFlag(1) },
      { g: 'Editing', l: 'Previous flagged word', k: '[', fn: () => jumpFlag(-1) },
      { g: 'Editing', l: 'Show or hide the timeline', k: 'S', fn: toggleStrip },
      { g: 'Editing', l: 'Keep the take the keys are on', k: 'Enter', fn: keepFocusedTake },
      { g: 'Editing', l: 'Hide or show the other takes', k: 'H', fn: toggleHideOthers },
      ...(stackable(s.data, s.ui.chapter).length ? [{ g: 'Editing', l: STACK_TEXT.action, fn: () => requestStack(s.ui.chapter) }] : []),
    ] : []),
  ]
})

/**
 * Keys while Editing is showing. Space plays from the cursor (or the selection) and pauses, and must not scroll the page. Left and right move by
 * word (Ctrl by phrase, Shift extends the selection), Delete asks to delete the selected words and audio, M to mute them, F opens the DAW's
 * effects, T and Shift+T walk the takes of the line, Enter keeps the take (or opens the card of a flagged word), H hides the other takes, [ and ]
 * step through flagged words, S shows the timeline, Escape closes the card, then clears the selection. A control that owns the key (a field, a
 * slider, a tab, a button for Space and Enter) keeps it.
 */
registerKeys('editing', (e, info) => {
  const s = getState()
  if (!s.mock.hasManuscript) return
  const ed = s.ui.editing
  if (e.key === 'Escape' && ed.adding && !info.hadPop) { closeAdd(); return true }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); toggleDrawer('cleanup'); return true }
  if (info.typing || !info.plain) {
    if (!info.typing && e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); movePhrase(e.key === 'ArrowRight' ? 1 : -1); return true }
    return
  }
  const target = e.target as HTMLElement | null
  if (target?.closest('input,textarea,select,[role="slider"],[role="tab"],[role="checkbox"],[role="radio"],[role="combobox"],[role="menuitem"],[role="option"]')) return
  const onButton = !!target?.closest('button,a,[role="button"]')
  const k = e.key.toLowerCase()
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const d = e.key === 'ArrowRight' ? 1 : -1
    if (e.shiftKey) extendSel(d)
    else moveCursor(d)
    return true
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    movePhrase(e.key === 'ArrowDown' ? 1 : -1)
    return true
  }
  if (e.key === ' ') {
    if (onButton) return
    e.preventDefault()
    togglePlay()
    return true
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    /* The drawer's lists have their own rows and buttons: Delete there is not a cut. */
    if ((onButton && e.key === 'Backspace') || target?.closest('#drawer')) return
    e.preventDefault(); requestDelete(); return true
  }
  if (e.key === 'Enter') {
    if (onButton) return
    const it = ed.cursor ? docNow().items[docNow().index.get(ed.cursor) ?? -1] : undefined
    if (it && flagOf(it)) { focusFlag(it); return true }
    keepFocusedTake()
    return true
  }
  if (k === 'm') { requestDelete(undefined, true); return true }
  if (k === 'f') {
    const keys = selectedKeys()
    if (!keys.length) { toast('Select some words first.'); return true }
    const el = document.querySelector<HTMLElement>('[data-k="' + CSS.escape(keys[keys.length - 1]) + '"]') ?? document.getElementById('main')!
    const plan = fxPlanFor(keys)
    if (plan.refusal) { toast(plan.refusal); return true }
    openFxMenu(el, keys)
    return true
  }
  if (k === 't') { cycleTake(e.shiftKey ? -1 : 1); return true }
  if (k === 'h') { toggleHideOthers(); return true }
  if (k === 's') { toggleStrip(); return true }
  if (e.key === '[' || e.key === ']') { jumpFlag(e.key === ']' ? 1 : -1); return true }
  if (e.key === 'Escape') {
    if (info.hadPop) return
    if (clearSel()) return true
    if (target && target !== document.body && target.closest('#main')) { target.blur(); return true }
  }
})

