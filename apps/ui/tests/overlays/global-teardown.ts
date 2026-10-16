import { existsSync, readFileSync } from 'node:fs';
import { RESULTS_FILE, formatTable, type Row } from './overlayGuard';

// Prints the overlay x position table once the run is over.
export default function globalTeardown(): void {
  if (!existsSync(RESULTS_FILE)) return;
  const rows = readFileSync(RESULTS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row);
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  console.log(`\n${formatTable(rows)}\n\nPASS ${count('PASS')}  FAIL ${count('FAIL')}  n/a ${count('n/a')}  (rows: ${RESULTS_FILE})`);
}
