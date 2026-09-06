export async function mapWithConcurrency(items, concurrency, mapper) {
  const input = Array.from(items || []);
  if (!input.length) return [];
  const workerCount = Math.min(input.length, Math.max(1, Math.trunc(Number(concurrency) || 1)));
  const results = new Array(input.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < input.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(input[index], index);
    }
  }

  const workers = await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
  const failed = workers.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return results;
}

export async function* iterateTaskPages(loadPage, { batchSize = 1000, shouldStop = () => false } = {}) {
  let afterId = "";
  while (!shouldStop()) {
    const tasks = await loadPage({ afterId, limit: batchSize });
    if (!tasks.length) return;
    // IDs stay stable when a task is updated or disabled during the scan.
    afterId = tasks[tasks.length - 1].id;
    yield tasks;
    if (tasks.length < batchSize) return;
  }
}
