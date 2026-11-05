export const PROBE_URLS: readonly string[] = [
  "https://www.gstatic.com/generate_204",
  "https://1.1.1.1/",
];
export const PROBE_TIMEOUT_MS = 5000;

export type Probe = (url: string, signal: AbortSignal) => Promise<unknown>;

// no-cors: the probe only needs the request to reach a host, not to read the
// response, and these hosts send no CORS headers.
export const fetchProbe: Probe = (url, signal) =>
  fetch(url, { mode: "no-cors", method: "HEAD", cache: "no-store", signal });

export async function isOnline(
  probe: Probe,
  urls: readonly string[] = PROBE_URLS,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  // async wrapper: a probe that throws synchronously must count as a failed
  // host, not reject isOnline.
  const anyHost = Promise.any(
    urls.map(async (url) => probe(url, controller.signal)),
  ).then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([anyHost, timeout]);
  } finally {
    clearTimeout(timer);
    // Free the sockets of the probes that are still pending.
    controller.abort();
  }
}
