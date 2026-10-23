import type { ChapterDoc } from '../model';

/** A paragraph of the document, as the model builds it (the model does not export the name). */
export type DocPara = ChapterDoc['paras'][number];
