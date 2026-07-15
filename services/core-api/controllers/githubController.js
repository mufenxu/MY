const githubService = require('../services/githubService');

const rateLimit = { ip: {}, global: 0 };

const pickFirst = (...values) => {
    for (const v of values) {
        if (v !== undefined && v !== null && v !== '') {
            return v;
        }
    }
    return undefined;
};

const toNumberOrUndefined = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
};

const looksLikeResultItem = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const identityKeys = ['host', 'hostname', 'server', 'ip', 'user', 'username', 'account'];
    return identityKeys.some(key => value[key] !== undefined);
};

const hasResultOutcome = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return ['success', 'ok', 'status', 'code'].some(key => value[key] !== undefined);
};

const normalizeResultItem = (item, forcedSuccess) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
        return forcedSuccess === undefined ? item : { ...item, success: forcedSuccess };
    }

    return {
        host: String(item),
        success: forcedSuccess === undefined ? false : forcedSuccess
    };
};

const normalizeResults = (rawResults) => {
    if (Array.isArray(rawResults)) return rawResults;

    if (typeof rawResults === 'string') {
        const text = rawResults.trim();
        if (!text) return [];

        try {
            const parsed = JSON.parse(text);
            return normalizeResults(parsed);
        } catch (_) {
            const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            if (lines.length > 1) {
                const parsedLines = [];
                for (const line of lines) {
                    try {
                        const parsedLine = JSON.parse(line);
                        if (parsedLine && typeof parsedLine === 'object') parsedLines.push(parsedLine);
                    } catch (_) {
                        return [];
                    }
                }
                return parsedLines;
            }

            return [];
        }
    }

    if (!rawResults || typeof rawResults !== 'object') return [];

    const arrayKeys = [
        'results',
        'result',
        'details',
        'items',
        'servers',
        'server_results',
        'serverResults',
        'login_results',
        'loginResults',
        'accounts',
        'hosts',
        'records'
    ];
    for (const key of arrayKeys) {
        if (rawResults[key] !== undefined && rawResults[key] !== rawResults) {
            const normalized = normalizeResults(rawResults[key]);
            if (normalized.length > 0) return normalized;
        }
    }

    if (Array.isArray(rawResults.success) || Array.isArray(rawResults.failed)) {
        return [
            ...(rawResults.success || []).map(item => normalizeResultItem(item, true)),
            ...(rawResults.failed || []).map(item => normalizeResultItem(item, false))
        ];
    }

    if (looksLikeResultItem(rawResults)) {
        return [rawResults];
    }

    // 兼容 map 结构: { hostA: {...}, hostB: {...} }
    const entries = Object.entries(rawResults);
    if (entries.length > 0 && entries.every(([, item]) => item && typeof item === 'object')) {
        return entries.flatMap(([key, item]) => {
            const normalized = normalizeResults(item);
            if (normalized.length > 0) {
                return normalized.map(result => {
                    if (result && typeof result === 'object' && !Array.isArray(result) && !result.host && !result.hostname && !result.server) {
                        return { host: key, ...result };
                    }
                    return result;
                });
            }
            if (item && typeof item === 'object' && !Array.isArray(item) && hasResultOutcome(item)) {
                return [{ host: key, ...item }];
            }
            return [];
        });
    }

    return [];
};

