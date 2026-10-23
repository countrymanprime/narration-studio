/** A marker on the waveform: a point in time with a colour. `done` draws it hollow. */
export type Pin = { id: string; sec: number; colour: string; done: boolean; label: string };

/** A stretch of the chapter with a name. `tone` picks the ink. */
export type Band = { id: string; start: number; end: number; label: string; tone?: 'ok' | 'neutral' };

export type Cluster = { pins: Pin[]; x0: number; x1: number };

/** Two pins closer than this (px) would touch and merge into a count. */
const PIN_MERGE_PX = 16;

/** Pins in the window, merged when they would touch, unless one is selected: a selected pin, or a cluster holding it, never merges. */
export function clusterPins(pins: readonly Pin[], start: number, len: number, width: number, selectedId: string | null): Cluster[] {
  if (len <= 0) return [];
  const x = (sec: number): number => ((sec - start) / len) * width;
  const inView = pins.filter((pin) => pin.sec >= start && pin.sec <= start + len).sort((a, b) => a.sec - b.sec);
  const clusters: Cluster[] = [];
  for (const pin of inView) {
    const at = x(pin.sec);
    const last = clusters[clusters.length - 1];
    if (last && at - last.x1 < PIN_MERGE_PX && pin.id !== selectedId && !last.pins.some((p) => p.id === selectedId)) {
      last.pins.push(pin);
      last.x1 = at;
    } else clusters.push({ pins: [pin], x0: at, x1: at });
  }
  return clusters;
}

/** The earliest pin in the window, or null. */
export function earliestInView(pins: readonly Pin[], start: number, len: number): Pin | null {
  return pins.filter((pin) => pin.sec >= start && pin.sec <= start + len).sort((a, b) => a.sec - b.sec)[0] ?? null;
}
