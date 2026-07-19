let ready = false;

function setRuntimeReady(value) {
    ready = Boolean(value);
}

function isRuntimeReady() {
    return ready;
}

function readinessHandler(_req, res) {
    const runtimeReady = isRuntimeReady();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(runtimeReady ? 200 : 503).json({
        status: runtimeReady ? 'ready' : 'not-ready',
        timestamp: Date.now(),
    });
}

module.exports = { isRuntimeReady, readinessHandler, setRuntimeReady };
