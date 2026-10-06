import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checks = [
  ['StartupBenchmark', 'coldStartupWithInstalledProfile', 'timeToInitialDisplayMs', 'median', 50],
  ['InteractionBenchmark', 'homeScroll', 'frameDurationCpuMs', 'P95', 2],
  ['InteractionBenchmark', 'notificationScroll', 'frameDurationCpuMs', 'P95', 2],
  ['InteractionBenchmark', 'tabSwitching', 'frameDurationCpuMs', 'P95', 2],
];

export function readBenchmarks(directory) {
  const benchmarks = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) benchmarks.push(...readBenchmarks(file));
    else if (entry.name.endsWith('benchmarkData.json')) {
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(report.benchmarks)) throw new Error(`基准报告缺少 benchmarks：${file}`);
      benchmarks.push(...report.benchmarks);
    }
  }
  return benchmarks;
}

export function compareBenchmarks(baseline, candidate) {
  function metric(rows, className, name, metricName, statistic) {
    const matching = rows.filter((row) => row.className?.endsWith(`.${className}`) && row.name === name);
    if (!matching.length) throw new Error(`缺少基准场景：${className}.${name}`);
    const values = matching.map((row) => row.metrics?.[metricName]?.[statistic] ?? row.sampledMetrics?.[metricName]?.[statistic]);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`基准指标无效：${name}/${metricName}/${statistic}`);
    return Math.max(...values);
  }
  return checks.map(([className, name, metricName, statistic, tolerance]) => {
    const before = metric(baseline, className, name, metricName, statistic);
    const after = metric(candidate, className, name, metricName, statistic);
    // 同一 CI 模拟器比较；同时超过相对和绝对容差才失败，避免微小抖动误报。
    const limit = Math.max(before * 1.25, before + tolerance);
    return { name, metric: `${metricName}/${statistic}`, before, after, limit, passed: after <= limit };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [baselineDirectory, candidateDirectory] = process.argv.slice(2);
    if (!baselineDirectory || !candidateDirectory) throw new Error('用法：node scripts/check-android-performance.mjs <基线报告目录> <当前报告目录>');
    const results = compareBenchmarks(readBenchmarks(baselineDirectory), readBenchmarks(candidateDirectory));
    const summary = [
      'Android 性能回归（同一 CI 模拟器，单位 ms）', '',
      '| 场景 | 指标 | 基线 | 当前 | 上限 | 结果 |',
      '| --- | --- | ---: | ---: | ---: | --- |',
      ...results.map((row) => `| ${row.name} | ${row.metric} | ${row.before.toFixed(2)} | ${row.after.toFixed(2)} | ${row.limit.toFixed(2)} | ${row.passed ? '通过' : '退化'} |`),
      '',
    ].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    if (results.some((row) => !row.passed)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
