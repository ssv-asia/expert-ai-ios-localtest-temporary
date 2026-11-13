/**
 * Wraps fetch with a configurable timeout.
 * Aborts the request if it exceeds the timeout duration.
 */
export function createFetchWithTimeout(timeoutMs: number = 30000) {
  return async (request: Request): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(request, {
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      // Hermes has no global DOMException — referencing it throws a ReferenceError
      // instead of evaluating to false, which crashed every timed-out request through
      // this module (Sentry REACT-NATIVE-5). Check by name on a plain Error instead,
      // matching the pattern already used in lib/gateway-client.ts.
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

export const fetchWithTimeout = createFetchWithTimeout();
