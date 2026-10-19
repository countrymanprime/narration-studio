import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Testing Library unmounts what a test rendered on its own only when the runner's `afterEach` is a global, and Vitest's is not (`globals` is off).
afterEach(cleanup);

// The mock API loads the whole of Alice's Adventures in Wonderland for the demo (apps/ui/src/api/aliceManuscript.ts). These unit tests need a mock
// API, not the book, so they use the compact seed manuscript, as apps/ui's own test setup does.
vi.mock('@ui/api/aliceManuscript', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ui/api/aliceManuscript')>()),
  loadAliceManuscript: () => Promise.resolve(undefined),
}));