const extractSummary = (body, results) => {
    const statsSource = pickFirst(body.stats, body.summary, body.result?.stats, body.data?.stats, {});
    const success = toNumberOrUndefined(pickFirst(
        body.success_count,
        body.successCount,
        body.success,
        body.result?.success_count,
        body.result?.successCount,
        body.result?.success,
        body.data?.success_count,
        body.data?.successCount,
        body.data?.success,
        statsSource.success_count,
        statsSource.successCount,
        statsSource.success
    ));
    const failed = toNumberOrUndefined(pickFirst(
        body.failed_count,
        body.failedCount,
        body.fail_count,
        body.failCount,
        body.failed,
        body.fail,
        body.result?.failed_count,
        body.result?.failedCount,
        body.result?.fail_count,
        body.result?.failCount,
        body.result?.failed,
        body.result?.fail,
        body.data?.failed_count,
        body.data?.failedCount,
        body.data?.fail_count,
        body.data?.failCount,
        body.data?.failed,
        body.data?.fail,
        statsSource.failed_count,
        statsSource.failedCount,
        statsSource.fail_count,
        statsSource.failCount,
        statsSource.failed,
        statsSource.fail
    ));
    const total = toNumberOrUndefined(pickFirst(
        body.total_accounts,
        body.totalAccounts,
        body.total,
        body.count,
        body.result?.total_accounts,
        body.result?.totalAccounts,
        body.result?.total,
        body.result?.count,
        body.data?.total_accounts,
        body.data?.totalAccounts,
        body.data?.total,
        body.data?.count,
        statsSource.total_accounts,
        statsSource.totalAccounts,
        statsSource.total,
        statsSource.count
    ));

    const inferredTotal = total !== undefined
        ? total
        : (success !== undefined && failed !== undefined ? success + failed : results.length);

    return {
        total: inferredTotal,
        success,
        failed,
        status: pickFirst(body.status, body.conclusion, body.workflow_conclusion, body.workflowConclusion, body.result?.status, body.data?.status, statsSource.status),
        workflow_conclusion: pickFirst(body.workflow_conclusion, body.workflowConclusion, body.conclusion, body.run?.conclusion, body.workflow_run?.conclusion)
    };
};

const parseBodyObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};

    const text = value.trim();
    if (!text) return {};

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) { }

    try {
        const params = new URLSearchParams(text);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        return obj;
    } catch (_) {
        return {};
    }
};

exports.triggerAction = async (req, res, next) => {
    try {
        const ip = req.ip;
        const now = Date.now();

        if (rateLimit.ip[ip] && (now - rateLimit.ip[ip] < 60000)) {
            const remaining = Math.ceil((60000 - (now - rateLimit.ip[ip])) / 1000);
            return res.status(429).json({ error: 'Too Many Requests', message: `请等待 ${remaining} 秒后再试` });
        }

        if (now - rateLimit.global < 30000) {
            const remaining = Math.ceil((30000 - (now - rateLimit.global)) / 1000);
            return res.status(429).json({ error: 'Too Many Requests', message: `系统繁忙，请等待 ${remaining} 秒` });
        }

        rateLimit.ip[ip] = now;
        rateLimit.global = now;

        const inputs = req.body.inputs || {};
        const result = await githubService.triggerAction(ip, inputs);
        res.json(result);
    } catch (err) {
        next(err);
    }
};

