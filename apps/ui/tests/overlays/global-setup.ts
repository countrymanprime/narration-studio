import { mkdirSync, rmSync } from 'node:fs';
import { RESULTS_FILE } from './overlayGuard';

// Rows are appended as the specs run (a failing test restarts its worker, so memory would lose them); a fresh run starts empty.
export default function globalSetup(): void {
  mkdirSync('screenshots/overlays', { recursive: true });
  rmSync(RESULTS_FILE, { force: true });
}
