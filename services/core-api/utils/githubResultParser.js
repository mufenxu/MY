const RESULT_IDENTITY_KEYS = ['host', 'hostname', 'server', 'ip', 'user', 'username', 'account'];
const RESULT_OUTCOME_KEYS = ['success', 'ok', 'status', 'code'];
const RESULT_ARRAY_KEYS = [
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

const pickFirst = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
};

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasAnyKey = (value, keys) => isObject(value) && keys.some((key) => value[key] !== undefined);

const normalizeResultItem = (item, forcedSuccess) => {
    if (isObject(item)) {
        return forcedSuccess === undefined ? item : { ...item, success: forcedSuccess };
    }

    return {
        host: String(item),
        success: forcedSuccess === undefined ? false : forcedSuccess
    };
};

const parseResultLines = (text) => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const parsed = [];
    for (const line of lines) {
        try {
            const value = JSON.parse(line);
            if (isObject(value)) parsed.push(value);
        } catch (_) {
            return [];
        }
    }
    return parsed;
};

const normalizeWorkflowResults = (rawResults) => {
    if (Array.isArray(rawResults)) return rawResults;

    if (typeof rawResults === 'string') {
        const text = rawResults.trim();
        if (!text) return [];

        try {
            return normalizeWorkflowResults(JSON.parse(text));
        } catch (_) {
            return parseResultLines(text);
        }
    }

    if (!isObject(rawResults)) return [];

    for (const key of RESULT_ARRAY_KEYS) {
        if (rawResults[key] !== undefined && rawResults[key] !== rawResults) {
            const normalized = normalizeWorkflowResults(rawResults[key]);
            if (normalized.length > 0) return normalized;
        }
    }

    if (Array.isArray(rawResults.success) || Array.isArray(rawResults.failed)) {
        return [
            ...(rawResults.success || []).map((item) => normalizeResultItem(item, true)),
            ...(rawResults.failed || []).map((item) => normalizeResultItem(item, false))
        ];
    }

    if (hasAnyKey(rawResults, RESULT_IDENTITY_KEYS)) return [rawResults];

    const entries = Object.entries(rawResults);
    if (entries.length === 0 || !entries.every(([, item]) => isObject(item))) return [];

    return entries.flatMap(([key, item]) => {
        const normalized = normalizeWorkflowResults(item);
        if (normalized.length > 0) {
            return normalized.map((result) => {
                if (isObject(result) && !result.host && !result.hostname && !result.server) {
                    return { host: key, ...result };
                }
                return result;
            });
        }
        return hasAnyKey(item, RESULT_OUTCOME_KEYS) ? [{ host: key, ...item }] : [];
    });
};

const finiteNumber = (value, missingValue) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : missingValue;
};

const extractWorkflowSummary = (body, results, options = {}) => {
    const missingValue = Object.prototype.hasOwnProperty.call(options, 'missingValue')
        ? options.missingValue
        : null;
    const includeNestedStatus = options.includeNestedStatus === true;
    const source = isObject(body) ? body : {};
    const statsSource = pickFirst(source.stats, source.summary, source.result?.stats, source.data?.stats, {});
    const success = finiteNumber(pickFirst(
        source.success_count,
        source.successCount,
        source.success,
        source.result?.success_count,
        source.result?.successCount,
        source.result?.success,
        source.data?.success_count,
        source.data?.successCount,
        source.data?.success,
        statsSource.success_count,
        statsSource.successCount,
        statsSource.success
    ), missingValue);
    const failed = finiteNumber(pickFirst(
        source.failed_count,
        source.failedCount,
        source.fail_count,
        source.failCount,
        source.failed,
        source.fail,
        source.result?.failed_count,
        source.result?.failedCount,
        source.result?.fail_count,
        source.result?.failCount,
        source.result?.failed,
        source.result?.fail,
        source.data?.failed_count,
        source.data?.failedCount,
        source.data?.fail_count,
        source.data?.failCount,
        source.data?.failed,
        source.data?.fail,
        statsSource.failed_count,
        statsSource.failedCount,
        statsSource.fail_count,
        statsSource.failCount,
        statsSource.failed,
        statsSource.fail
    ), missingValue);
    const total = finiteNumber(pickFirst(
        source.total_accounts,
        source.totalAccounts,
        source.total,
        source.count,
        source.result?.total_accounts,
        source.result?.totalAccounts,
        source.result?.total,
        source.result?.count,
        source.data?.total_accounts,
        source.data?.totalAccounts,
        source.data?.total,
        source.data?.count,
        statsSource.total_accounts,
        statsSource.totalAccounts,
        statsSource.total,
        statsSource.count
    ), missingValue);
    const hasSuccess = success !== missingValue;
    const hasFailed = failed !== missingValue;

    return {
        total: total !== missingValue ? total : (hasSuccess && hasFailed ? success + failed : results.length),
        success,
        failed,
        status: pickFirst(
            source.status,
            source.conclusion,
            source.workflow_conclusion,
            source.workflowConclusion,
            ...(includeNestedStatus ? [source.result?.status, source.data?.status] : []),
            statsSource.status
        ),
        workflow_conclusion: pickFirst(
            source.workflow_conclusion,
            source.workflowConclusion,
            source.conclusion,
            ...(includeNestedStatus ? [source.run?.conclusion, source.workflow_run?.conclusion] : [])
        )
    };
};

module.exports = {
    extractWorkflowSummary,
    normalizeWorkflowResults,
    pickFirst
};
