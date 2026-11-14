/** Ignore stale disk restoration after a newer sign-in/sign-out event or unmount. */
export function observeSession<T>(
  source: {
    read(): Promise<T | null>;
    subscribe(next: (session: T | null) => void): () => void;
  },
  receive: (session: T | null) => void,
  failure: () => void,
) {
  let active = true;
  let eventReceived = false;
  const unsubscribe = source.subscribe((session) => {
    eventReceived = true;
    if (active) receive(session);
  });
  void source
    .read()
    .then((session) => {
      if (active && !eventReceived) receive(session);
    })
    .catch(() => {
      if (active && !eventReceived) failure();
    });
  return () => {
    active = false;
    unsubscribe();
  };
}
