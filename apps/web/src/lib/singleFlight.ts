export interface SingleFlightState<TResult> {
  current: Promise<TResult> | null;
}

export function runSingleFlight<TResult>(state: SingleFlightState<TResult>, operation: () => Promise<TResult>): Promise<TResult> {
  if (state.current) return state.current;

  const promise = operation();
  state.current = promise;
  const clear = () => {
    if (state.current === promise) state.current = null;
  };
  void promise.then(clear, clear);
  return promise;
}
