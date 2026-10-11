import { useMemo, type KeyboardEvent } from 'react'
import type { BookData } from '@/domain/schemas'
import { clock } from '@/format/time'
import {
  CLEANUP_OPS, passagesOf, proposals, regionsOf, tabsFor, type CleanupKind, type DrawerTab,
} from '@/selectors/editing'
import { backupsOf } from '@/selectors/backups'
import { FLAG_LABEL, type ChapterDoc, type DocPara, type FlagKind } from '@/selectors/scriptedit'
import { capsOf, editGateOf, gateOf } from '@/selectors/daw'
import type { EditingUi } from '@/state/slices/ui'
import type { MockState } from '@/state/slices/mock'
import { closeDrawer, openAdd, openDrawer } from '@/state/commands/editing'
import { jumpFlag, removeWordFx, selectKeys, setFlagKind, wordFxSpan } from '@/state/commands/scriptedit'
import { IconButton, Btn } from '@/ui/primitives'
import { CleanupHeader, CleanupInspector, CleanupList } from './CleanupTab'
import { AddEffect, EffectInspector, EffectsList } from './EffectsTab'
import { BackupsInspector, BackupsList } from './BackupsTab'
import { CoverageStrip } from './Coverage'
import { TimelineStrip } from './Strip'
import { RetryBar } from './TakeParts'

const KINDS: FlagKind[] = ['extra', 'miss', 'mis', 'low']
const KIND_CLASS: Record<FlagKind, string> = { extra: 'k-extra', miss: 'k-miss', mis: 'k-mis', low: 'k-low' }
const KIND_NOUN: Record<FlagKind, [string, string]> = { extra: ['run of extra words', 'runs of extra words'], miss: ['word not read', 'words not read'], mis: ['misread word', 'misread words'], low: ['word the recogniser was unsure of', 'words the recogniser was unsure of'] }

