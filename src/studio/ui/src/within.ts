/** `work`'s answer, or null when it has not come after `ms`: an answer that never comes must not hold the narrator back. */
export async function within<T>(work: Promise<T>, ms: number): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.then((value) => ({ value })), late]);
  } finally {
    clearTimeout(timer);
  }
}
