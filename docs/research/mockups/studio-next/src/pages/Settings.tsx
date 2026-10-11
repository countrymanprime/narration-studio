import { useEffect, useState, type ReactNode } from 'react'
import { SHORTCUTS } from '@/app/help'
import { modals } from '@/app/modals'
import { num } from '@/format/time'
import { calc } from '@/selectors/progress'
import { platformProfiles } from '@/selectors/platform'
import { fontCss } from '@/selectors/reader'
import { setDeliveryProfile } from '@/state/commands/schedule'
import { setPrefs } from '@/state/commands/prefs'
import { addType, removeType, renameType, setRecording, setTypeColour, setTypeSpeaks, toggleLocalDictionary, TYPE_COLOURS } from '@/state/commands/settings'
import { useData, useMock, useStudio } from '@/state/store'
import type { DictSource, ThemeChoice } from '@/state/slices/ui'
import { AnalysisTools } from './settings/AnalysisTools'
import { TextSettings } from '@/ui/TextSettings'
import { Btn, Checkbox, IconButton, Swatch, Input, Select } from '@/ui/primitives'
import { Radio, RadioGroup } from '@/ui/primitives/RadioGroup'

function TypeRow({ index }: { index: number }) {
  const data = useData()
  const t = data.bibleTypes[index]
  const [v, setV] = useState(t.k)
  useEffect(() => setV(t.k), [t.k])
  const n = data.bible.filter((e) => e.kind === t.k).length
  const commit = (): void => { if (v !== t.k && !renameType(index, v)) setV(t.k) }
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <Swatch colour={t.c} />
      <Input type="text" data-sbtn={index} value={v} aria-label="Type name" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />
      <Select data-sbtc={index} aria-label={'Colour for ' + t.k} style={{ width: 130 }} value={t.c} onValueChange={(v) => setTypeColour(index, v as typeof t.c)}
        options={TYPE_COLOURS.map(([c, l]) => ({ value: c, label: l }))} />
      <span data-tip="Entries of this type can be picked as the speaker of a quoted line" className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        <Checkbox data-sbts={index} checked={!!t.speaker} aria-label={'Can speak: ' + t.k} onCheckedChange={(c) => setTypeSpeaks(index, c)} />
        <span className="sub">Can speak</span>
      </span>
      <span className="sub" style={{ minWidth: 70 }}>{n} {n === 1 ? 'entry' : 'entries'}</span>
      <IconButton icon="trash" tip="Remove" className="quiet danger" data-sbtx={index} disabled={n > 0 || data.bibleTypes.length < 2} onClick={() => removeType(index)} />
    </div>
  )
}

function BibleTypes() {
  const data = useData()
  const [name, setName] = useState('')
  const add = (): void => { if (addType(name)) setName('') }
  return (
    <section className="panel"><div className="ph"><h2>Story Bible types</h2></div>
      <div className="pb stack" style={{ overflow: 'visible' }}>
        {data.bibleTypes.map((t, i) => <TypeRow key={i} index={i} />)}
        <div className="row">
          <Input type="text" id="sbtnew" placeholder="New type" aria-label="New type" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} />
          <IconButton icon="plus" tip="Add type" id="sbtadd" onClick={add} />
        </div>
      </div>
    </section>
  )
}

