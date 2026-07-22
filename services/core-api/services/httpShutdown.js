function boundedTimeout(value, fallback = 15_000) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(60_000, Math.max(1_000, parsed));
}

function closeHttpServer(server, { timeoutMs = 15_000, onForce = () => {} } = {}) {
    const timeout = boundedTimeout(timeoutMs);
    return new Promise((resolve, reject) => {
        let completed = false;
        const finish = (error) => {
            if (completed) return;
            completed = true;
            clearTimeout(forceTimer);
            if (error) reject(error);
            else resolve();
        };
        const forceTimer = setTimeout(() => {
            onForce();
            server.closeAllConnections?.();
        }, timeout);
        forceTimer.unref?.();

        server.close(finish);
        server.closeIdleConnections?.();
    });
}

function withDeadline(promise, {
    timeoutMs = 15_000,
    message = 'Operation exceeded its shutdown deadline',
} = {}) {
    const timeout = boundedTimeout(timeoutMs);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeout);
        timer.unref?.();
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

module.exports = {
    boundedTimeout,
    closeHttpServer,
    withDeadline,
};
