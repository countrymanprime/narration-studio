import type { ComponentType } from 'react';
import { CapabilitiesBody } from './CapabilitiesBody';
import { DefinitionsBody } from './DefinitionsBody';
import { DeliveryCustomBody, DeliveryDefaultBody, DeliveryProfileBody } from './DeliveryBodies';
import { EngineBody } from './EngineBody';
import { ChapterLayoutBody } from './ChapterLayoutBody';
import { MicBody } from './MicBody';
import { SampleOutputBody } from './SampleOutputBody';
import { MwKeyBody } from './MwKeyBody';
import { SyncActivityBody } from './SyncActivityBody';
import { SyncEnabledBody } from './SyncEnabledBody';
import { VoicesBody } from './VoicesBody';
import { TakeToneRowBody } from './TakeToneBody';

/** Bodies for Recording & DAW, Voice & pronunciation and Delivery rows, by registry row id. */
export const RECORDING_CONTROLS: Record<string, ComponentType> = {
  'daw.engine': EngineBody,
  'daw.mic': MicBody,
  'daw.sampleOutput': SampleOutputBody,
  'daw.startTone': TakeToneRowBody,
  'daw.capabilities': CapabilitiesBody,
  'daw.layout': ChapterLayoutBody,
  'daw.sync': SyncEnabledBody,
  'daw.voices': VoicesBody,
  'daw.syncActivity': SyncActivityBody,
  'voice.dict': DefinitionsBody,
  'voice.mwKey': MwKeyBody,
  'delivery.profile': DeliveryProfileBody,
  'delivery.default': DeliveryDefaultBody,
  'delivery.custom': DeliveryCustomBody,
};
