import { Btn, IconButton } from '@/ui/primitives'
import { useData, useMock, update } from '@/state/store'
import { toast } from '@/ui/overlay'
import { useUi } from '@/state/store'

export const DICT_SOURCES = { web: 'Web page', local: 'Local dictionary', api: 'Online service' } as const

/** Definitions open the web page by default. A local dictionary or an online service can show them inline instead. */
export function DictBlock({ w, onUse }: { w: string; onUse?: (say: string) => void }) {
  const data = useData()
  const mock = useMock()
  const src = useUi().prefs.dictSource
  if (src === 'web') return null
  const label = DICT_SOURCES[src]
  if (src === 'local' && mock.dictLocal !== 'installed') {
    return (
      <div className="later" style={{ borderColor: 'var(--line-strong)', background: 'var(--raised)' }}>
        <b>{label}</b> is not installed.{' '}
        <IconButton icon="download" tip="Download" data-dl onClick={() => { update((d) => { d.mock.dictLocal = 'installed' }); toast('Local dictionary downloaded.') }} />
      </div>
    )
  }
  if (src === 'api' && mock.net === 'offline') {
    return <div className="later" style={{ borderColor: 'var(--bad)', background: 'var(--bad-soft)' }}><b>{label}</b> cannot be reached. The web links below still work.</div>
  }
  const d = data.dictionary[w.toLowerCase()]
  if (!d) return <div className="sub">{label}: no entry for “{w}”.</div>
  return (
    <div className="wordcard" style={{ background: 'var(--surface)' }}>
      <div className="sub">{label}</div>
      <div><i>{d.pos}</i> · {d.def}</div>
      <div className="mono">{d.ipa} · {d.say}</div>
      {onUse ? <div><Btn data-usepron={d.say} onClick={() => onUse(d.say)}>Use</Btn></div> : null}
    </div>
  )
}

export function ExtLinks({ w }: { w: string }) {
  const e = encodeURIComponent(w)
  return (
    <div className="row">
      <a className="btn sm" target="_blank" rel="noopener" href={'https://www.merriam-webster.com/dictionary/' + e}>Definition</a>
      <a className="btn sm" target="_blank" rel="noopener" href={'https://forvo.com/search/' + e + '/'}>Forvo</a>
      <a className="btn sm" target="_blank" rel="noopener" href={'https://youglish.com/pronounce/' + e + '/english'}>YouGlish</a>
    </div>
  )
}
