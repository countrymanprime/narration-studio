import { useLayoutEffect, useState, type RefObject } from 'react'
import { clock } from '@/format/time'
import { dawLabel, editGateOf } from '@/selectors/daw'
import { isLow, summarize, type ChapterDoc } from '@/selectors/scriptedit'
import type { EditingUi } from '@/state/slices/ui'
import type { MockState } from '@/state/slices/mock'
import {
  currentPassage, fxListNow, fxPlanFor, playSelection, requestDelete, requestFx, restoreWords, skipWord, togglePlay, toggleTakes,
} from '@/state/commands/scriptedit'
import { getState, useData } from '@/state/store'
import { capsOf } from '@/selectors/daw'
import { I, L, SEP, openCtxAt, type CtxItem } from '@/ui/overlay'
import { Icon } from '@/ui/Icon'
import { Btn, IconButton, Pill } from '@/ui/primitives'

/** The chains the connected DAW lists, as a menu: its own list, never named by a screen. Each one opens the preview. */
export function fxItems(keys: string[]): CtxItem[] {
  const list = fxListNow()
  const plan = fxPlanFor(keys)
  const ok = !plan.refusal
  const daw = dawLabel(capsOf(getState().mock).daw)
  return [
    L(list.source),
    ...list.choices.map((c) => I(c.name, () => requestFx(keys, c.id), { disabled: !ok, title: plan.refusal || undefined })),
    ...(list.choices.length ? [SEP] : []),
    I('Manage in ' + daw + '…', undefined, { disabled: true }),
  ]
}

/** What the selection can do, as a menu: the same actions as the bar. */
export function openFxMenu(el: HTMLElement, keys: string[]): void {
  openCtxAt(el, fxItems(keys))
}

/**
 * The bar at the foot of the script: transport, what is selected, and what the selection can do. Add FX, Mute and Delete words and audio are
 * on the right-click menu too. A control the DAW cannot do stays, disabled, with its own reason.
 */
export function SelectionBar({ doc, ed, mock, selKeys, narrow, nowT, end }: {
  doc: ChapterDoc; ed: EditingUi; mock: MockState; selKeys: string[]; narrow: boolean; nowT: number | null; end: number
}) {
  const data = useData()
  const sum = summarize(data, doc, selKeys)
  const has = ed.sel != null && sum.items.length > 0
  const cutGate = editGateOf(mock, 'cutRange')
  const fxGate = editGateOf(mock, 'fxRange')
  const playing = nowT != null
  const cursorItem = ed.cursor ? doc.items[doc.index.get(ed.cursor) ?? -1] : undefined
  const at = nowT ?? (has ? sum.start : cursorItem?.t0 ?? 0)
  const allCut = has && sum.items.every((i) => i.cut)
  const cutWhy = !has ? '' : !cutGate.ok ? cutGate.reason : !sum.audible.length ? (allCut ? 'These words are cut already.' : 'There is no audio for these words.') : ''
  const lowN = sum.audible.filter(isLow).length
  const total = clock(end)
  return (
    <div className="sx-bar" role="toolbar" aria-label="Playback and selection">
      <div className="sx-tr">
        <IconButton icon="stepPrev" tip="Previous word (←)" id="sxprev" onClick={() => skipWord(-1)} />
        <IconButton icon={playing ? 'pause' : 'play'} tip={playing ? 'Pause (Space)' : has ? 'Play the selection (Space)' : 'Play from here (Space)'} id="sxplay" className="primary" onClick={togglePlay} />
        <IconButton icon="stepNext" tip="Next word (→)" id="sxnext" onClick={() => skipWord(1)} />
        <span className="mono sx-time" id="sxtime">{clock(at)}<span className="sub"> / {total}</span></span>
      </div>
      <div className="sx-selinfo" id="sxsel" aria-live="polite">
        {has ? (
          <>
            <b>{sum.items.length} {sum.items.length === 1 ? 'word' : 'words'}</b>
            {sum.audible.length ? <span className="mono sub">{clock(sum.start)} to {clock(sum.end)} · {sum.len.toFixed(1)} s</span> : null}
            {allCut ? <Pill kind="neutral" size="sm">Cut</Pill> : sum.allExtra ? <Pill kind="bad" size="sm">Not in the script</Pill> : <Pill kind="info" size="sm">In the script</Pill>}
            {lowN ? <Pill kind="warn" size="sm">{lowN} low confidence</Pill> : null}
          </>
        ) : <span className="sub">Click a word to place the cursor, drag or Shift+arrows to select</span>}
      </div>
      <div className="sx-acts">
        {allCut ? (
          <IconButton icon="undo" tip="Restore these words" id="sxrestore" onClick={() => restoreWords(selKeys)} />
        ) : (
          <>
            <IconButton icon="sliders" tip={'Add FX (F)' + (has && !fxGate.ok ? ' — ' + fxGate.reason : '')} id="sxfx" disabled={!has || !fxGate.ok}
              onClick={(e) => openFxMenu(e.currentTarget, selKeys)} />
            <IconButton icon="hide" tip={'Mute, keep the audio (M)' + (cutWhy ? ' — ' + cutWhy : '')} id="sxmute" disabled={!has || !!cutWhy} onClick={() => requestDelete(selKeys, true)} />
            <Btn className="sm danger" id="sxdel" title={cutWhy || 'Delete words and audio (Del)'} disabled={!has || !!cutWhy} onClick={() => requestDelete(selKeys)}>
              <Icon name="scissors" />{narrow ? ' Delete' : ' Delete words and audio'}
            </Btn>
          </>
        )}
      </div>
    </div>
  )
}

