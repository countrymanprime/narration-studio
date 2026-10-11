// The golden payloads of the narrator's bookmarks (apps/desktop/bindings_bookmarks.go).
import type { z } from 'zod';
import { bookmarkSchema, bookmarksSchema } from '../schemas/bookmarks';

export const bookmarksGoldens: Record<string, z.ZodType> = {
  'bookmarks-list-empty.json': bookmarksSchema,
  'bookmarks-list.json': bookmarksSchema,
  'bookmarks-add.json': bookmarkSchema,
  'bookmarks-update.json': bookmarkSchema,
  'bookmarks-remove.json': bookmarksSchema,
};
