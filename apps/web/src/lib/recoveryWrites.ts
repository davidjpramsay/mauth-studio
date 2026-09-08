export function createSerialWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const next = tail.then(write, write);
    tail = next.catch(() => undefined);
    return next;
  };
}

export function recoveryRetryDelay(failures: number) {
  return Math.min(30000, 1000 * 2 ** Math.min(Math.max(failures - 1, 0), 5));
}
