const githubService = require('../services/githubService');
const {
    extractWorkflowSummary,
    normalizeWorkflowResults,
    pickFirst
} = require('../utils/githubResultParser');
const { parseBodyObject } = require('../utils/parseBodyObject');

const RATE_LIMIT_IP_WINDOW_MS = 60_000;
const RATE_LIMIT_GLOBAL_WINDOW_MS = 30_000;
const rateLimit = { ip: new Map(), global: 0 };

function pruneRateLimitIps(now) {
    for (const [ip, timestamp] of rateLimit.ip) {
        if (now - timestamp >= RATE_LIMIT_IP_WINDOW_MS) rateLimit.ip.delete(ip);
    }
}

exports.triggerAction = async (req, res, next) => {
    try {
        const ip = req.ip;
        const now = Date.now();

        if (rateLimit.ip.has(ip) && (now - rateLimit.ip.get(ip) < RATE_LIMIT_IP_WINDOW_MS)) {
            const remaining = Math.ceil((RATE_LIMIT_IP_WINDOW_MS - (now - rateLimit.ip.get(ip))) / 1000);
            return res.status(429).json({ error: 'Too Many Requests', message: `请等待 ${remaining} 秒后再试` });
        }

        if (now - rateLimit.global < RATE_LIMIT_GLOBAL_WINDOW_MS) {
            const remaining = Math.ceil((RATE_LIMIT_GLOBAL_WINDOW_MS - (now - rateLimit.global)) / 1000);
            return res.status(429).json({ error: 'Too Many Requests', message: `系统繁忙，请等待 ${remaining} 秒` });
        }

        pruneRateLimitIps(now);
        rateLimit.ip.set(ip, now);
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
        const results = normalizeWorkflowResults(rawResults);
        const summary = extractWorkflowSummary(mergedBody, results, {
            missingValue: undefined,
            includeNestedStatus: true
        });

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
        const { action, secret_name, secret_value } = req.body;
        const updatedBy = req.user && (req.user.userId || req.user._id || req.user.id);
        const result = await githubService.manageSecretCache(action, secret_name, secret_value, updatedBy || 'unknown');
        res.json(result);
    } catch (err) {
        if (err.statusCode === 404) return res.status(404).json({ ok: false, error: 'Not found', message: '未找到缓存' });
        next(err);
    }
};

exports.listRepositories = async (req, res, next) => {
    try {
        const repositories = await githubService.listRepositories();
        res.json({ ok: true, repositories });
    } catch (err) {
        next(err);
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        const profile = await githubService.getProfile();
        res.json({ ok: true, profile });
    } catch (err) {
        next(err);
    }
};

exports.updateRepositoryVisibility = async (req, res, next) => {
    try {
        const { owner, repo } = req.params;
        const visibility = String((req.body && req.body.visibility) || '').trim();
        const repository = await githubService.updateRepositoryVisibility(owner, repo, visibility);
        res.json({ ok: true, repository });
    } catch (err) {
        next(err);
    }
};
exports.listRepositoryReleases = async (req, res, next) => {
    try {
        const { owner, repo } = req.params;
        const releases = await githubService.listReleases(owner, repo);
        res.json({ ok: true, releases });
    } catch (err) {
        next(err);
    }
};

exports.createRepositoryRelease = async (req, res, next) => {
    try {
        const { owner, repo } = req.params;
        const release = await githubService.createRelease(owner, repo, req.body || {});
        res.json({ ok: true, release });
    } catch (err) {
        next(err);
    }
};
