const axios = require('axios');
const zlib = require('zlib');
const sodium = require('libsodium-wrappers');
const Ct8Run = require('../models/Ct8Run');
const SecretCache = require('../models/SecretCache');
const AppConfig = require('../models/AppConfig');
const AppError = require('../utils/AppError');

const secretService = require('./secretService');

// Use getters to fetch the latest values dynamically
const getGhOptions = () => ({
    GH_TOKEN: secretService.getSecretSync('GH_TOKEN'),
    GH_OWNER: secretService.getSecretSync('GH_OWNER') || 'Mufenxu',
    GH_REPO: secretService.getSecretSync('GH_REPO') || 'ct8-login',
    GH_WORKFLOW: secretService.getSecretSync('GH_WORKFLOW') || 'ssh-login.yml',
    GH_REF: secretService.getSecretSync('GH_REF') || 'main'
});

// Helper: Encrypt secret using libsodium
async function encryptSecret(key, value) {
    await sodium.ready;
    const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(value);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
}

// 记录最近一次触发时间，用于计算任务真实运行时长
let _lastTriggerTime = null;
// GitHub API 查询冷却时间，避免频繁调用（每 60 秒最多查询一次）
let _lastGhApiCheckTime = 0;
const _artifactHydrateCheckedAt = new Map();

const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const resolveLoginTime = (value) => {
    if (value === undefined || value === null || value === '') {
        return new Date();
    }

    const numeric = toNumberOrNull(value);
    if (numeric !== null) {
        const ms = numeric < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(ms);
        if (!Number.isNaN(date.getTime())) return date;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const isResultSuccess = (result) => {
    if (!result || typeof result !== 'object') return false;
    if (typeof result.success === 'boolean') return result.success;
    if (typeof result.ok === 'boolean') return result.ok;

    if (typeof result.status === 'string') {
        const status = result.status.toLowerCase();
        if (['success', 'ok', 'passed', 'pass'].includes(status)) return true;
        if (['failed', 'fail', 'error'].includes(status)) return false;
    }

    if (typeof result.code === 'number') {
        return result.code === 0 || result.code === 200;
    }

    return false;
};

const resolveSummaryNumber = (value, fallback = 0) => {
    const num = toNumberOrNull(value);
    return num === null ? fallback : num;
};

const pickFirst = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
};

const looksLikeResultItem = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return ['host', 'hostname', 'server', 'ip', 'user', 'username', 'account'].some(key => value[key] !== undefined);
};

const hasResultOutcome = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return ['success', 'ok', 'status', 'code'].some(key => value[key] !== undefined);
};

const normalizeArtifactResultItem = (item, forcedSuccess) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
        return forcedSuccess === undefined ? item : { ...item, success: forcedSuccess };
    }

    return {
        host: String(item),
        success: forcedSuccess === undefined ? false : forcedSuccess
    };
};

const normalizeArtifactResults = (rawResults) => {
    if (Array.isArray(rawResults)) return rawResults;

    if (typeof rawResults === 'string') {
        const text = rawResults.trim();
        if (!text) return [];

        try {
            return normalizeArtifactResults(JSON.parse(text));
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
            const normalized = normalizeArtifactResults(rawResults[key]);
            if (normalized.length > 0) return normalized;
        }
    }

    if (Array.isArray(rawResults.success) || Array.isArray(rawResults.failed)) {
        return [
            ...(rawResults.success || []).map(item => normalizeArtifactResultItem(item, true)),
            ...(rawResults.failed || []).map(item => normalizeArtifactResultItem(item, false))
        ];
    }

    if (looksLikeResultItem(rawResults)) return [rawResults];

    const entries = Object.entries(rawResults);
    if (entries.length > 0 && entries.every(([, item]) => item && typeof item === 'object')) {
        return entries.flatMap(([key, item]) => {
            const normalized = normalizeArtifactResults(item);
            if (normalized.length > 0) {
                return normalized.map(result => {
                    if (result && typeof result === 'object' && !Array.isArray(result) && !result.host && !result.hostname && !result.server) {
                        return { host: key, ...result };
                    }
                    return result;
                });
            }
            if (hasResultOutcome(item)) return [{ host: key, ...item }];
            return [];
        });
    }

    return [];
};

