export function createDocumentOpenQueue(openDocument: (path: string) => Promise<unknown>, onError: (error: unknown) => void) {
  const pending: string[] = [];
  let ready = false;
  let running = false;

  async function drain() {
    if (!ready || running) return;
    running = true;
    try {
      while (ready && pending.length) {
        const path = pending.shift()!;
        try {
          await openDocument(path);
        } catch (error) {
          onError(error);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(path: string) {
      if (!pending.includes(path)) pending.push(path);
      void drain();
    },
    setReady(value: boolean) {
      ready = value;
      void drain();
    },
  };
}
