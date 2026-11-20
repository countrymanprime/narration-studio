/** A slow DAW link for the mock (`?mockDawLatency=`, #3752): the same profile the host reads from `NARRATION_DAW_LATENCY` (`SlowLink` in src/studio/desktop/internal/bridge/slowlink.go). All times are milliseconds. */
export interface DawLatency {
  /** Every matching call is held this long; `jitter` adds up to this much more, different for each call. */
  delay: number;
  jitter: number;
  /** A stretch in which nothing reaches the DAW and nothing is heard from it, from the start and again every `stallEvery` (once when 0). */
  stallFor: number;
  stallEvery: number;
  /** How many of the first matching calls never reach the DAW. */
  drop: number;
  /** Limits delay, jitter and drop to these names; empty is every call. A stall holds every call. */
  only: string[];
}

const UNIT_MS: Record<string, number> = { ns: 1e-6, us: 1e-3, µs: 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** A Go duration (`300ms`, `1.5s`, `1m30s`) in milliseconds. */
function duration(value: string): number {
  let rest = value;
  let total = 0;
  while (rest !== '') {
    const part = /^(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/.exec(rest);
    if (!part) throw new Error(`"${value}" is not a duration`);
    total += Number(part[1]) * UNIT_MS[part[2]];
    rest = rest.slice(part[0].length);
  }
  if (value === '') throw new Error('a duration is missing');
  return total;
}

/**
 * Reads a profile: comma-separated `delay=1s`, `jitter=200ms`, `stall=8s` or `stall=8s/30s` (stalled for 8 s, every 30 s), `drop=1` and
 * `only=tracksLive+dawArmBoothVoice`. A bare duration (`300ms`, `10s`) is `delay=`, and `stall-recover` is `stall=8s`. Throws on anything else.
 * The cases both parsers must agree on are in src/studio/desktop/internal/bridge/testdata/slowlink_profiles.json.
 */
export function parseDawLatency(text: string): DawLatency {
  const link: DawLatency = { delay: 0, jitter: 0, stallFor: 0, stallEvery: 0, drop: 0, only: [] };
  for (const raw of text.split(',')) {
    const part = raw.trim() === 'stall-recover' ? 'stall=8s' : raw.trim();
    if (part === '') continue;
    const at = part.indexOf('=');
    const [key, value] = at < 0 ? ['delay', part] : [part.slice(0, at), part.slice(at + 1)];
    try {
      if (key === 'delay') link.delay = duration(value);
      else if (key === 'jitter') link.jitter = duration(value);
      else if (key === 'stall') {
        const [stalled, every] = value.split('/', 2);
        link.stallFor = duration(stalled);
        if (every !== undefined) {
          link.stallEvery = duration(every);
          if (link.stallEvery <= link.stallFor) throw new Error('a stall must be shorter than its period');
        }
      } else if (key === 'drop') {
        if (!/^\d+$/.test(value)) throw new Error('drop is a whole number');
        link.drop = Number(value);
      } else if (key === 'only') link.only = value.split('+');
      else throw new Error('unknown key');
    } catch (error) {
      throw new Error(`slow link profile "${text}": "${part}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return link;
}

/** Whether the profile holds or drops anything. */
export function slows(link: DawLatency): boolean {
  return link.delay > 0 || link.jitter > 0 || link.stallFor > 0 || link.drop > 0;
}

/** When each call may reach the DAW on a slow link, in the order the calls were made (a slow link never reorders). Times are a clock's milliseconds. */
export class LinkClock {
  private last = 0;
  private dropped = 0;
  private counter = 0;

  constructor(
    private readonly link: DawLatency,
    private readonly started: number,
  ) {}

  /** How far into a stall `now` is: the milliseconds left of it, or 0 outside one. */
  stallLeft(now: number): number {
    if (this.link.stallFor <= 0) return 0;
    const since = this.link.stallEvery > 0 ? (now - this.started) % this.link.stallEvery : now - this.started;
    return since < this.link.stallFor ? this.link.stallFor - since : 0;
  }

  /** When the call named `name`, made at `now`, reaches the DAW; `Infinity` for one the profile drops. */
  release(name: string, now: number): number {
    const counter = this.counter++;
    let release = now;
    if (this.link.only.length === 0 || this.link.only.includes(name)) {
      if (this.dropped < this.link.drop) {
        this.dropped += 1;
        return Infinity;
      }
      // The host's spread (slowlink.go): Knuth's multiplicative hash of the call's number, the same on every run.
      release += this.link.delay + (this.link.jitter * ((counter * 2654435761) % 1000)) / 1000;
    }
    release += this.stallLeft(release);
    this.last = Math.max(this.last, release);
    return this.last;
  }
}