const extractArtifactSummary = (body, results) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { total: results.length };
    }

    const statsSource = pickFirst(body.stats, body.summary, body.result?.stats, body.data?.stats, {});
    const success = toNumberOrNull(pickFirst(
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
    const failed = toNumberOrNull(pickFirst(
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
    const total = toNumberOrNull(pickFirst(
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

    return {
        total: total !== null ? total : ((success !== null && failed !== null) ? success + failed : results.length),
        success,
        failed,
        status: pickFirst(body.status, body.conclusion, body.workflow_conclusion, body.workflowConclusion, statsSource.status),
        workflow_conclusion: pickFirst(body.workflow_conclusion, body.workflowConclusion, body.conclusion)
    };
};

const formatRunForClient = (run) => {
    if (!run) return run;

    const total = run.stats?.total || 0;
    const hasDetails = Array.isArray(run.details) && run.details.length > 0;
    const inferredMissingCallback = !run.callback_status && run.status === 'success' && total === 0 && !hasDetails;

    return {
        ...run,
        auto_resolved: run.auto_resolved || inferredMissingCallback,
        callback_status: inferredMissingCallback ? 'missing' : run.callback_status,
        total_accounts: total,
        success_count: run.stats?.success || 0,
        failed_count: run.stats?.failed || 0
    };
};

const findEndOfCentralDirectory = (buffer) => {
    const signature = 0x06054b50;
    const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
    for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
        if (buffer.readUInt32LE(offset) === signature) return offset;
    }
    return -1;
};

const unzipEntries = (buffer) => {
    const entries = [];
    const eocdOffset = findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0) return entries;

    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
    const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
    let offset = centralDirOffset;
    const end = centralDirOffset + centralDirSize;

    while (offset + 46 <= end && buffer.readUInt32LE(offset) === 0x02014b50) {
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const nameStart = offset + 46;
        const fileName = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');

        if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
            const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
            let content = null;

            if (method === 0) {
                content = compressed;
            } else if (method === 8) {
                content = zlib.inflateRawSync(compressed);
            }

            if (content) entries.push({ name: fileName, content });
        }

        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
};

const parseArtifactContent = (content) => {
    const text = content.toString('utf8').trim();
    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        const results = normalizeArtifactResults(parsed);
        return { results, summary: extractArtifactSummary(parsed, results) };
    } catch (_) {
        const results = normalizeArtifactResults(text);
        return results.length > 0 ? { results, summary: { total: results.length } } : null;
    }
};

const fetchWorkflowRunArtifactResults = async (runId, options) => {
    const { GH_TOKEN, GH_OWNER, GH_REPO } = options;
    const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28'
    };

    const listUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${runId}/artifacts?per_page=20`;
    const listResp = await axios.get(listUrl, { headers, timeout: 8000 });
    const artifacts = listResp.data?.artifacts || [];
    const artifact = artifacts.find(item => /ssh|result|ct8|login/i.test(item.name)) || artifacts[0];
    if (!artifact) return null;

    const archiveUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/artifacts/${artifact.id}/zip`;
    const archiveResp = await axios.get(archiveUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 12000,
        maxRedirects: 5
    });
    const zipBuffer = Buffer.from(archiveResp.data);
    const entries = unzipEntries(zipBuffer)
        .filter(entry => !entry.name.endsWith('/'))
        .sort((a, b) => {
            const score = (name) => (/json$/i.test(name) ? 0 : /result|ssh|ct8|login/i.test(name) ? 1 : 2);
            return score(a.name) - score(b.name);
        });

    for (const entry of entries) {
        const parsed = parseArtifactContent(entry.content);
        if (parsed && (parsed.results.length > 0 || (parsed.summary && parsed.summary.total > 0))) {
            return {
                artifact_name: artifact.name,
                file_name: entry.name,
                ...parsed
            };
        }
    }

    return null;
};

exports.getDefaultWorkflowName = () => getGhOptions().GH_WORKFLOW || 'ssh-login.yml';

