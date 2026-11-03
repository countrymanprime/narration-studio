import { useEffect, useMemo } from 'react'
import { searchManuscript } from '@/selectors/search'
import { useData, useMock, useUi } from '@/state/store'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { ensureImportPrompt } from '@/state/commands/manuscript'
import { setDrawer } from '@/state/commands/script'
import { ChapterList } from './ChapterList'
import { RailPanel } from './Rail'
import { Reader } from './Reader'
import './dialogs'
import './context'
import './keys'

/** Script: the manuscript as one continuous reader, with the chapter list on the left and lookups and marks on the right. */
export default function ScriptPage() {
  const mock = useMock()
  const data = useData()
  const ui = useUi()
  const { find, drawer } = ui.script
  const matches = useMemo(() => (find.open ? searchManuscript(data, find.q) : []), [data, find.open, find.q])
  useEffect(() => { ensureImportPrompt() }, [mock.hasManuscript])
  if (!mock.hasManuscript) return <NeedManuscript title="Script" />
  return (
    <div className={'page script fill ' + (drawer ? 'd-' + drawer : '')} id="scriptpg">
      <div className="dscrim" data-drawer="close" onClick={() => setDrawer('close')} />
      <ChapterList />
      <Reader matches={matches} />
      <RailPanel />
    </div>
  )
}
