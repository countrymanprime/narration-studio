import { useMemo } from 'react'
import type { BookData, Passage, RetryMode, Take } from '@/domain/schemas'
import { clock } from '@/format/time'
import {
  EDIT_TEXT, SOURCE_LABEL, diffWords, duplicateRead, passageScript, passageStart, shownTakes, sourceOf, takeMatch, type WordPart,
} from '@/selectors/editing'
import { confidenceLabel, suggestTake, type Suggestion, type TakeEvidence } from '@/selectors/takes'
import { capsOf, editGateOf, gateOf } from '@/selectors/daw'
import { RETRY_LABEL, RETRY_MODES, STACK_TEXT, stackableCount, baseTake, canCleanUp, canStack, canUnstack, chapterRetryMode, isStacked, retryModeOf, stackedTakes } from '@/selectors/stacking'
import type { MockState } from '@/state/slices/mock'
import type { EditingUi } from '@/state/slices/ui'
import { abPair, applyPrep, focusedTake, hideOtherTakes, keepTake, playAB, playAllTakes, playTake, setAB, splitDuplicate, toggleRevealed, undoKeep } from '@/state/commands/editing'
import { requestCleanUp, requestStack, requestUnstack, setRetryMode } from '@/state/commands/stacking'
import { daw } from '@/state/daw'
import { Btn, IconButton, Pill, Seg, Select } from '@/ui/primitives'
import { toast } from '@/ui/overlay'
import { Icon } from '@/ui/Icon'

/** Where the passage's place in time came from: the Booth wrote it when it recorded, or the audio was matched to the text afterwards. */
export function Placed({ p }: { p: Passage }) {
  const exact = p.takes.every((t) => t.via === 'map')
  return exact
    ? <Pill kind="info" title="The Booth wrote this place when it recorded">Booth</Pill>
    : <Pill kind="neutral" title="Recorded elsewhere: found by matching the audio to the text">Aligned</Pill>
}

/** What was measured on a take. */
export function Evidence({ e }: { e: TakeEvidence }) {
  const m = e.measured
  return (
    <div className="mono sub ev" data-ev={e.take.id} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12 }}>
      <span title="Share of the script's words this take read as written">Matched {e.matched}%</span>
      {m.ok ? (
        <>
          <span title="The longest pause in the take">Pause {m.value.pause.toFixed(1)} s</span>
          <span title="Average level (RMS)">{m.value.rms.toFixed(1).replace('-', '−')} dB</span>
          <span title="Noise floor">Noise {m.value.nf.toFixed(1).replace('-', '−')} dB</span>
          <span title="How clear the voice is against the noise">Clarity {m.value.clarity.toFixed(2)}</span>
        </>
      ) : <span>Not measured yet</span>}
    </div>
  )
}