export default function SettingsPage() {
  const mock = useMock()
  const data = useData()
  const p = useStudio((s) => s.ui.prefs)
  const installed = mock.dictLocal === 'installed'
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="phead"><h1>Settings</h1></div>
      <section className="panel"><div className="ph"><h2>Recording</h2></div>
        <div className="pb stack" style={{ overflow: 'visible' }}>
          <RadioGroup name="rec" aria-label="Recording" value={mock.setup === 'builtin' ? 'builtin' : mock.setup === 'audacity' ? 'audacity' : 'reaper'} onValueChange={setRecording}>
            <Radio value="reaper" label="REAPER. Recordings live in the DAW." />
            <Radio value="audacity" label="Audacity. Recordings live in the DAW." />
            <Radio value="builtin" label="Built-in recorder. Recordings live in the app." />
          </RadioGroup>
        </div>
      </section>
      <section className="panel"><div className="ph"><h2>Delivery profile</h2></div>
        <div className="pb stack" style={{ overflow: 'visible' }}>
          <Select id="delivery-profile" aria-label="Delivery profile" style={{ maxWidth: 260 }} value={data.deliveryProfile} onValueChange={setDeliveryProfile}
            options={platformProfiles().map((p) => ({ value: p.id, label: p.label }))} />
        </div>
      </section>
      <section className="panel"><div className="ph"><h2>Definitions and pronunciations</h2></div>
        <div className="pb stack" style={{ overflow: 'visible' }}>
          <span className="label">Show definitions from</span>
          <RadioGroup<DictSource> name="dsrc" aria-label="Show definitions from" value={p.dictSource} onValueChange={(v) => setPrefs({ dictSource: v })}>
          <Radio value="web" label="Web page. Opens the dictionary site." />
          <Radio value="local" label="Local dictionary. Shows definitions and pronunciations inline."
            extra={<><span className={'pill ' + (installed ? 'ok' : 'neutral')}>{installed ? 'Installed' : 'Not installed'}</span><IconButton icon={installed ? 'trash' : 'download'} tip={installed ? 'Remove' : 'Download'} className={installed ? 'danger' : ''} id="dictbtn" onClick={toggleLocalDictionary} /></>} />
          <Radio value="api" label="Online service. Shows definitions inline when online."
            extra={<span className={'pill ' + (mock.net === 'online' ? 'ok' : 'warn')}>{mock.net === 'online' ? 'Online' : 'Offline'}</span>} />
          </RadioGroup>
        </div>
      </section>
      <section className="panel"><div className="ph"><h2>Reader text</h2></div>
        <div className="pb stack" style={{ overflow: 'visible' }}>
          <TextSettings />
          <div className="quote" id="sprev" style={{ fontFamily: fontCss(p.readerFont), fontSize: p.readerSize, lineHeight: p.readerSpacing }}>“Off with her head!” the Queen shouted at the top of her voice. Nobody moved.</div>
        </div>
      </section>
      <section className="panel"><div className="ph"><h2>Marks</h2><span className="spacer" /><IconButton icon="pencil" tip="Edit marks…" id="editmarks" onClick={() => modals.marks()} /></div>
        <div className="pb row" style={{ overflow: 'visible' }}>
          {data.marks.map((x) => <span key={x.k} className="pill neutral"><Swatch colour={x.c} />{x.name}{x.ask ? ' · tracks a reply' : ''}</span>)}
        </div>
      </section>
      <BibleTypes />
      <AnalysisTools />
      <section className="panel"><div className="ph"><h2>Appearance</h2></div>
        <div className="pb stack" style={{ overflow: 'visible' }}>
          <RadioGroup<ThemeChoice> name="theme" aria-label="Theme" value={p.theme} onValueChange={(v) => setPrefs({ theme: v })}>
            <Radio value="system" label="Match my system" />
            <Radio value="light" label="Light" />
            <Radio value="dark" label="Dark" />
          </RadioGroup>
        </div>
      </section>
      <section className="panel"><div className="ph"><h2>Keyboard shortcuts</h2></div>
        <div className="pb" style={{ overflow: 'visible' }}><div className="sheetgrid" style={{ padding: 0 }}>{SHORTCUTS.map(([a, b]) => <div key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></div>
      </section>
      <section className="panel"><div className="ph"><h2>Manuscript</h2></div>
        <div className="pb row" style={{ overflow: 'visible', justifyContent: 'space-between' }}>
          <span className="sub">{mock.hasManuscript ? 'Imported ' + data.manuscript.imported + ' · ' + num(calc(data).W) + ' words' : 'No manuscript yet'}</span>
          {mock.hasManuscript
            ? <Btn className="quiet danger" id="repl" onClick={() => modals.importFlow('replace')}>Replace manuscript…</Btn>
            : <Btn id="imp0" onClick={() => modals.importFlow('import')}>Import manuscript</Btn>}
        </div>
      </section>
    </div>
  )
}
