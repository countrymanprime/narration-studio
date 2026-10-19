// `?mockFidelity=<mock>`: the mock backend drawn as a benchmark mock draws its screen, so the pixel-match tool
// (tests/visual/mock-match) scores the page's style rather than its sample data. A fixture sets only fields the app has; what the mock draws with no data behind it stays the app's own.
import type { MockApiSeed } from './state';

export type MockFidelity = '05';

export const MOCK_FIDELITY: Record<MockFidelity, Partial<MockApiSeed>> = {
  // Benchmark 05-master-delivery: the six rendered files of the book (the fifth over ACX's noise floor) to check, and ACX beside the
  // four other platforms the narrator has configured. The mock's invented wording and its OUTPUTS list stay the app's own.
  '05': { measure: 'mock-05', deliveryProfile: 'platforms' },
};

export const mockFidelityFrom = (value: string | null): MockFidelity | undefined => (value === '05' ? value : undefined);