/** The words of this chapter that differ from the script, by kind, each a list to step through, never an edit. */
function Found({ doc, ed }: { doc: ChapterDoc; ed: EditingUi }) {
  return (
    <section className="dr-s" aria-label="Found in this chapter">
      <span className="label">Found in this chapter</span>
      <ul className="dr-list" id="dr-found">
        {KINDS.map((k) => {
          const n = doc.counts[k]
          return (
            <li key={k} className={ed.flagKind === k ? 'on' : undefined} data-found={k}>
              <i className={KIND_CLASS[k]} />
              <span>{FLAG_LABEL[k][0]}<br /><span className="sub">{n} {KIND_NOUN[k][n === 1 ? 0 : 1]}</span></span>
              <Btn className="sm" disabled={!n} aria-label={'Review ' + FLAG_LABEL[k][0].toLowerCase()} onClick={() => { setFlagKind(k); jumpFlag(1, k) }}>Review</Btn>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The effects put on words, each with its chain, the words and where they sit, and a way to take it off again. */
function OnWords({ data, chapterId }: { data: BookData; chapterId: string }) {
  const list = data.wordFx.filter((f) => f.chapterId === chapterId)
  if (!list.length) return null
  return (
    <section className="dr-s" aria-label="Effects on words">
      <span className="label">On words · {list.length}</span>
      <ul className="dr-list" id="dr-wordfx">
        {list.map((f) => {
          const sp = wordFxSpan(f)
          return (
            <li key={f.id} data-wfx={f.id}>
              <i className="k-low" style={{ background: 'var(--violet-soft)', borderBottom: '2px solid var(--violet)' }} />
              <span>{f.chainName}<br /><span className="sub">“{f.text}” · {clock(sp.start)}–{clock(sp.end)}</span></span>
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                <IconButton icon="locate" tip="Select the words" data-wfx-select={f.id} onClick={() => selectKeys(f.keys)} />
                <IconButton icon="trash" className="danger" tip="Remove the effect" data-wfx-remove={f.id} tipSide="l" onClick={() => removeWordFx(f.id)} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The cleanup findings and effects lists, and the backups, in one drawer beside the script. */
export function Drawer({ doc, data, ed, mock, chapterId, dp, nowT, selKeys, stripFits }: {
  doc: ChapterDoc; data: BookData; ed: EditingUi; mock: MockState; chapterId: string; dp: DocPara | null; nowT: number | null; selKeys: string[]; stripFits: boolean
}) {
  const setup = mock.setup
  const tabs = tabsFor(setup, stripFits)
  const tab: DrawerTab = tabs.some(([k]) => k === ed.drawer) ? (ed.drawer as DrawerTab) : 'cleanup'
  const counts = useMemo(
    () => Object.fromEntries(CLEANUP_OPS.map((o) => [o.kind, proposals(data, chapterId, o.kind, ed.params[o.kind]).filter((r) => !r.done).length])) as Record<CleanupKind, number>,
    [data, chapterId, ed.params],
  )
  const rows = useMemo(() => proposals(data, chapterId, ed.op, ed.params[ed.op]), [data, chapterId, ed.op, ed.params])
  const regions = useMemo(() => regionsOf(data, chapterId), [data, chapterId])
  const region = regions.find((r) => r.id === ed.fx) ?? regions[0] ?? null
  const backups = useMemo(() => backupsOf(data, chapterId), [data, chapterId])
  const caps = capsOf(mock)
  const takeFx = gateOf(mock, 'takeFx')
  const fxEdit = editGateOf(mock, 'fx')
  const counted: Record<string, number> = { cleanup: Object.values(counts).reduce((a, n) => a + n, 0) + doc.counts.extra + doc.counts.miss + doc.counts.mis + doc.counts.low, effects: regions.length + data.wordFx.filter((f) => f.chapterId === chapterId).length, backups: backups.length, timeline: 0 }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    e.stopPropagation()
    const i = tabs.findIndex(([k]) => k === tab)
    const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
    openDrawer(tabs[n][0])
    document.querySelector<HTMLElement>('.sx-drawer [role="tab"][data-tab="' + tabs[n][0] + '"]')?.focus()
  }
  return (
    <aside className="sx-drawer" id="drawer" aria-label="Clean up and effects">
      <div className="ph"><h2>Clean up and effects</h2><span className="spacer" /><IconButton icon="x" tip="Close" id="drawerclose" tipSide="l" onClick={closeDrawer} /></div>
      <div className="tabs" role="tablist" aria-label="Drawer" onKeyDown={onKey}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" data-tab={k} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => openDrawer(k)}>{l}{k === 'timeline' ? '' : ' · ' + counted[k]}</button>
        ))}
      </div>
      <div className="dr-body" role="tabpanel">
        {tab === 'cleanup' ? (
          <>
            <Found doc={doc} ed={ed} />
            {passagesOf(data, chapterId).length ? <section className="dr-s" aria-label="Retries"><RetryBar data={data} chapterId={chapterId} setup={setup} /></section> : null}
            <section className="dr-s" aria-label="Findings in the audio">
              <span className="label">In the audio</span>
              <CleanupHeader counts={counts} op={ed.op} />
              <div className="dr-tbl cl"><CleanupList kind={ed.op} rows={rows} ed={ed} /></div>
              <CleanupInspector data={data} chapterId={chapterId} kind={ed.op} rows={rows} ed={ed} setup={setup} />
            </section>
          </>
        ) : null}
        {tab === 'effects' ? (
          <>
            <OnWords data={data} chapterId={chapterId} />
            <CoverageStrip data={data} chapterId={chapterId} setup={setup} ed={ed} />
            <section className="dr-s" aria-label="Effects on the chapter">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="label">Effects · {regions.length}</span>
                <span className="spacer" />
                <IconButton icon="plus" tip="Add an effect" id="fxnew" disabled={!fxEdit.ok} onClick={() => openAdd()} />
              </div>
              {ed.adding ? <AddEffect data={data} chapterId={chapterId} ed={ed} setup={setup} /> : null}
              {!takeFx.ok && caps.reachable ? <div className="sub" id="fxnote">{takeFx.reason}</div> : null}
              <div className="dr-tbl fx"><EffectsList data={data} regions={regions} sel={region?.id ?? null} setup={setup} /></div>
              {region ? <EffectInspector data={data} r={region} setup={setup} order={regions} /> : null}
            </section>
          </>
        ) : null}
        {tab === 'backups' ? (
          <section className="dr-s" aria-label="Backups">
            <div className="dr-tbl bk"><BackupsList data={data} list={backups} sel={ed.row} setup={setup} /></div>
            <BackupsInspector data={data} chapterId={chapterId} ed={ed} setup={setup} />
          </section>
        ) : null}
        {tab === 'timeline' ? <TimelineStrip doc={doc} dp={dp} data={data} ed={ed} nowT={nowT} selKeys={selKeys} /> : null}
      </div>
    </aside>
  )
}
