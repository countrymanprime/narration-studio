/**
 * The questions asked before words are cut, or an effect goes on them. Nothing changes until the narrator says yes: the dialog shows what will
 * be cut (the words, the audio before and after, the time range, where the later audio goes), the choices, what the connected DAW does and how
 * it is undone. Cancel has the focus.
 */
import { useMemo, useState } from 'react'
import { modals } from '@/app/modals'
import { clock } from '@/format/time'
import { chName } from '@/selectors/chapters'
import { editGateOf, fillPlan, rangePlanOf } from '@/selectors/daw'
import { fmtPct } from '@/selectors/editing'
import { isLow, laterAudio, summarize, type DocItem } from '@/selectors/scriptedit'
import {
  DEFAULT_CUT, FADE_CHOICES, FX_FADE_MS, PAD_CHOICES, applyWordFx, cutRefusal, deleteWords, docNow, fxListNow, fxPlanFor, markWords, type CutOptions,
} from '@/state/commands/scriptedit'
import { daw } from '@/state/daw'
import { getState, useData, useMock } from '@/state/store'
import { openModal, toast } from '@/ui/overlay'
import { Btn, Checkbox, Radio, RadioGroup, Select, Textarea } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { Wave } from './Ribbon'

const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)
const sec = (n: number): string => n.toFixed(1) + ' s'

/** The audio around a range, before and after it, as strips. */
function Strips({ items, a, b, len, closeGap, sel }: { items: DocItem[]; a: number; b: number; len: number; closeGap: boolean; sel: string[] }) {
  const after = useMemo(
    () => items.filter((i) => !sel.includes(i.key)).map((i) => (closeGap && (i.t0 ?? 0) >= a + len - 1e-6 ? { ...i, t0: (i.t0 ?? 0) - len, t1: (i.t1 ?? 0) - len } : i)),
    [items, sel, closeGap, a, len],
  )
  return (
    <div className="sx-before-after">
      <div><span className="label">Before</span><div className="strip"><Wave items={items} t0={a} t1={b} sel={sel} h={40} ticks={false} bars={200} /></div></div>
      <div><span className="label">After</span><div className="strip after"><Wave items={after} t0={a} t1={closeGap ? b - len : b} h={40} ticks={false} bars={200} /></div></div>
    </div>
  )
}

/** Where the words sit, as the DAW names it: its track, or the recorder's file. */
function whereText(chapterId: string, take?: string): string {
  const c = daw().capabilities()
  const track = c.daw === 'builtin' ? null : daw().tracks().find((t) => t.chapterId === chapterId)
  return (take ? 'take ' + take + ' · ' : '') + (track ? 'track “' + track.name + '”' : 'the recorder’s file')
}

