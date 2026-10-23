/** `record` without `key`, as a new object. */
export function without<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}