exports.triggerAction = async (ip, inputs = {}) => {
    const { GH_TOKEN, GH_OWNER, GH_REPO, GH_WORKFLOW, GH_REF } = getGhOptions();

    if (!GH_TOKEN) {
        throw new AppError('Server not configured: GH_TOKEN missing', 500);
    }

    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;

    try {
        const payload = { ref: GH_REF };
        if (Object.keys(inputs).length > 0) {
            payload.inputs = inputs;
        }

        await axios.post(url, payload, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${GH_TOKEN}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        _lastTriggerTime = new Date();
        
        // 云端状态同步：设置全局运行中状态
        await AppConfig.findOneAndUpdate(
            { key: 'CT8_ACTIVE_TASK' },
            { value: { status: 'running', start_time: _lastTriggerTime.getTime() } },
            { upsert: true }
        );

        return { ok: true, status: 204 };
    } catch (error) {
        if (error.response && error.response.data) {
            const detail = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
            console.error(`[GitHub API Error] Status: ${error.response.status}, Detail: ${detail}`);
            
            // 提取关键错误信息
            let msg = error.response.data.message || error.message;
            if (error.response.data.errors) {
                msg += ': ' + error.response.data.errors.map(e => e.message || JSON.stringify(e)).join(', ');
            }
            throw new AppError(`GitHub任务触发失败: ${msg}`, error.response.status);
        }
        throw new AppError(error.message, error.response ? error.response.status : 500);
    }
};

exports.saveCallback = async (run_id, workflow, results, started_at, summary = {}) => {
    const normalizedRunId = String(run_id);
    const normalizedWorkflow = workflow || exports.getDefaultWorkflowName() || 'unknown';
    const safeResults = Array.isArray(results) ? results : [];

    let detailSuccessCount = 0;
    let detailFailedCount = 0;

    const details = safeResults.map(rawResult => {
        const r = rawResult && typeof rawResult === 'object'
            ? rawResult
            : { host: rawResult === undefined || rawResult === null ? '' : String(rawResult), success: false };
        const isSuccess = isResultSuccess(r);
        if (isSuccess) detailSuccessCount++; else detailFailedCount++;

        return {
            host: r.host || r.hostname || r.server || r.ip,
            user: r.user || r.username || r.account,
            port: toNumberOrNull(r.port) || 22,
            ipify_ip: r.ipify_ip || r.ipifyIp,
            out_ip: r.out_ip || r.outIp || r.public_ip || r.publicIp,
            proxy: r.proxy || r.proxy_url || r.proxyUrl,
            expiry_text: r.expiry_text || r.expiryText || r.expire_text,
            expiry_unix: toNumberOrNull(r.expiry_unix ?? r.expiryUnix ?? r.expire_unix),
            success: isSuccess,
            login_time: resolveLoginTime(r.time ?? r.login_time ?? r.loginTime ?? r.timestamp)
        };
    });

    const summarySuccess = toNumberOrNull(summary.success);
    const summaryFailed = toNumberOrNull(summary.failed);
    const summaryTotal = toNumberOrNull(summary.total);
    const hasDetails = details.length > 0;
    const successCount = hasDetails ? detailSuccessCount : resolveSummaryNumber(summarySuccess, 0);
    const failedCount = hasDetails ? detailFailedCount : resolveSummaryNumber(summaryFailed, 0);
    const total = hasDetails
        ? details.length
        : resolveSummaryNumber(
            summaryTotal,
            (summarySuccess !== null && summaryFailed !== null) ? successCount + failedCount : 0
        );
    const status = total === 0
        ? 'failed'
        : (failedCount === 0 ? 'success' : (successCount === 0 ? 'failed' : 'partial'));
    const callbackStatus = total === 0 ? 'empty' : 'received';

    // 确定 start_time: 优先用回调传入的 started_at，其次用存储的触发时间
    const parsedStartTime = started_at ? new Date(started_at) : null;
    const startTime = (parsedStartTime && !Number.isNaN(parsedStartTime.getTime()))
        ? parsedStartTime
        : (_lastTriggerTime || new Date());
    if (_lastTriggerTime) _lastTriggerTime = null;

    let run;
    try {
        run = await Ct8Run.findOneAndUpdate(
            { run_id: normalizedRunId },
            {
                $set: {
                    workflow: normalizedWorkflow,
                    status,
                    end_time: new Date(),
                    stats: { total, success: successCount, failed: failedCount },
                    details,
                    auto_resolved: false,
                    callback_status: callbackStatus,
                    callback_received_at: new Date(),
                    workflow_conclusion: summary.workflow_conclusion || summary.status
                },
                $unset: {
                    callback_error: ''
                },
                $setOnInsert: {
                    start_time: startTime
                }
            },
            { upsert: true, new: true }
        );
    } finally {
        // 云端状态同步：任务完成后务必尝试重置全局状态，避免前端一直显示运行中
        await AppConfig.findOneAndUpdate(
            { key: 'CT8_ACTIVE_TASK' },
            { value: { status: 'idle', start_time: 0 } },
            { upsert: true }
        ).catch((error) => {
            console.error('[CT8_ACTIVE_TASK] reset failed:', error.message);
        });
    }

    return {
        run_id: normalizedRunId,
        stats: run?.stats || { total, success: successCount, failed: failedCount }
    };
};

exports.getRuns = async (limit = 10) => {
    const runs = await Ct8Run.find()
        .select('-details')
        .sort({ create_time: -1 })
        .limit(limit)
        .lean(); // Use lean for performance

    return runs.map(formatRunForClient);
};

exports.getRunById = async (run_id) => {
    const run = await Ct8Run.findOne({ run_id }).lean();
    return formatRunForClient(run);
};

exports.getLatestRun = async () => {
    const run = await Ct8Run.findOne().sort({ create_time: -1 }).lean();
    return formatRunForClient(run);
};

const shouldHydrateRunFromArtifacts = (run) => {
    if (!run || !run.run_id) return false;
    const total = run.stats?.total || 0;
    const hasDetails = Array.isArray(run.details) && run.details.length > 0;
    return (
        run.callback_status === 'missing' ||
        run.callback_status === 'empty' ||
        (!run.callback_status && run.status === 'success' && total === 0 && !hasDetails)
    );
};

exports.tryHydrateRunFromArtifacts = async (runOrId) => {
    const run = typeof runOrId === 'string'
        ? await Ct8Run.findOne({ run_id: runOrId }).lean()
        : runOrId;

    if (!shouldHydrateRunFromArtifacts(run)) return formatRunForClient(run);

    const runId = String(run.run_id);
    const lastCheckedAt = _artifactHydrateCheckedAt.get(runId) || 0;
    if (Date.now() - lastCheckedAt < 60 * 1000) return formatRunForClient(run);
    _artifactHydrateCheckedAt.set(runId, Date.now());

    const { GH_TOKEN, GH_OWNER, GH_REPO } = getGhOptions();
    if (!GH_TOKEN) return formatRunForClient(run);

    try {
        const artifactPayload = await fetchWorkflowRunArtifactResults(runId, { GH_TOKEN, GH_OWNER, GH_REPO });
        if (!artifactPayload) return formatRunForClient(run);

        console.log(`[CT8 Artifact] GitHub run ${runId} loaded ${artifactPayload.results.length} result(s) from ${artifactPayload.artifact_name}/${artifactPayload.file_name}`);
        await exports.saveCallback(
            runId,
            run.workflow || exports.getDefaultWorkflowName(),
            artifactPayload.results,
            run.start_time,
            {
                ...(artifactPayload.summary || {}),
                workflow_conclusion: run.workflow_conclusion || 'success'
            }
        );

        return await exports.getRunById(runId);
    } catch (err) {
        console.error(`[CT8 Artifact] hydrate failed for run ${runId}:`, err.message);
        await Ct8Run.findOneAndUpdate(
            { run_id: runId },
            { $set: { callback_error: `Artifact hydrate failed: ${err.message}` } }
        ).catch(() => {});
        return formatRunForClient(run);
    }
};

exports.hydrateLatestMissingRun = async () => {
    const run = await Ct8Run.findOne().sort({ create_time: -1 }).lean();
    return await exports.tryHydrateRunFromArtifacts(run);
};

exports.getActiveTask = async () => {
    const config = await AppConfig.findOne({ key: 'CT8_ACTIVE_TASK' }).lean();
    return config ? config.value : { status: 'idle', start_time: 0 };
};

/**
 * 主动查询 GitHub API 检查 workflow run 状态
 * 当 activeTask 运行超过指定时间后触发，解决 webhook 回调丢失的问题
 * @param {object} activeTask - 当前 activeTask 状态
 * @param {number} staleThresholdMs - 超过此时间（毫秒）才主动查询，默认 2 分钟
 * @returns {object} 可能更新后的 activeTask
 */
exports.checkAndResolveActiveTask = async (activeTask, staleThresholdMs = 2 * 60 * 1000) => {
    if (!activeTask || activeTask.status !== 'running') return activeTask;

    const startTime = activeTask.start_time || 0;
    const elapsed = Date.now() - startTime;
    if (elapsed < staleThresholdMs) return activeTask;

    // 冷却检查：距上次 GitHub API 查询不足 60 秒则跳过，避免轮询时频繁调用
    const now = Date.now();
    if (now - _lastGhApiCheckTime < 60 * 1000) return activeTask;
    _lastGhApiCheckTime = now;

    const { GH_TOKEN, GH_OWNER, GH_REPO, GH_WORKFLOW } = getGhOptions();
    if (!GH_TOKEN) return activeTask;

    try {
        // 查询最近的 workflow runs。不要只查 completed，否则当前 run 仍在 queued/in_progress 时，
        // 可能会把上一次刚完成的 run 误判为这次任务完成。
        const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs?per_page=5`;
        const resp = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${GH_TOKEN}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            timeout: 8000
        });

        const runs = resp.data?.workflow_runs || [];
        if (runs.length === 0) return activeTask;

        // 找到本轮 run：如果之前已识别 run_id，就只认这个 run；否则按触发时间窗口找最新 run。
        const triggerDate = new Date(startTime);
        const activeRunId = activeTask.run_id ? String(activeTask.run_id) : '';
        const matchedRun = activeRunId
            ? runs.find(run => String(run.id) === activeRunId)
            : runs.find(run => {
                const runCreated = new Date(run.created_at);
                // run 的创建时间应该在触发时间附近（前后 30 秒内）或之后
                return runCreated >= new Date(triggerDate.getTime() - 30000);
            });

        if (matchedRun && matchedRun.status !== 'completed') {
            console.log(`[CT8 Auto-Resolve] GitHub run ${matchedRun.id} 仍在 ${matchedRun.status}，保持 activeTask running`);
            const runningState = {
                ...activeTask,
                status: 'running',
                run_id: String(matchedRun.id),
                github_status: matchedRun.status,
                workflow_conclusion: matchedRun.conclusion || null,
                html_url: matchedRun.html_url
            };
            await AppConfig.findOneAndUpdate(
                { key: 'CT8_ACTIVE_TASK' },
                { value: runningState },
                { upsert: true }
            ).catch(() => {});
            return runningState;
        }

        if (matchedRun && matchedRun.status === 'completed') {
            const runId = String(matchedRun.id);
            const conclusion = matchedRun.conclusion; // 'success', 'failure', etc.

            console.log(`[CT8 Auto-Resolve] GitHub run ${runId} 已完成 (${conclusion})，主动重置 activeTask`);
            const artifactPayload = await fetchWorkflowRunArtifactResults(runId, { GH_TOKEN, GH_OWNER, GH_REPO }).catch(err => {
                console.warn(`[CT8 Auto-Resolve] artifact fetch failed for run ${runId}: ${err.message}`);
                return null;
            });

            if (artifactPayload && (artifactPayload.results.length > 0 || artifactPayload.summary?.total > 0)) {
                await exports.saveCallback(
                    runId,
                    matchedRun.name || GH_WORKFLOW,
                    artifactPayload.results,
                    matchedRun.run_started_at || matchedRun.created_at,
                    {
                        ...(artifactPayload.summary || {}),
                        workflow_conclusion: conclusion
                    }
                );
            }

            // 检查是否已有此 run 的记录（可能 callback 只是延迟到达）
            const existingRun = await Ct8Run.findOne({ run_id: runId }).lean();
            if (!existingRun) {
                // 如果没有记录，创建一条基础记录（无详细 details，等 callback 补充）
                await Ct8Run.findOneAndUpdate(
                    { run_id: runId },
                    {
                        $set: {
                            workflow: matchedRun.name || GH_WORKFLOW,
                            status: conclusion === 'success' ? 'success' : 'failed',
                            end_time: new Date(matchedRun.updated_at),
                            stats: { total: 0, success: 0, failed: 0 },
                            details: [],
                            auto_resolved: true,
                            callback_status: 'missing',
                            callback_error: 'GitHub workflow completed, but no CT8 callback payload has been saved yet.',
                            workflow_conclusion: conclusion
                        },
                        $setOnInsert: {
                            start_time: new Date(matchedRun.run_started_at || matchedRun.created_at)
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            // 重置 activeTask
            const idleState = { status: 'idle', start_time: 0 };
            await AppConfig.findOneAndUpdate(
                { key: 'CT8_ACTIVE_TASK' },
                { value: idleState },
                { upsert: true }
            );

            return idleState;
        }

        return activeTask;
    } catch (err) {
        console.error('[CT8 Auto-Resolve] 查询 GitHub API 失败:', err.message);
        // 查询失败不影响正常流程，返回原始状态，不能因为网络/API 波动把仍在跑的任务标成结束。
        return activeTask;
    }
};

exports.updateSecret = async (action, secret_name, value) => {
    const targetSecretName = secret_name || 'USERS_LIST';
    const { GH_TOKEN, GH_OWNER, GH_REPO } = getGhOptions();

    // Get Secret Check
    if (action === 'get') {
        const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/secrets/${targetSecretName}`;
        try {
            await axios.get(url, {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            return { ok: true, secret: { name: targetSecretName }, message: 'Secret exists' };
        } catch (err) {
            if (err.response && err.response.status === 404) {
                return { ok: false, message: `Secret '${targetSecretName}' not found`, notFound: true };
            }
            throw err;
        }
    }

    if (action !== 'update' && action !== 'append') {
        throw new AppError('Invalid action', 400);
    }

    if (!value) {
        throw new AppError('Value is required', 400);
    }

    // Update Secret Logic
    const keyUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/secrets/public-key`;
    const keyResp = await axios.get(keyUrl, {
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GH_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    const publicKey = keyResp.data.key;
    const keyId = keyResp.data.key_id;
    const encryptedValue = await encryptSecret(publicKey, value);

    const updateUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/secrets/${targetSecretName}`;
    const updateResp = await axios.put(updateUrl, {
        encrypted_value: encryptedValue,
        key_id: keyId
    }, {
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GH_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    return {
        ok: true,
        status: updateResp.status,
        message: updateResp.status === 201 ? 'Secret created' : 'Secret updated',
        secret_name: targetSecretName
    };
};

exports.manageSecretCache = async (action, secret_name, secret_value, updated_by) => {
    if (!secret_name) throw new AppError('secret_name is required', 400);

    if (action === 'get') {
        const cache = await SecretCache.findOne({ secret_name }).lean();
        if (cache) {
            return {
                ok: true,
                data: {
                    secret_name: cache.secret_name,
                    value: cache.secret_value,
                    updated_at: cache.updated_at,
                    updated_by: cache.updated_by
                }
            };
        } else {
            throw new AppError('Cache not found', 404);
        }
    } else if (action === 'set') {
        if (!secret_value) throw new AppError('secret_value is required', 400);

        const result = await SecretCache.findOneAndUpdate(
            { secret_name },
            { secret_value, updated_by: updated_by || 'unknown' },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return {
            ok: true,
            action: result.create_time === result.updated_at ? 'created' : 'updated',
        };

    } else if (action === 'delete') {
        await SecretCache.deleteOne({ secret_name });
        return { ok: true };
    } else {
        throw new AppError('Invalid action', 400);
    }
};