exports.handleCallback = async (req, res, next) => {
    try {
        const body = parseBodyObject(req.body);
        const rawBody = parseBodyObject(req.rawBody);
        const mergedBody = { ...rawBody, ...body };

        const runIdRaw = pickFirst(
            mergedBody.run_id,
            mergedBody.runId,
            mergedBody.github_run_id,
            mergedBody.githubRunId,
            mergedBody.id,
            mergedBody.run?.id,
            mergedBody.workflow_run?.id,
            mergedBody.workflowRun?.id,
            mergedBody.github?.run_id,
            mergedBody.github?.runId,
            mergedBody.context?.run_id,
            mergedBody.context?.runId,
            mergedBody.meta?.run_id,
            mergedBody.meta?.runId
        );
        const run_id = runIdRaw !== undefined ? String(runIdRaw) : '';

        const workflow = String(
            pickFirst(
                mergedBody.workflow,
                mergedBody.workflow_name,
                mergedBody.workflowName,
                mergedBody.workflow_file,
                mergedBody.workflowFile,
                mergedBody.run?.workflow,
                mergedBody.workflow_run?.name,
                mergedBody.workflowRun?.name,
                mergedBody.github?.workflow,
                githubService.getDefaultWorkflowName(),
                'unknown'
            )
        );

        const started_at = pickFirst(
            mergedBody.started_at,
            mergedBody.startedAt,
            mergedBody.run_started_at,
            mergedBody.runStartedAt,
            mergedBody.start_time,
            mergedBody.startTime,
            mergedBody.run?.started_at,
            mergedBody.run?.startedAt,
            mergedBody.workflow_run?.run_started_at,
            mergedBody.workflowRun?.runStartedAt
        );

        const rawResults = pickFirst(
            mergedBody.results,
            mergedBody.result,
            mergedBody.details,
            mergedBody.items,
            mergedBody.servers,
            mergedBody.server_results,
            mergedBody.serverResults,
            mergedBody.login_results,
            mergedBody.loginResults,
            mergedBody.accounts,
            mergedBody.hosts,
            mergedBody.records,
            mergedBody.data,
            mergedBody.payload,
            mergedBody.data?.results,
            mergedBody.data?.details,
            mergedBody.data?.items,
            mergedBody.data?.servers,
            mergedBody.data?.login_results,
            mergedBody.data?.loginResults,
            mergedBody.payload?.results,
            mergedBody.payload?.details,
            mergedBody.payload?.items,
            mergedBody.payload?.servers,
            mergedBody.payload?.login_results,
            mergedBody.payload?.loginResults,
            mergedBody.summary?.results,
            mergedBody.summary?.details
        );
        const results = normalizeResults(rawResults);
        const summary = extractSummary(mergedBody, results);

        if (!run_id) {
            return res.status(400).json({ error: 'Missing run_id' });
        }

        console.info(`[CT8 Callback] received run_id=${run_id}, results=${results.length}, keys=${Object.keys(mergedBody).join(',')}`);

        const result = await githubService.saveCallback(run_id, workflow, results, started_at, summary);
        res.json({
            ok: true,
            message: 'Data saved successfully',
            run_id,
            workflow,
            result_count: results.length,
            stats: result.stats
        });
    } catch (err) {
        next(err);
    }
};

exports.getStatus = async (req, res, next) => {
    try {
        const { run_id, limit } = req.query;

        if (run_id) {
            let run = await githubService.getRunById(run_id);
            if (!run) return res.status(404).json({ success: false, message: 'Run not found' });
            run = await githubService.tryHydrateRunFromArtifacts(run);
            return res.json({ success: true, data: run });
        }

        let activeTask = await githubService.getActiveTask();

        // 主动查询 GitHub API 兜底：当 activeTask 运行超过 2 分钟时，
        // 检查 GitHub 上任务是否已完成，解决 webhook 回调丢失的问题
        if (activeTask && activeTask.status === 'running') {
            activeTask = await githubService.checkAndResolveActiveTask(activeTask);
        }
        await githubService.hydrateLatestMissingRun();

        // 在 auto-resolve 可能创建新记录后再查询，确保最新数据
        const runs = await githubService.getRuns(parseInt(limit) || 10);
        const latestDoc = await githubService.getLatestRun();

        let latest = null;
        if (latestDoc) {
            latest = {
                ...latestDoc,
                total_accounts: latestDoc.stats?.total || 0,
                success_count: latestDoc.stats?.success || 0,
                failed_count: latestDoc.stats?.failed || 0
            };
        }

        res.json({
            success: true,
            data: { runs, latest, activeTask, total: runs.length }
        });
    } catch (err) {
        next(err);
    }
};

exports.updateSecret = async (req, res, next) => {
    try {
        const { action, secret_name, value } = req.body;
        const result = await githubService.updateSecret(action, secret_name, value);

        if (result.notFound) {
            return res.status(404).json({ ok: false, error: 'Secret not found', message: result.message });
        }

        res.json(result);
    } catch (err) {
        next(err);
    }
};

exports.manageSecretCache = async (req, res, next) => {
    try {
        const { action, secret_name, secret_value, updated_by } = req.body;
        const result = await githubService.manageSecretCache(action, secret_name, secret_value, updated_by);
        res.json(result);
    } catch (err) {
        if (err.statusCode === 404) return res.status(404).json({ ok: false, error: 'Not found', message: '未找到缓存' });
        next(err);
    }
};
