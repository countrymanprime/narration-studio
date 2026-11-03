import type { ComponentType } from 'react'
import type { Page } from '@/state/types'
import Bible from './Bible'
import Booth from './Booth'
import Delivery from './Delivery'
import Editing from './Editing'
import Master from './Master'
import Pickups from './Pickups'
import Production from './Production'
import Proof from './Proof'
import Schedule from './Schedule'
import Script from './Script'
import Settings from './Settings'

export { default as Companion } from './Companion'

export const PAGES: Record<Page, ComponentType> = {
  production: Production, schedule: Schedule, script: Script, bible: Bible, booth: Booth, editing: Editing,
  proof: Proof, pickups: Pickups, master: Master, delivery: Delivery, settings: Settings,
}