/** The suggested take with its evidence, the confidence it can honestly claim, and the steps that would make it surer. The narrator decides. */
export function Suggested({ p, sug, can }: { p: Passage; sug: Suggestion; can: boolean }) {
  if (!sug.take && !sug.steps.some((s) => s.needed)) return null
  return (
    <div className="banner info" id="sugg" style={{ alignItems: 'flex-start' }}>
      <div className="stack" style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <b>{sug.take ? 'Suggested: ' + sug.take.id : 'No suggestion yet'}</b>
          <Pill kind={sug.confidence == null ? 'neutral' : sug.confidence >= 0.7 ? 'ok' : 'warn'} title={sug.confidence == null ? sug.reason : undefined}>
            <span data-conf>{sug.confidence == null ? 'Not comparable yet' : confidenceLabel(sug.confidence) + ' · ' + sug.confidence.toFixed(2)}</span>
          </Pill>
        </div>
        <span className="sub" data-why>{sug.reason}</span>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Prepare the takes">
          {sug.steps.map((st) => (
            <button key={st.id} type="button" className="chip" data-prep={st.id} aria-pressed={st.done} disabled={st.done || !can} title={st.why}
              onClick={() => applyPrep(p.id, st.id)}>
              {st.done ? <Icon name="check" /> : null} {st.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A drawing of the take's level; the same take always draws the same bars. */
export function MiniWave({ take }: { take: Take }) {
  const bars = useMemo(() => {
    const n = Math.max(10, Math.min(48, Math.round(take.len * 2.4)))
    let h = 0
    for (const ch of take.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return Array.from({ length: n }, (_, i) => {
      const r = (((h + i * 977) * 2654435761) >>> 0) % 1000 / 1000
      return 3 + (0.35 + 0.65 * Math.abs(Math.sin(i / 3 + (h % 7)))) * (0.4 + r) * 9
    })
  }, [take.id, take.len])
  return (
    <svg className="mini" viewBox={`0 0 ${bars.length * 3} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => <rect key={i} x={i * 3} y={10 - b / 2} width={2} height={b} rx={1} fill="currentColor" />)}
    </svg>
  )
}

/** What the take said against the script: said as written, left out (struck) and added (underlined). A long run left out is shortened. */
export function Diff({ parts }: { parts: WordPart[] }) {
  const out: Array<{ k: WordPart['k']; words: string[] }> = []
  parts.forEach((p) => {
    const last = out[out.length - 1]
    if (last && last.k === p.k) last.words.push(p.w)
    else out.push({ k: p.k, words: [p.w] })
  })
  /** A dash joins the next word without a space. */
  const join = (w: string[]): string => w.reduce((a, x) => (a ? a + (a.endsWith('—') ? '' : ' ') + x : x), '')
  let prev = ''
  return (
    <div className="quote diff">
      {out.map((g, i) => {
        const full = join(g.words)
        const text = g.k === 'del' && g.words.length > 5 ? g.words.slice(0, 2).join(' ') + ' … (' + g.words.length + ' words)' : full
        const sp = i && !prev.endsWith('—') ? ' ' : ''
        prev = full
        return g.k === 'del' ? <span key={i}>{sp}<del title={full}>{text}</del></span> : g.k === 'ins' ? <span key={i}>{sp}<ins>{text}</ins></span> : <span key={i}>{sp}{text}</span>
      })}
    </div>
  )
}

/** The ways a passage can keep its retries: with its chapter, or its own. */
function passageModes(data: BookData, p: Passage): Array<{ value: string; label: string }> {
  return [
    { value: 'inherit', label: 'Chapter · ' + (chapterRetryMode(data, p.chapterId) === 'stack' ? 'Stack' : 'Leave') },
    { value: 'stack', label: RETRY_LABEL.stack },
    { value: 'leave', label: RETRY_LABEL.leave },
  ]
}

/** How the chapter's retries are kept, how many could be stacked, and the one action that stacks them all (behind a question). */
export function RetryBar({ data, chapterId, setup }: { data: BookData; chapterId: string; setup: MockState['setup'] }) {
  const mode = chapterRetryMode(data, chapterId)
  const n = stackableCount(data, chapterId)
  const gate = editGateOf({ setup }, 'stackTakes')
  return (
    <div className="row retrybar" style={{ gap: 8 }}>
      <span className="label">{STACK_TEXT.howKept}</span>
      <Seg label="How retries are kept in this chapter" value={mode} onChange={(m) => setRetryMode({ chapter: chapterId }, m)}
        options={RETRY_MODES.map(([k, l]) => [k, <span key={k} title={RETRY_LABEL[k]}>{l}</span>])} />
      <span className="spacer" />
      {mode === 'stack' && n > 0 ? <Pill kind="violet" title="Later reads that can go on the first read’s spot"><span id="stackcount">{n} {n === 1 ? 'retry' : 'retries'} can be stacked</span></Pill> : null}
      {mode === 'stack' ? (
        <IconButton icon="stack" id="stackall" tip={STACK_TEXT.action + (gate.ok ? '' : ' (' + gate.reason + ')')} disabled={!gate.ok || n === 0} onClick={() => requestStack(chapterId)} />
      ) : null}
    </div>
  )
}

/** The chip under a line that has more than one take: how many, which is active, and whether it is chosen. It opens the takes in place. */
export function TakesChip({ data, p, open, onToggle }: { data: BookData; p: Passage; open: boolean; onToggle: () => void }) {
  const dup = duplicateRead(data, p)
  const a = p.takes.find((t) => t.active)
  const stacked = isStacked(p)
  return (
    <button type="button" className={'tchip' + (open ? ' open' : '')} aria-expanded={open} data-tchip={p.id} onClick={onToggle}>
      <Icon name="wave" />
      <b>{p.takes.length} {p.takes.length === 1 ? 'take' : 'takes'}</b>
      <span className="tpips" aria-hidden="true">{p.takes.map((t) => <i key={t.id} className={t.active ? 'on' : ''} />)}</span>
      {a ? <span className="mono">{a.id}</span> : null}
      {p.kept && a ? <Pill kind="ok" size="sm">Kept</Pill> : stacked ? <Pill kind="violet" size="sm">Stacked</Pill> : dup ? <Pill kind="violet" size="sm">Duplicate read</Pill> : <Pill kind="neutral" size="sm">To choose</Pill>}
      <Icon name={open ? 'up' : 'down'} />
    </button>
  )
}

/**
 * The takes of one passage, one sub-line each, under the line: a level drawing, how much of the script the take read as written, what
 * was measured, and what it read against the script. Choose, keep, hide the others, stack and un-stack from here. The narrator decides:
 * the suggestion is shown with its evidence and never applied.
 */
export function TakesInline({ data, p, ed, setup }: { data: BookData; p: Passage; ed: EditingUi; setup: MockState['setup'] }) {
  const mock = { setup }
  const takes = editGateOf(mock, 'takes')
  const stackGate = editGateOf(mock, 'stackTakes')
  const stacked = isStacked(p)
  const mode = retryModeOf(data, p)
  const base = baseTake(p)
  const prep = editGateOf(mock, 'cleanup')
  const goto = gateOf(mock, 'goto')
  const script = passageScript(data, p)
  const sug = useMemo(() => suggestTake(data, p), [data, p])
  const dup = duplicateRead(data, p)
  const shown = ed.revealed.includes(p.id) ? p.takes : shownTakes(p)
  const hidden = p.takes.length - shownTakes(p).length
  const pool = shownTakes(p)
  const pair = pool.length > 1 ? abPair({ ...p, takes: pool }, ed.abA, ed.abB, sug.take ?? undefined) : null
  const down = !capsOf(mock).reachable
  const others = p.takes.filter((t) => !t.active && !t.hidden).length
  const opts = pool.map((t) => ({ value: t.id, label: t.id }))
  const onTake = focusedTake(p, ed)?.id
  const playing = ed.playing
  return (
    <div className="sx-stack" data-takes={p.id} role="group" aria-label={'Takes of this passage, ' + p.takes.length}>
      <div className="row sx-tools" style={{ flexWrap: 'nowrap' }}>
        <span className="label" style={{ flex: 'none' }}>{STACK_TEXT.howKept}</span>
        <Select id={'retrymode-' + p.id} aria-label="How retries of this passage are kept" value={p.retryMode ?? 'inherit'} options={passageModes(data, p)}
          style={{ width: 180, flex: 'none' }} onValueChange={(v) => setRetryMode({ passage: p.id }, v === 'inherit' ? null : (v as RetryMode))} />
        <span className="spacer" />
        <Placed p={p} />
        {dup ? <IconButton icon="scissors" tip="Split into takes" id="tsplit" disabled={!takes.ok} onClick={() => splitDuplicate(p.id)} /> : null}
        {canStack(p) && mode === 'stack' ? <IconButton icon="stack" id="tstack" tip={STACK_TEXT.action + (stackGate.ok ? '' : ' (' + stackGate.reason + ')')} disabled={!stackGate.ok} onClick={() => requestStack(p.chapterId, [p.id])} /> : null}
        {canUnstack(p) ? <IconButton icon="unstack" id="tunstack" tip={STACK_TEXT.unstack + (stackGate.ok ? '' : ' (' + stackGate.reason + ')')} disabled={!stackGate.ok} onClick={() => requestUnstack(p.id)} /> : null}
        <IconButton icon="play" tip="Play every take in order" id="tall" tipSide="r" onClick={() => playAllTakes(p.id)} />
      </div>
      {dup ? <div className="sub" id="dupnote">This take reads the line twice. The second read starts at {clock(dup.at)}.</div> : null}
      {takes.ok || down ? null : <div className="sub" id="takesnote">{takes.reason}</div>}
      {p.kept || !dup ? <Suggested p={p} sug={sug} can={prep.ok} /> : null}
      {prep.ok || down || takes.reason === prep.reason ? null : <div className="sub" id="prepnote">{prep.reason}</div>}
      {canCleanUp(data, p) ? <div className="row"><Btn id="tclean" onClick={() => requestCleanUp(p.id)}>{STACK_TEXT.cleanup}</Btn></div> : null}
      <div className="il">
        {shown.map((t) => {
          const m = takeMatch(script, t.text)
          const kept = !!p.kept && t.active
          const ev = sug.evidence.find((x) => x.take.id === t.id)
          return (
            <div key={t.id} className={'il-row takerow lane' + (kept ? ' kept' : '') + (p.kept && !t.active || t.hidden ? ' muted' : '') + (t.id === onTake ? ' onkey' : '')} data-take={t.id} aria-current={t.id === onTake ? 'true' : undefined}>
              <div className="lane-h">
                <span className="mono tid">{t.id}</span>
                {kept ? <Pill kind="ok">Kept</Pill> : t.active ? <Pill kind="info">Active</Pill> : <Pill kind="neutral">{t.hidden ? 'Hidden' : 'Muted'}</Pill>}
                {stacked && t.id === base.id ? <Pill kind="neutral">First read</Pill> : null}
                {sug.take?.id === t.id ? <Pill kind="violet" title="The take the measurements favour. You decide.">Suggested</Pill> : null}
                <span className="il-wave" style={{ flexBasis: Math.round(t.len * 16) + 'px' }}><MiniWave take={t} /></span>
                <span className="spacer" />
                <span className="mono sub" title="Share of the script's words this take read as written">{m.pct}%</span>
                {canUnstack(p) && stackedTakes(p).some((x) => x.id === t.id) ? <IconButton icon="unstack" tip={'Un-stack ' + t.id} data-tunstack={t.id} disabled={!stackGate.ok} onClick={() => requestUnstack(p.id, [t.id])} /> : null}
                <IconButton icon={playing === t.id ? 'stop' : 'play'} tip={(playing === t.id ? 'Stop ' : 'Play ') + t.id} data-tplay={t.id} onClick={() => playTake(p.id, t.id)} />
                {kept || (dup && !p.kept) ? null : <IconButton icon="doneOff" tip={'Keep ' + t.id} data-tkeep={t.id} disabled={!takes.ok} onClick={() => keepTake(p.id, t.id)} />}
              </div>
              <div className="mono sub">{clock(t.start)} · {Math.round(t.len)} s · {SOURCE_LABEL[sourceOf(t, setup)]}</div>
              {ev ? <Evidence e={ev} /> : null}
              <div className="il-diff"><Diff parts={diffWords(script, t.text)} /></div>
            </div>
          )
        })}
      </div>
      {pair ? (
        <div className="row" style={{ flexWrap: 'nowrap' }} role="group" aria-label="Compare two takes">
          <Select id="abA" aria-label="First take to compare" value={pair[0].id} onValueChange={(v) => setAB('abA', v)} options={opts} />
          <Select id="abB" aria-label="Second take to compare" value={pair[1].id} onValueChange={(v) => setAB('abB', v)} options={opts} />
          <Btn id="abplay" title={'Play ' + pair[0].id + ', then ' + pair[1].id} onClick={() => playAB(p.id)}>A/B</Btn>
        </div>
      ) : null}
      <div className="row">
        <IconButton icon="external" tip={'Show in ' + goto.label} id="reaper" disabled={!goto.ok} onClick={() => toast(daw().gotoTime(p.chapterId, passageStart(p)).message)} />
        {p.kept ? <IconButton icon="undo" tip="Undo choice" id="tundo" onClick={() => undoKeep(p.id)} /> : null}
        {hidden ? <IconButton icon={ed.revealed.includes(p.id) ? 'hide' : 'show'} tip={(ed.revealed.includes(p.id) ? 'Put away ' : 'Look at ') + hidden + ' hidden ' + (hidden > 1 ? 'takes' : 'take')} id="treveal" onClick={() => toggleRevealed(p.id)} /> : null}
        <span className="spacer" />
        <IconButton icon="hide" id="thide" tipSide="r" disabled={!takes.ok || !p.kept || !others}
          tip={p.kept ? 'Hide the other ' + others + (others > 1 ? ' takes' : ' take') : 'Hide the other takes (' + EDIT_TEXT.keepFirst + ')'} onClick={() => hideOtherTakes(p.id)} />
      </div>
    </div>
  )
}
