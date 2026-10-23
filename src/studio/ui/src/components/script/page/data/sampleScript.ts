// Sample data for the Script page's stories, read from the browser mock (`createMockApi`) through the page's own read cache,
// so a story draws what the mock host holds and no component keeps a sample literal.

import { createMockApi } from '../../../../api/mockApi';
import { createScriptData, type ScriptDataState } from './scriptData';

/** Every list the page reads, and the paragraphs of the first chapter, as the mock host answers them. */
export async function loadSampleScript(): Promise<ScriptDataState> {
  const api = createMockApi();
  const data = createScriptData({ manuscript: api, marks: api, scriptPrep: api, storyBible: api, system: api });
  await Promise.all([data.load('chapters'), data.load('marks'), data.load('prep'), data.load('entries'), data.load('cues')]);
  const first = data.getState().chapters?.value?.[0];
  if (first) await data.loadParagraphs(first.id);
  return data.getState();
}
