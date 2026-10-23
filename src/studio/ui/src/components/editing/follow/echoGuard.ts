/** How near a cursor the DAW reports must be to one the app set to count as that write coming back, in seconds. REAPER holds the cursor to the second we send, so this is for rounding on the way. */
export const ECHO_TOLERANCE = 0.02;
/** How long after a write its echo may come: the DAW streams a cursor move within a tick, the host relays it within another, and a busy REAPER may be late. */
export const ECHO_WINDOW_MS = 2500;
/** A cursor that differs from the last one heard by less than this is the same cursor (the bridge's own threshold for sending a move). */
const SAME = 0.001;

export type Heard = 'unchanged' | 'echo' | 'moved';

interface Write {
  generation: number;
  project: number;
  at: number;
}

/**
 * Tells a cursor move the narrator made in the DAW from the one the app made itself, so a write does not come back as a move.
 *
 * The app calls `write` before it sets the DAW's cursor and `settled` when the call answers; every cursor the DAW reports goes through `heard`.
 * A report that is the last one again is `unchanged` (so a reading from before the write cannot undo it). A change that matches a write still in
 * its window is that write's `echo` (and the writes before it, whose echoes were lost, are forgotten). Any other change is a `moved`, and it
 * forgets every write still pending: the DAW's cursor is where the narrator put it, and a write that lands afterwards is then reported as the
 * move it has become, so the page ends where the DAW is. Two clocks cannot both be right, and the DAW's cursor is the one that is.
 */
export class EchoGuard {
  private last: number | undefined;
  private writes: Write[] = [];
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** The generation of the newest write; 0 before any. */
  get generation(): number {
    return this.count;
  }

  /** The app is about to set the DAW's cursor to `project` seconds. Returns this write's generation. */
  write(project: number): number {
    this.count += 1;
    this.writes.push({ generation: this.count, project, at: this.now() });
    return this.count;
  }

  /** The call for write `generation` answered. A failed write never reaches the DAW, so its place is no echo. */
  settled(generation: number, ok: boolean): void {
    if (!ok) this.writes = this.writes.filter((w) => w.generation !== generation);
  }

  /** The cursor the DAW reports, in project seconds. */
  heard(cursor: number): Heard {
    if (!Number.isFinite(cursor) || cursor < 0) return 'unchanged';
    if (this.last !== undefined && Math.abs(cursor - this.last) <= SAME) return 'unchanged';
    this.last = cursor;
    const now = this.now();
    this.writes = this.writes.filter((w) => now - w.at <= ECHO_WINDOW_MS);
    const at = this.writes.findIndex((w) => Math.abs(w.project - cursor) <= ECHO_TOLERANCE);
    if (at >= 0) {
      this.writes = this.writes.slice(at + 1);
      return 'echo';
    }
    this.writes = [];
    return 'moved';
  }

  /** Forget everything: the DAW reconnected, another chapter opened. */
  reset(): void {
    this.last = undefined;
    this.writes = [];
  }
}
