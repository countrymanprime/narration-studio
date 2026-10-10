import { modals } from '@/app/modals'
import type { BookData } from '@/domain/schemas'
import { clock } from '@/format/time'
import { passageScript } from '@/selectors/editing'
import { STACK_TEXT, stackPlan, unstackPlan, type StackPlan } from '@/selectors/stacking'
import { stackRetries, unstackRetries } from '@/state/commands/stacking'
import { useData, useMock } from '@/state/store'
import { openModal } from '@/ui/overlay'
import { Btn } from '@/ui/primitives'

export interface StackAsk { kind: 'stack' | 'unstack'; chapterId: string; passageIds: string[]; takeIds?: string[] }

const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)
const range = (a: number, len: number): string => clock(a) + '–' + clock(a + len)

/** How far the audio that follows moves, in a sentence. */
function shiftText(plan: StackPlan): string {
  const s = Math.abs(plan.shift)
  return s < 0.05 ? 'The audio that follows does not move.' : 'The audio that follows moves ' + s.toFixed(1) + ' s ' + (plan.shift < 0 ? 'earlier' : 'later') + '.'
}

/** What stacking (or putting back) will do, before anything moves: the passages and time ranges, how many takes, and how the DAW undoes it. */
export function StackDialog({ ask, close }: { ask: StackAsk; close: () => void }) {
  const data: BookData = useData()
  const mock = useMock()
  const stack = ask.kind === 'stack'
  const ps = ask.passageIds.map((id) => data.passages.find((p) => p.id === id)).filter((p) => !!p)
  const plan = stack ? stackPlan(data, mock, ps) : unstackPlan(data, mock, ps, ask.takeIds)
  const w = data.editor.backupWindow
  const title = stack ? STACK_TEXT.action : STACK_TEXT.unstack
  const go = (): void => {
    close()
    if (stack) stackRetries(ask.chapterId, ask.passageIds)
    else unstackRetries(ask.passageIds[0], ask.takeIds)
  }
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>{title}</h2></div>
      <div className="db stack" id="stackdlg">
        <div id="stacksum">
          {plural(plan.takes, 'take', 'takes')} in {plural(plan.groups.length, 'passage', 'passages')}{stack ? ' move onto the first read’s spot' : ' go back to where they were recorded'}. {shiftText(plan)}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {plan.groups.map((g) => (
            <div key={g.passage.id} className="stack" style={{ gap: 2 }} data-stackgroup={g.passage.id}>
              <div className="clip" title={passageScript(data, g.passage)}><b className="mono">{clock(g.before.start)}</b> {passageScript(data, g.passage)}</div>
              {g.moves.map((m) => (
                <div key={m.takeId} className="mono sub" data-stackmove={m.takeId}>{m.takeId} · {range(m.from, m.len)} → {range(m.to + g.ahead, m.len)}</div>
              ))}
            </div>
          ))}
        </div>
        <div id="stackundo">{plan.undo}</div>
        {plan.steps.length ? (
          <>
            <span className="label">{plan.gate.label} steps</span>
            <ol id="stacksteps" style={{ margin: 0, paddingLeft: 20 }}>{plan.steps.map((st) => <li key={st}>{st}</li>)}</ol>
          </>
        ) : null}
        {stack && plan.backup && plan.region ? (
          <div className="mono sub" id="stackbackup">Backup first: {clock(Math.max(0, plan.region.start - w))}–{clock(plan.region.end + w)}</div>
        ) : null}
      </div>
      <div className="df">
        <Btn onClick={close}>Cancel</Btn>
        <Btn className="primary" id="stackgo" data-autofocus="" disabled={!plan.gate.ok || !plan.groups.length} onClick={go}>{stack ? 'Stack takes' : 'Put them back'}</Btn>
      </div>
    </>
  )
}

modals.stackTakes = (ask) => { openModal({ label: ask.kind === 'stack' ? STACK_TEXT.action : STACK_TEXT.unstack, render: ({ close }) => <StackDialog ask={ask} close={close} /> }) }
