/**
 * The page's side of the activity trace (docs/prds/activity-trace.prd.md): events are queued here and sent to the host in one batched
 * call (`SystemTraceBatch`), where each is checked against the host's registry. Only a registered name and plain values go in: a text,
 * a title or a path has no field, so none is queued. Tracing never throws, never waits for the host and never traces itself.
 */

export type TraceFields = Record<string, string | number | boolean>;
type TraceEvent = { event: string; fields: TraceFields };

/** How long events wait for company before they are sent. */
export const FLUSH_MS = 1000;
/** The most events one call carries (the host refuses more than 200). */
const BATCH_SIZE = 100;
/** Events kept while a send is failing; older ones are dropped first. */
const QUEUE_CAP = 500;

type Sink = (batch: string) => Promise<unknown>;

let sink: Sink | undefined;
let queue: TraceEvent[] = [];
let hostEvents = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** A host name in the registry's id alphabet: `SystemOpenLogFolder` is `system_open_log_folder`, `teleprompter:event` stays as it is. */
export function traceId(name: string): string {
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, '_');
  return snake.slice(0, 64) || 'unknown';
}

/** Turns tracing on with the call that carries a batch to the host, or off with `undefined`. */
export function setTraceSink(next: Sink | undefined): void {
  sink = next;
  if (!next) {
    queue = [];
    hostEvents = new Map();
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
}

function schedule(): void {
  if (timer || !sink) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushTrace();
  }, FLUSH_MS);
}

/** Queues one event. Does nothing while tracing is off. */
export function trace(event: string, fields: TraceFields = {}): void {
  if (!sink) return;
  queue.push({ event, fields });
  if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
  schedule();
}

/** Counts one live event from the host; the count is sent once per window, not once per delivery. */
export function traceHostEvent(name: string): void {
  if (!sink) return;
  const id = traceId(name);
  hostEvents.set(id, (hostEvents.get(id) ?? 0) + 1);
  schedule();
}

/** Sends what is queued now. A failed send drops the batch: the trace is a record, not a promise. */
export async function flushTrace(): Promise<void> {
  const send = sink;
  if (!send) return;
  for (const [name, count] of hostEvents) queue.push({ event: 'ui.host_event', fields: { name, count } });
  hostEvents = new Map();
  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);
    try {
      await send(JSON.stringify({ events: batch }));
    } catch {
      // The host may be gone or the trace refused; tracing must not become the failure.
    }
  }
}
