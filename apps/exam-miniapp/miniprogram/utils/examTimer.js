function getServerClockOffset(serverNow, localNow) {
    const currentLocalTime = localNow === undefined ? Date.now() : localNow;
    const serverTime = new Date(serverNow).getTime();
    return Number.isFinite(serverTime) ? serverTime - currentLocalTime : 0;
}

function getRemainingSeconds(deadlineAt, serverClockOffsetMs, localNow) {
    const offset = serverClockOffsetMs === undefined ? 0 : serverClockOffsetMs;
    const currentLocalTime = localNow === undefined ? Date.now() : localNow;
    const deadline = new Date(deadlineAt).getTime();
    if (!Number.isFinite(deadline) || deadline <= 0) {
        return 0;
    }

    return Math.max(0, Math.ceil((deadline - (currentLocalTime + offset)) / 1000));
}

module.exports = { getRemainingSeconds, getServerClockOffset };