export function CutDialog({ ask, close }: { ask: { keys: string[]; mute?: boolean }; close: () => void }) {
  const data = useData()
  const mock = useMock()
  const mute = !!ask.mute
  const [mode, setMode] = useState<CutOptions['mode']>(mute ? 'gap' : DEFAULT_CUT.mode)
  const [fade, setFade] = useState<number>(DEFAULT_CUT.fadeMs)
  const [pad, setPad] = useState<number>(DEFAULT_CUT.padMs)
  const doc = docNow()
  const sum = useMemo(() => summarize(data, doc, ask.keys, pad), [data, doc, ask.keys, pad])
  const plan = rangePlanOf(mock)
  const why = cutRefusal(sum)
  const r = sum.ranges[0]
  const n = sum.audible.length
  const para = r ? doc.items.filter((i) => i.pid === r.pid) : []
  const w = data.editor.backupWindow
  const from = r ? clock(Math.max(0, r.start - w)) : ''
  const to = r ? clock(r.end + w) : ''
  const later = r && mode === 'close' ? laterAudio(doc, sum.ranges[sum.ranges.length - 1]) : null
  const vars = { n, from, to }
  const title = mute ? 'Mute ' + plural(n, 'word', 'words') + ' and keep their audio?' : 'Delete ' + plural(n, 'word', 'words') + ' and their audio?'
  const go = (): void => { close(); deleteWords(ask.keys, { mode, fadeMs: fade, padMs: pad }, mute) }
  const lowN = sum.audible.filter(isLow).length
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>{title}</h2></div>
      <div className="db sx-dlg" id="cutdlg">
        <div className="sx-cutwords">
          <span className="label">{sum.allExtra ? 'Words not in the script' : 'Words'}</span>
          <div className={sum.allExtra ? 'xw sel' : 'wordsq'} id="cutwords">{sum.words}</div>
        </div>
        {r ? <Strips items={para} a={r.start - 1.1} b={r.end + 1.1} len={r.end - r.start} closeGap={mode === 'close'} sel={r.keys} /> : null}
        <dl className="sx-facts">
          <dt>Cut range</dt><dd className="mono" id="cutrange">{r ? clock(sum.start) + ' to ' + clock(sum.end) + ' · ' + sec(sum.len) : '—'}</dd>
          <dt>In</dt><dd id="cutin">{chName(data, data.chapters.find((c) => c.id === getState().ui.chapter) ?? data.chapters[0])} · {r ? whereText(getState().ui.chapter, r.takeId) : ''}{sum.ranges.length > 1 ? ' · spans ' + sum.ranges.length + ' items' : ''}</dd>
          <dt>Later audio</dt>
          <dd id="cutlater">{mode === 'close'
            ? later ? 'moves ' + sec(sum.len) + ' earlier in this chapter (' + clock(later.before) + ' becomes ' + clock(later.after) + ')' : 'moves ' + sec(sum.len) + ' earlier in this chapter'
            : 'does not move; room tone fills ' + sec(sum.len)}</dd>
        </dl>
        {lowN ? <div className="sx-note warn" id="cutlow">Includes {plural(lowN, 'low-confidence word', 'low-confidence words')}.</div> : null}
        <div className="sx-opts">
          {mute ? null : (
            <RadioGroup aria-label="What happens to the gap" value={mode} onValueChange={(v) => setMode(v as CutOptions['mode'])}>
              <Radio value="close" label="Close the gap (later audio on this track moves up)" id="cutclose" />
              <Radio value="gap" label={'Leave ' + sec(sum.len) + ' of room tone (timing does not move)'} id="cutgap" />
            </RadioGroup>
          )}
          <div className="cutrow">
            <span className="label">Crossfade</span>
            <Select id="cutfade" aria-label="Crossfade at the join" value={String(fade)} onValueChange={(v) => setFade(+v)} style={{ width: 104 }}
              options={FADE_CHOICES.map((f) => ({ value: String(f), label: f ? f + ' ms' : 'None' }))} />
            <span className="label">Keep audio at each edge</span>
            <Select id="cutpad" aria-label="Keep audio at each edge of the cut" value={String(pad)} onValueChange={(v) => setPad(+v)} style={{ width: 104 }}
              options={PAD_CHOICES.map((f) => ({ value: String(f), label: f ? f + ' ms' : 'None' }))} />
          </div>
          {plan.backup ? <Checkbox id="cutbackup" label="Back up the track around the cut (required)" checked disabled />
            : plan.keep ? <Checkbox id="cutkeep" label={plan.keep} checked disabled /> : null}
        </div>
        <div className="sx-note" id="cutnote">{fillPlan(plan.cut, vars)} {fillPlan(plan.cutUndo, vars)}</div>
      </div>
      <div className="df">
        <Btn data-autofocus="" onClick={close}>Cancel</Btn>
        <Btn className="primary" id="cutgo" disabled={!!why} title={why || undefined} onClick={go}>{mute ? 'Mute ' + plural(n, 'word', 'words') : 'Delete ' + plural(n, 'word', 'words') + ' and audio'}</Btn>
      </div>
    </>
  )
}

