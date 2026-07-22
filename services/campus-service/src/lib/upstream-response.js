const responseReleases = new WeakMap();

export function trackUpstreamResponse(response, release) {
  let released = false;
  responseReleases.set(response, () => {
    if (released) return;
    released = true;
    responseReleases.delete(response);
    release();
  });
  return response;
}

export function releaseUpstreamResponse(response) {
  responseReleases.get(response)?.();
}

export async function discardUpstreamResponse(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // The response may already be closed by the remote peer.
  } finally {
    releaseUpstreamResponse(response);
  }
}
