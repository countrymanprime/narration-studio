/**
 * The optional Story Bible analysis tools (fixture data: ids, sizes and hosts are from the measured trial, scratchpad/local-llm-research.md 9 and 9.9).
 * Nothing here is bundled: each is downloaded when the narrator agrees. The mock never touches a network.
 */
import type { AnalysisHost, ComponentSpec } from '@/domain/components'

export const COMPONENT_SPECS: ComponentSpec[] = [
  {
    id: 'gliner', name: 'GLiNER', does: 'Finds the names of characters, places and things in the manuscript, including invented ones, and suggests them as new entries.',
    sizeMB: 585, host: 'huggingface.co', licence: 'The model files are published under the Apache 2.0 licence, which allows this use.',
    ramGB: 2, minutesPerBook: 2, source: 'gliner', rank: 1, recommended: true,
  },
  {
    id: 'booknlp-small', name: 'BookNLP (small)', does: 'Groups the different ways a character is named, works out who speaks each quoted line, and suggests gender. Quick, and a little less sure than the large one.',
    sizeMB: 161, host: 'people.ischool.berkeley.edu', licence: 'The program is under the MIT licence. Its authors give no licence statement for the model files; they are used here only to find character names.',
    ramGB: 1.6, minutesPerBook: 3, source: 'booknlp', rank: 1, recommended: true,
  },
  {
    id: 'booknlp-big', name: 'BookNLP (large)', does: 'The same as the small one, with the most reliable speaker attribution. Larger to download and slower to run.',
    sizeMB: 1200, host: 'people.ischool.berkeley.edu', licence: 'The program is under the MIT licence. Its authors give no licence statement for the model files; they are used here only to find character names.',
    ramGB: 3.1, minutesPerBook: 10, source: 'booknlp', rank: 2, recommended: false,
  },
  {
    id: 'local-llm', name: 'Local language model', does: 'Reads the manuscript like a person would and writes descriptions, relationships and what each character says, does and knows.',
    sizeMB: 5030, host: 'huggingface.co', licence: 'Licence to be confirmed before it is offered.',
    ramGB: 11, minutesPerBook: null, source: null, rank: 0, recommended: false,
    unavailable: 'A model small enough for this computer takes many hours per book. It will be offered once that is practical.',
  },
]

/** What the mock host reports for each state of the Mock states panel. */
export const HOST_FREE_DISK_MB: Record<AnalysisHost, number> = { reachable: 250000, blocked: 250000, lowdisk: 120 }
