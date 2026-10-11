import { useEffect, useRef, useState } from 'react'
import type { BookData, FxRegion } from '@/domain/schemas'
import { clock } from '@/format/time'
import {
  EDIT_TEXT, EFFECTS, SCOPE_LABEL, SCOPE_OPTIONS, chapterSeconds, chapterTakes, fmtPct, regionAvailable, regionLen, regionName, regionShare,
} from '@/selectors/editing'
import type { MockState } from '@/state/slices/mock'
import type { EditingUi } from '@/state/slices/ui'
import {
  addRegion, closeAdd, compareRegion, draftImpact, draftValid, moveFx, previewRegion, removeRegion, selectFx, setBypass, setDraft, setFxParam,
} from '@/state/commands/editing'
import { getState } from '@/state/store'
import { daw } from '@/state/daw'
import { Btn, Checkbox, FieldRow, IconButton, NumberInput, Pill, Select, Slider } from '@/ui/primitives'
import { toast } from '@/ui/overlay'
import { editGateOf, gateOf } from '@/selectors/daw'

const range = (r: FxRegion): string => (r.scope === 'track' ? 'Whole chapter' : clock(r.start) + '–' + clock(r.end))

/** The effects on this chapter, with the share of the chapter each one covers. */
export function EffectsList({ data, regions, sel, setup }: { data: BookData; regions: FxRegion[]; sel: string | null; setup: MockState['setup'] }) {
  const body = useRef<HTMLTableSectionElement>(null)
  useEffect(() => { body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [sel])
  if (!regions.length) return <div className="empty"><h3>{EDIT_TEXT.noEffects}</h3></div>
  const anchor = regions.some((r) => r.id === sel) ? sel : regions[0].id
  return (
    <table>
      <thead><tr><th>Time</th><th>Effect</th><th>Scope</th><th>Covers</th></tr></thead>
      <tbody ref={body}>
        {regions.map((r) => (
          <tr key={r.id} tabIndex={r.id === anchor ? 0 : -1} data-fxr={r.id} aria-selected={r.id === sel} className={r.bypass || !regionAvailable(setup, r) ? 'done' : undefined}
            onClick={() => selectFx(r.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') selectFx(r.id) }}>
            <td className="mono">{range(r)}</td>
            <td>
              {regionName(data, r)}
              {r.bypass ? <> <Pill kind="neutral">Bypassed</Pill></> : null}
              {!regionAvailable(setup, r) ? <> <Pill kind="neutral">{EDIT_TEXT.needsTakes}</Pill></> : null}
            </td>
            <td>{r.scope === 'track' ? <Pill kind="warn">{SCOPE_LABEL.track}</Pill> : SCOPE_LABEL[r.scope]}</td>
            <td className="mono">{fmtPct(regionShare(data, r))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Add an effect: a preset on a stretch of the chapter, one take or the whole track. Over the cap it warns first and asks again. */
export function AddEffect({ data, chapterId, ed, setup }: { data: BookData; chapterId: string; ed: EditingUi; setup: MockState['setup'] }) {
  const dr = ed.draft
  const total = chapterSeconds(data, chapterId)
  const impact = draftImpact(getState())
  const valid = draftValid(dr, total)
  const takes = chapterTakes(data, chapterId)
  const off = !editGateOf({ setup }, 'fx').ok
  const cap = data.editor.fxCapPct
  return (
    <div className="addfx stack" role="group" aria-label="Add an effect">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <FieldRow label="Preset" htmlFor="fxpreset" className="grow">
          <Select id="fxpreset" aria-label="Preset" value={dr.preset} onValueChange={(v) => setDraft({ preset: v })} options={data.fxPresets.map((p) => ({ value: p.id, label: p.name }))} />
        </FieldRow>
        <FieldRow label="Scope" htmlFor="fxscope" className="grow">
          <Select id="fxscope" aria-label="Scope" value={dr.scope} onValueChange={(v) => setDraft({ scope: v as FxRegion['scope'] })} options={SCOPE_OPTIONS(setup)} />
        </FieldRow>
      </div>
      {dr.scope === 'take' ? (
        <FieldRow label="Take" htmlFor="fxtake">
          <Select id="fxtake" aria-label="Take" value={dr.takeId ?? ''} onValueChange={(v) => setDraft({ takeId: v })} options={takes.map((t) => ({ value: t.id, label: t.id + ' · ' + clock(t.start) }))} />
        </FieldRow>
      ) : null}
      {dr.scope === 'track' ? null : (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <FieldRow label="Start (s)" htmlFor="fxstart" className="grow">
            <NumberInput id="fxstart" value={dr.start} min={0} max={total} step={0.1} disabled={dr.scope === 'take'} onValueChange={(v) => setDraft({ start: v })} />
          </FieldRow>
          <FieldRow label="End (s)" htmlFor="fxend" className="grow">
            <NumberInput id="fxend" value={dr.end} min={0} max={total} step={0.1} disabled={dr.scope === 'take'} onValueChange={(v) => setDraft({ end: v })} />
          </FieldRow>
        </div>
      )}
      <div className="sub" id="fximpact">Coverage {fmtPct(impact.before)} → <b>{fmtPct(impact.after)}</b></div>
      {impact.over ? (
        <div className={'banner' + (impact.far ? ' bad' : '')} id="fxwarn" role="alert">
          <span>This takes coverage from <b>{fmtPct(impact.before)}</b> to <b>{fmtPct(impact.after)}</b>, over the {fmtPct(cap)} cap.</span>
        </div>
      ) : null}
      <div className="row">
        <Btn id="fxcancel" onClick={closeAdd}>Cancel</Btn>
        <span className="spacer" />
        <Btn className="primary" id="fxadd" disabled={off || !valid} onClick={() => addRegion(impact.over)}>{impact.over ? 'Add anyway' : 'Add effect'}</Btn>
      </div>
    </div>
  )
}

/** One effect: its settings, bypass, preview and compare, and Remove. */
export function EffectInspector({ data, r, setup, order }: { data: BookData; r: FxRegion; setup: MockState['setup']; order: FxRegion[] }) {
  const def = EFFECTS[r.effect]
  const edit = editGateOf({ setup }, 'fx')
  const goto = gateOf({ setup }, 'goto')
  const unavailable = !regionAvailable(setup, r)
  const locked = !edit.ok || unavailable
  const [armed, setArmed] = useState(false)
  useEffect(() => setArmed(false), [r.id, r.bypass])
  const at = order.findIndex((x) => x.id === r.id)
  const share = regionShare(data, r)
  return (
    <div className="dr-insp">
      <div className="ph">
        <h2>{regionName(data, r)}</h2>
        {r.scope === 'track' ? <Pill kind="warn">{SCOPE_LABEL.track}</Pill> : <Pill kind="neutral">{SCOPE_LABEL[r.scope]}</Pill>}
        <span className="spacer" />
        <IconButton icon="up" tip="Previous effect" id="prevf" disabled={at <= 0} onClick={() => moveFx(-1)} />
        <IconButton icon="down" tip="Next effect" id="nextf" tipSide="r" disabled={at >= order.length - 1} onClick={() => moveFx(1)} />
      </div>
      <div className="pb stack">
        <div className="stack" style={{ gap: 4 }}>
          <div className="optrow"><span>Time</span><span className="mono">{range(r)}</span></div>
          {r.scope === 'track' ? null : <div className="optrow"><span>Length</span><span className="mono">{Math.round(regionLen(r) * 10) / 10} s</span></div>}
          {r.takeId ? <div className="optrow"><span>Take</span><span className="mono">{r.takeId}</span></div> : null}
          <div className="optrow"><span>Covers</span><span className="mono">{fmtPct(share)} of this chapter</span></div>
          <div className="optrow"><span>Effect</span><span>{def.name}</span></div>
        </div>
        {unavailable ? <div className="sub">{EDIT_TEXT.needsTakes}</div> : !edit.ok ? <div className="sub">{edit.reason}</div> : null}
        <span className="label">Settings</span>
        <div className="stack">
          {def.params.map((p) => (p.control === 'slider' ? (
            <Slider key={p.key} id={'fxp-' + p.key} label={p.label} valueText={r.params[p.key] + ' ' + p.unit} value={r.params[p.key] ?? 0} min={p.min} max={p.max} step={p.step}
              disabled={locked} onValueChange={(v) => setFxParam(r.id, p.key, v)} />
          ) : (
            <FieldRow key={p.key} label={p.label + ' (' + p.unit + ')'} htmlFor={'fxp-' + p.key}>
              <NumberInput id={'fxp-' + p.key} value={r.params[p.key] ?? 0} min={p.min} max={p.max} step={p.step} disabled={locked} onValueChange={(v) => setFxParam(r.id, p.key, v)} />
            </FieldRow>
          )))}
        </div>
        <Checkbox id="fxbypass" label="Bypass this effect" checked={r.bypass} disabled={locked}
          onCheckedChange={(c) => { if (!setBypass(r.id, c)) { if (!c) setArmed(true) } }} />
        {armed ? (
          <div className="banner" role="alert" id="fxon-warn">
            <span style={{ flex: 1 }}>Turning this on takes coverage over the {fmtPctCap(data)} cap.</span>
            <Btn id="fxon-no" onClick={() => setArmed(false)}>Cancel</Btn>
            <Btn className="primary" id="fxon" onClick={() => { setArmed(false); setBypass(r.id, false, true) }}>Turn on anyway</Btn>
          </div>
        ) : null}
        <div className="row">
          <IconButton icon="play" tip="Preview with 2 s before and after" id="fxprev" onClick={() => previewRegion(r.id)} />
          <Btn id="fxab" title="Compare without and with the effect" onClick={() => compareRegion(r.id)}>A/B</Btn>
          <IconButton icon="external" tip={'Show in ' + goto.label} id="reaper" disabled={!goto.ok} onClick={() => toast(daw().gotoTime(r.chapterId, r.start).message)} />
          <span className="spacer" />
          <IconButton icon="trash" className="danger" tip="Remove this effect" id="fxrm" tipSide="r" disabled={locked} onClick={() => removeRegion(r.id)} />
        </div>
      </div>
    </div>
  )
}
const fmtPctCap = (d: BookData): string => fmtPct(d.editor.fxCapPct)
