/**
 * Races a promise against a timer so a native call that never settles (a
 * wedged JSI bridge, a stuck model load) turns into a catchable error
 * instead of leaving the caller — and the UI waiting on it — stuck forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
