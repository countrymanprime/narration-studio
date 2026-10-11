import { modals } from '@/app/modals'
import { openModal } from '@/ui/overlay'
import { FlagsDialog } from './FlagsDialog'
import { ImportFlow } from './ImportFlow'
import { ProjectPicker } from './ProjectPicker'
import { ReportDialog } from './ReportDialog'

/** The Production page owns these dialogs: it hands their openers to the shared `modals` table. */
modals.importFlow = (mode) => {
  openModal({ label: mode === 'replace' ? 'Replace manuscript' : 'Import manuscript', wide: true, render: ({ close }) => <ImportFlow mode={mode} close={close} /> })
}
modals.flags = () => {
  openModal({ label: 'Chapters to review', render: ({ close }) => <FlagsDialog close={close} /> })
}
modals.projectPicker = () => {
  openModal({ label: 'Choose your project', full: true, render: ({ close }) => <ProjectPicker close={close} /> })
}
modals.statusReport = () => {
  openModal({ label: 'Export status report', wide: true, render: ({ close }) => <ReportDialog close={close} /> })
}