/** The dark toolbar that floats under the selection: play, effects, mute, the line's takes, delete. */
export function SelToolbar({ host, doc, ed, mock, selKeys, hidden }: {
  host: RefObject<HTMLDivElement | null>; doc: ChapterDoc; ed: EditingUi; mock: MockState; selKeys: string[]; hidden: boolean
}) {
  const data = useData()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const last = selKeys[selKeys.length - 1]
  useLayoutEffect(() => {
    const c = host.current
    const el = last && ed.sel ? c?.querySelector<HTMLElement>('[data-k="' + CSS.escape(last) + '"]') : null
    if (!c || !el) { setPos(null); return }
    const r = el.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    setPos({ x: Math.max(8, Math.min(r.right - b.left - 200, b.width - 300)), y: r.bottom - b.top + c.scrollTop + 6 })
  }, [last, ed.sel, host, data.cuts, data.wordFx])
  if (!pos || !ed.sel || hidden || ed.playT != null || ed.flag) return null
  const sum = summarize(data, doc, selKeys)
  const cutGate = editGateOf(mock, 'cutRange')
  const fxGate = editGateOf(mock, 'fxRange')
  const allCut = sum.items.every((i) => i.cut)
  const why = !cutGate.ok ? cutGate.reason : !sum.audible.length ? 'There is no audio for these words.' : ''
  const passage = currentPassage()
  return (
    <div className="seltb" style={{ left: pos.x, top: pos.y }} role="toolbar" aria-label="Selection">
      <IconButton icon="play" tip="Play the selection (Space)" disabled={!sum.audible.length} onClick={playSelection} />
      {allCut ? <IconButton icon="undo" tip="Restore these words" onClick={() => restoreWords(selKeys)} /> : (
        <>
          <IconButton icon="sliders" tip={'Add FX (F)' + (!fxGate.ok ? ' — ' + fxGate.reason : '')} disabled={!fxGate.ok || !sum.audible.length} onClick={(e) => openFxMenu(e.currentTarget, selKeys)} />
          <IconButton icon="hide" tip={'Mute, keep the audio (M)' + (why ? ' — ' + why : '')} disabled={!!why} onClick={() => requestDelete(selKeys, true)} />
        </>
      )}
      {passage ? <IconButton icon="wave" tip="Takes of this line (T)" onClick={() => toggleTakes(passage)} /> : null}
      {allCut ? null : (
        <>
          <span className="seltb-sep" />
          <button type="button" className="btn sm danger" title={why || 'Delete words and audio (Del)'} disabled={!!why} onClick={() => requestDelete(selKeys)}><Icon name="scissors" /> Delete</button>
        </>
      )}
    </div>
  )
}