export function FxDialog({ ask, close }: { ask: { keys: string[]; chainId?: string }; close: () => void }) {
  const data = useData()
  const mock = useMock()
  const list = fxListNow()
  const [chain, setChain] = useState(ask.chainId ?? list.choices[0]?.id ?? '')
  const choice = list.choices.find((c) => c.id === chain)
  const doc = docNow()
  const p = useMemo(() => fxPlanFor(ask.keys), [ask.keys, data, mock])
  const plan = rangePlanOf(mock)
  const r = p.range
  const n = p.sum.audible.length
  const w = data.editor.backupWindow
  const vars = { n, chain: choice?.name ?? '', from: r ? clock(Math.max(0, r.start - w)) : '', to: r ? clock(r.end + w) : '' }
  const para = r ? doc.items.filter((i) => i.pid === r.pid) : []
  const a = r ? r.start - 2.2 : 0
  const b = r ? r.end + 2.2 : 1
  const pa = r ? ((r.start - a) / (b - a)) * 100 : 0
  const pb = r ? ((r.end - a) / (b - a)) * 100 : 0
  const go = (): void => { close(); applyWordFx(ask.keys, chain, true) }
  const gate = editGateOf(mock, 'fxRange')
  const why = p.refusal || (!choice ? 'Choose an effect.' : '')
  const cap = p.coverage
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>Add “{choice?.name ?? '…'}” to {plural(n, 'word', 'words')}?</h2></div>
      <div className="db sx-dlg" id="fxdlg">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="label" style={{ flex: 'none' }}>{list.source}</span>
          <Select id="fxchain" aria-label="Effect" value={chain} onValueChange={setChain} options={list.choices.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        {r ? (
          <div className="sx-pieces" aria-label="The item as it will be split">
            <div className="sx-wvbox"><Wave items={para} t0={a} t1={b} sel={r.keys} h={54} ticks={false} bars={220} /></div>
            <div className="sx-split" id="fxpieces">
              <span style={{ width: pa + '%' }} className="p1">Piece 1 · unchanged</span>
              <span style={{ width: pb - pa + '%' }} className="p2">Piece 2 · {choice?.name}</span>
              <span style={{ width: 100 - pb + '%' }} className="p3">Piece 3</span>
            </div>
          </div>
        ) : null}
        <dl className="sx-facts">
          <dt>Splits at</dt><dd className="mono" id="fxsplit">{r ? clock(r.start) + ' and ' + clock(r.end) + ' · ' + sec(r.end - r.start) + ' in the middle' : '—'}</dd>
          <dt>{plan.mode === 'steps' ? 'Applies' : 'Adds'}</dt><dd>{choice?.name} · from “{list.source}”</dd>
          <dt>Joins</dt><dd>{FX_FADE_MS} ms fades at both splits, snapped to zero crossings. Nothing moves; the rest of the chapter is untouched.</dd>
        </dl>
        <div className="row"><Btn className="sm" id="fxhear" disabled={!r || !choice} onClick={() => { if (r && choice) toast(daw().compareFx(choice.name, r.start, r.end).message) }}><Icon name="play" /> A/B</Btn></div>
        {cap.over ? <div className={'banner' + (cap.far ? ' bad' : '')} id="fxwarn" role="alert"><span>This takes effect coverage from <b>{fmtPct(cap.before)}</b> to <b>{fmtPct(cap.after)}</b>, over the {fmtPct(data.editor.fxCapPct)} cap.</span></div> : null}
        {p.refusal && gate.ok ? <div className="sx-note warn" id="fxrefuse">{p.refusal}</div> : null}
        <div className="sx-note" id="fxnote">{fillPlan(plan.fx, vars)} {fillPlan(plan.fxUndo, vars)}</div>
      </div>
      <div className="df">
        <Btn data-autofocus="" onClick={close}>Cancel</Btn>
        <Btn className="primary" id="fxgo" disabled={!!why} title={why || undefined} onClick={go}>{cap.over ? 'Add anyway' : plan.fxButton}</Btn>
      </div>
    </>
  )
}

export function NoteDialog({ ask, close }: { ask: { keys: string[] }; close: () => void }) {
  const data = useData()
  const kinds = data.marks.filter((m) => !m.ask)
  const [kind, setKind] = useState(kinds[0]?.k ?? '')
  const [text, setText] = useState('')
  const save = (): void => { if (markWords(ask.keys, kind, text)) close() }
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>Add a note</h2></div>
      <div className="db stack" id="notedlg">
        <Select id="notekind" aria-label="Kind of mark" value={kind} onValueChange={setKind} options={kinds.map((m) => ({ value: m.k, label: m.name }))} />
        <Textarea id="notetext" aria-label="Note" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="df">
        <Btn onClick={close}>Cancel</Btn>
        <Btn className="primary" id="notesave" data-autofocus="" disabled={!kind} onClick={save}>Save note</Btn>
      </div>
    </>
  )
}

modals.cutWords = (ask) => { openModal({ label: ask.mute ? 'Mute words' : 'Delete words and audio', wide: true, render: ({ close }) => <CutDialog ask={ask} close={close} /> }) }
modals.wordFx = (ask) => { openModal({ label: 'Add FX', wide: true, render: ({ close }) => <FxDialog ask={ask} close={close} /> }) }
modals.wordNote = (ask) => { openModal({ label: 'Add a note', render: ({ close }) => <NoteDialog ask={ask} close={close} /> }) }
