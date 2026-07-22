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

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
