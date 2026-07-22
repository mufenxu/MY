class CommandConfirmationError extends Error {
    constructor(message, state) {
        super(message);
        this.name = 'CommandConfirmationError';
        this.state = state;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCommandConfirmation({
    commandId,
    requestStatus,
    onStatus = () => {},
    isActive = () => true,
    delay = sleep,
    now = () => Date.now(),
    pollIntervalMs = 1500,
    timeoutMs = 36000,
    forceRefreshEvery = 3,
}) {
    if (!commandId || typeof requestStatus !== 'function') {
        throw new CommandConfirmationError('控制请求缺少确认信息', 'invalid');
    }

    const startedAt = now();
    let attempt = 0;
    let lastError = null;

    while (now() - startedAt < timeoutMs) {
        await delay(pollIntervalMs);
        if (!isActive()) {
            throw new CommandConfirmationError('页面已离开，停止等待设备确认', 'cancelled');
        }

        const forceRefresh = attempt > 0 && attempt % forceRefreshEvery === forceRefreshEvery - 1;
        attempt += 1;
        try {
            const response = await requestStatus({ forceRefresh, attempt });
            if (!response?.success || !response.result) {
                throw new Error(response?.error || response?.message || '设备状态查询失败');
            }

            onStatus(response.result);
            const command = response.result.command || response.result.lastCommand;
            if (!command || command.commandId !== commandId) continue;
            if (command.state === 'confirmed') return command;
            if (command.state === 'rejected') {
                throw new CommandConfirmationError(command.error || '设备拒绝执行控制指令', 'rejected');
            }
            if (command.state === 'timed_out') {
                throw new CommandConfirmationError('设备未在规定时间内确认指令', 'timed_out');
            }
        } catch (error) {
            if (error instanceof CommandConfirmationError) throw error;
            lastError = error;
        }
    }

    throw new CommandConfirmationError(
        lastError?.message || '设备未在规定时间内确认指令',
        'timed_out',
    );
}

module.exports = {
    CommandConfirmationError,
    waitForCommandConfirmation,
};
