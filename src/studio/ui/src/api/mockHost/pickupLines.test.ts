// @vitest-environment node
// The line a pickup asks the narrator to re-record is a whole sentence or the tail clause of one, never a fixed-length slice of the
// paragraph that stops mid-word (#1717).
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../mockApi';

describe('the mock pickup list names whole phrases', () => {
  it('ends every line to re-record at the end of a sentence, inside its paragraph, without cutting a word', async () => {
    const { pickups } = await createMockApi({}, {}).pickupsList();
    expect(pickups.length).toBeGreaterThan(0);
    for (const pickup of pickups) {
      const line = pickup.script.replace(/^…/, '');
      expect(pickup.context, pickup.id).toContain(line);
      expect(line, pickup.id).toMatch(/[.!?]['"’”]?$/);
      const at = pickup.context.indexOf(line);
      expect(at === 0 || /[\s“"‘'—-]/.test(pickup.context[at - 1]), `${pickup.id} starts inside a word`).toBe(true);
    }
  });
});
