function closeHttpServer(server, { timeoutMs = 10000, onForce = () => {} } = {}) {
    if (!server) {
        return Promise.resolve();
    }

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
        }, timeoutMs);
        forceTimer.unref?.();

        server.close(finish);
        server.closeIdleConnections?.();
    });
}

module.exports = { closeHttpServer };
