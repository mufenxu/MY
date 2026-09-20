const responseReleases = new WeakMap();

// 调用方拿到响应却不读取也不丢弃时槽位会被永久占用并锁死上游闸门，这里用兜底定时器强制归还。
const RELEASE_WATCHDOG_MS = Math.max(1000, Number(process.env.HGU_UPSTREAM_RELEASE_WATCHDOG_MS) || 120_000);

export function trackUpstreamResponse(response, release, { onWatchdog } = {}) {
  let released = false;
  const finish = () => {
    if (released) return false;
    released = true;
    const entry = responseReleases.get(response);
    if (entry) {
      responseReleases.delete(response);
      clearTimeout(entry.timer);
    }
    release();
    return true;
  };
  const timer = setTimeout(() => {
    if (finish()) onWatchdog?.(response);
  }, RELEASE_WATCHDOG_MS);
  timer.unref?.();
  responseReleases.set(response, { release: finish, timer });
  return response;
}

export function releaseUpstreamResponse(response) {
  responseReleases.get(response)?.release();
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
